import crypto from 'crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('Sumsub');

// Sumsub API configuration
const SUMSUB_BASE_URL = 'https://api.sumsub.com';
const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN || '';
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY || '';
const SUMSUB_LEVEL_NAME = process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level';
const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET || '';

interface SumsubApplicant {
    id: string;
    createdAt: string;
    externalUserId: string;
    email?: string;
    review?: {
        reviewStatus: string;
        reviewResult?: {
            reviewAnswer: 'GREEN' | 'RED';
            rejectLabels?: string[];
            moderationComment?: string;
        };
    };
}

interface SumsubAccessToken {
    token: string;
    userId: string;
}

/**
 * Generate HMAC signature for Sumsub API requests
 */
function generateSignature(
    method: string,
    path: string,
    timestamp: number,
    body?: string
): string {
    const data = timestamp + method.toUpperCase() + path + (body || '');
    return crypto
        .createHmac('sha256', SUMSUB_SECRET_KEY)
        .update(data)
        .digest('hex');
}

/**
 * Make authenticated request to Sumsub API
 */
async function sumsubRequest<T>(
    method: string,
    path: string,
    body?: object
): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyString = body ? JSON.stringify(body) : undefined;
    const signature = generateSignature(method, path, timestamp, bodyString);

    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'X-App-Token': SUMSUB_APP_TOKEN,
        'X-App-Access-Ts': timestamp.toString(),
        'X-App-Access-Sig': signature,
    };

    if (body) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${SUMSUB_BASE_URL}${path}`, {
        method,
        headers,
        body: bodyString,
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error('Sumsub API error', { 
            status: response.status, 
            error: errorText,
            path 
        });
        throw new Error(`Sumsub API error: ${response.status} - ${errorText}`);
    }

    return response.json();
}

/**
 * Create a new applicant in Sumsub
 */
async function createApplicant(
    externalUserId: string,
    email?: string
): Promise<SumsubApplicant> {
    logger.info('Creating Sumsub applicant', { externalUserId });

    const body: Record<string, unknown> = {
        externalUserId,
        levelName: SUMSUB_LEVEL_NAME,
    };

    if (email) {
        body.email = email;
    }

    const applicant = await sumsubRequest<SumsubApplicant>(
        'POST',
        '/resources/applicants?levelName=' + encodeURIComponent(SUMSUB_LEVEL_NAME),
        body
    );

    logger.info('Applicant created', { applicantId: applicant.id });
    return applicant;
}

/**
 * Generate an access token for the mobile SDK
 */
async function generateAccessToken(
    applicantId: string,
    externalUserId: string
): Promise<SumsubAccessToken> {
    logger.info('Generating access token', { applicantId });

    const path = `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(SUMSUB_LEVEL_NAME)}`;
    
    const result = await sumsubRequest<SumsubAccessToken>('POST', path);

    logger.info('Access token generated');
    return result;
}

/**
 * Get applicant status from Sumsub
 */
async function getApplicantStatus(applicantId: string): Promise<SumsubApplicant> {
    logger.debug('Fetching applicant status', { applicantId });

    const applicant = await sumsubRequest<SumsubApplicant>(
        'GET',
        `/resources/applicants/${applicantId}/one`
    );

    return applicant;
}

/**
 * Get applicant by external user ID
 */
async function getApplicantByExternalId(externalUserId: string): Promise<SumsubApplicant | null> {
    logger.debug('Fetching applicant by external ID', { externalUserId });

    try {
        const applicant = await sumsubRequest<SumsubApplicant>(
            'GET',
            `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`
        );
        return applicant;
    } catch (error) {
        // Applicant not found is not an error
        logger.debug('Applicant not found', { externalUserId });
        return null;
    }
}

/**
 * Verify webhook signature from Sumsub
 */
function verifyWebhookSignature(
    payload: string,
    signature: string
): boolean {
    if (!SUMSUB_WEBHOOK_SECRET) {
        logger.warn('Webhook secret not configured');
        return false;
    }

    const expectedSignature = crypto
        .createHmac('sha256', SUMSUB_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

/**
 * Map Sumsub review status to our KYC status
 */
function mapReviewToKycStatus(
    reviewStatus: string,
    reviewAnswer?: 'GREEN' | 'RED'
): 'pending' | 'approved' | 'rejected' | 'retry_required' {
    if (reviewAnswer === 'GREEN') {
        return 'approved';
    }
    
    if (reviewAnswer === 'RED') {
        // Could add logic here to check for retry-able rejections
        return 'rejected';
    }

    switch (reviewStatus?.toLowerCase()) {
        case 'completed':
            return 'approved';
        case 'pending':
        case 'init':
        case 'prechecked':
            return 'pending';
        case 'onhold':
            return 'retry_required';
        default:
            return 'pending';
    }
}

export const SumsubService = {
    createApplicant,
    generateAccessToken,
    getApplicantStatus,
    getApplicantByExternalId,
    verifyWebhookSignature,
    mapReviewToKycStatus,
};

export default SumsubService;
