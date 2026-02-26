import { createLogger } from '../utils/logger';
import crypto from 'crypto';

const logger = createLogger('DiditService');

const DIDIT_API_URL = process.env.DIDIT_API_URL || 'https://verification.didit.me/v3';

interface CreateSessionParams {
  userId: string;
  email: string;
  vendorData?: string;
}

interface DiditSession {
  id: string;
  url: string;
  status: string;
}

interface DiditCreateSessionResponse {
  session_id: string;
  id?: string;
  redirect_url?: string;
  url?: string;
  session_url?: string;
  verification_url?: string;
  link?: string;
  session?: {
    id?: string;
    url?: string;
    redirect_url?: string;
    session_url?: string;
    verification_url?: string;
    link?: string;
    status?: string;
  };
  status: string;
}

interface DiditGetSessionResponse {
  status: string;
  decision?: string;
  verification?: {
    status?: string;
    decision?: string;
  };
  result?: {
    status?: string;
    decision?: string;
  };
}

interface DiditAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

class DiditService {
  private apiKey: string;
  private clientId: string;
  private clientSecret: string;
  private workflowId: string;
  private webhookSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private callbackUrl: string;

  constructor() {
    // Support both new and legacy env names.
    this.apiKey = process.env.DIDIT_API_KEY || '';
    this.clientId = process.env.DIDIT_CLIENT_ID || process.env.DIDIT_APP_ID || '';
    this.clientSecret = process.env.DIDIT_CLIENT_SECRET || process.env.DIDIT_API_KEY || '';
    this.workflowId = process.env.DIDIT_WORKFLOW_ID || '';
    this.webhookSecret = process.env.DIDIT_WEBHOOK_SECRET || '';
    const baseUrl =
      (process.env.PUBLIC_BASE_URL || process.env.EXPO_PUBLIC_API_URL || 'https://pay.hedwigbot.xyz')
        .replace(/\/api\/?$/, '')
        .replace(/\/$/, '');
    this.callbackUrl = `${baseUrl}/api/webhooks/didit`;

    if (!this.workflowId || (!this.apiKey && (!this.clientId || !this.clientSecret))) {
      logger.warn('Didit configuration missing', {
        hasApiKey: !!this.apiKey,
        hasClientId: !!this.clientId,
        hasClientSecret: !!this.clientSecret,
        hasWorkflowId: !!this.workflowId
      });
    }
  }

  private getApiKeyHeaders(): Record<string, string> {
    return {
      'accept': 'application/json',
      'content-type': 'application/json',
      'x-api-key': this.apiKey,
    };
  }

  /**
   * Authenticate with Didit and get access token
   */
  private async authenticate(): Promise<string> {
    try {
      logger.info('Authenticating with Didit OAuth');

      const tokenUrl = process.env.DIDIT_TOKEN_URL || `${DIDIT_API_URL}/oauth/token`;
      const attempts: Array<{ body: string; headers: Record<string, string>; label: string }> = [
        {
          label: 'json_client_credentials',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: 'client_credentials',
          }),
        },
        {
          label: 'form_client_credentials',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: 'client_credentials',
          }).toString(),
        },
      ];

      let lastStatus = 0;
      let lastErrorText = '';
      let authData: DiditAuthResponse | null = null;

      for (const attempt of attempts) {
        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: attempt.headers,
          body: attempt.body,
        });

        if (response.ok) {
          authData = await response.json() as DiditAuthResponse;
          logger.info('Didit token auth attempt succeeded', { attempt: attempt.label });
          break;
        }

        lastStatus = response.status;
        lastErrorText = await response.text();
        logger.warn('Didit token auth attempt failed', {
          attempt: attempt.label,
          status: response.status,
          body: lastErrorText,
        });
      }

      if (!authData) {
        throw new Error(`Didit auth error: ${lastStatus} ${lastErrorText}`);
      }
      
      if (!authData.access_token) {
        throw new Error('No access token received from Didit');
      }

      // Store token and expiry time (with 5 minute buffer)
      this.accessToken = authData.access_token;
      this.tokenExpiry = Date.now() + (authData.expires_in - 300) * 1000;

      logger.info('Didit authentication successful', { 
        tokenType: authData.token_type,
        expiresIn: authData.expires_in 
      });

      return authData.access_token;
    } catch (error) {
      logger.error('Failed to authenticate with Didit', { error });
      throw error;
    }
  }

  /**
   * Get valid access token (authenticate if needed)
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Token expired or doesn't exist, authenticate
    return await this.authenticate();
  }

  /**
   * Create a verification session
   */
  async createSession(params: CreateSessionParams): Promise<DiditSession> {
    try {
      logger.info('Creating Didit session', { userId: params.userId });
      const payload = JSON.stringify({
        workflow_id: this.workflowId,
        vendor_data: params.userId,
        callback: this.callbackUrl, // Didit v3 docs
        callback_url: this.callbackUrl, // compatibility fallback
        email: params.email,
        contact_details: {
          email: params.email,
        },
      });

      const sessionEndpoints = [
        `${DIDIT_API_URL}/session/`,
        `${DIDIT_API_URL}/sessions`,
      ];

      let response: Response | null = null;
      let lastErrorText = '';

      for (const endpoint of sessionEndpoints) {
        if (this.apiKey) {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: this.getApiKeyHeaders(),
            body: payload,
          });
        } else {
          const accessToken = await this.getAccessToken();
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: payload,
          });
        }

        if (response.ok) break;
        lastErrorText = await response.text();
        logger.warn('Didit session create attempt failed', {
          endpoint,
          status: response.status,
          body: lastErrorText,
        });
      }

      if (!response) {
        throw new Error('Didit session request was not executed');
      }

      if (response.ok) {
        const data = await response.json() as DiditCreateSessionResponse;
        const sessionId = data.session_id || data.id || data.session?.id || '';
        const sessionUrl =
          data.redirect_url ||
          data.url ||
          data.session_url ||
          data.verification_url ||
          data.link ||
          data.session?.redirect_url ||
          data.session?.url ||
          data.session?.session_url ||
          data.session?.verification_url ||
          data.session?.link ||
          '';

        logger.info('Didit session created successfully', {
          sessionId,
          hasUrl: !!sessionUrl,
        });
        
        return {
          id: sessionId,
          url: sessionUrl,
          status: data.status || data.session?.status || 'pending',
        };
      } else {
        logger.error('Failed to create Didit session', { 
          status: response.status, 
          body: lastErrorText 
        });
        throw new Error(`Didit API error: ${response.status} ${lastErrorText}`);
      }
    } catch (error) {
      logger.error('Failed to create Didit session', { error });
      throw error;
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId: string): Promise<{ status: string; decision?: string }> {
      try {
        const endpoints = [
          `${DIDIT_API_URL}/session/${sessionId}/decision/`,
          `${DIDIT_API_URL}/sessions/${sessionId}`,
          `${DIDIT_API_URL}/session/${sessionId}`,
        ];

        let response: Response | null = null;
        let lastErrorText = '';

        for (const endpoint of endpoints) {
          if (this.apiKey) {
            response = await fetch(endpoint, {
              method: 'GET',
              headers: this.getApiKeyHeaders(),
            });
          } else {
            const accessToken = await this.getAccessToken();
            response = await fetch(endpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            });
          }

          if (response.ok) break;
          lastErrorText = await response.text();
          logger.warn('Didit get session attempt failed', {
            endpoint,
            status: response.status,
            body: lastErrorText,
          });
        }

        if (!response) {
          throw new Error('Didit get session request was not executed');
        }
  
        if (response.ok) {
          const data = await response.json() as DiditGetSessionResponse;
          const status =
            data.status ||
            data.verification?.status ||
            data.result?.status ||
            'pending';
          const decision =
            data.decision ||
            data.verification?.decision ||
            data.result?.decision;
          return {
            status,
            decision,
          };
        } else {
          logger.error('Failed to get Didit session status', { 
            status: response.status, 
            body: lastErrorText 
          });
          throw new Error(`Didit API error: ${response.status} ${lastErrorText}`);
        }
      } catch (error) {
        logger.error('Failed to get Didit session status', { error });
        throw error;
      }
  }

  private safeCompare(a: string, b: string): boolean {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  }

  private normalizeSignature(signature: string): string {
    return signature
      .trim()
      .replace(/^sha256=/i, '')
      .replace(/^hmac-sha256=/i, '');
  }

  private sortKeysDeep(value: any): any {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortKeysDeep(item));
    }
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc: Record<string, any>, key) => {
          acc[key] = this.sortKeysDeep(value[key]);
          return acc;
        }, {});
    }
    return value;
  }

  private isTimestampFresh(timestamp: string): boolean {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    const now = Math.floor(Date.now() / 1000);
    return Math.abs(now - ts) <= 300;
  }

  /**
   * Validate webhook signature
   * Supports:
   * - X-Signature (raw-body HMAC)
   * - X-Signature-V2 (canonical JSON HMAC)
   * - X-Signature-Simple (field-based HMAC)
   */
  validateWebhook(input: {
    signature?: string;
    signatureV2?: string;
    signatureSimple?: string;
    timestamp?: string;
    rawBody?: string;
    body?: any;
  }): boolean {
    if (!this.webhookSecret || this.webhookSecret.includes('placeholder')) {
      return true;
    }

    try {
      const { signature, signatureV2, signatureSimple, timestamp, rawBody, body } = input;
      const normalizedRawSig = signature ? this.normalizeSignature(signature) : '';
      const normalizedV2Sig = signatureV2 ? this.normalizeSignature(signatureV2) : '';
      const normalizedSimpleSig = signatureSimple ? this.normalizeSignature(signatureSimple) : '';
      const jsonBody = typeof body === 'string' ? JSON.parse(body) : (body || {});

      // 1) Try V2 signature (recommended by Didit docs)
      if (normalizedV2Sig && timestamp && this.isTimestampFresh(timestamp)) {
        const canonicalJson = JSON.stringify(this.sortKeysDeep(jsonBody));
        const expectedV2 = crypto
          .createHmac('sha256', this.webhookSecret)
          .update(canonicalJson, 'utf8')
          .digest('hex');
        if (this.safeCompare(normalizedV2Sig, expectedV2)) {
          return true;
        }
      }

      // 2) Fallback to Simple signature
      if (normalizedSimpleSig && timestamp && this.isTimestampFresh(timestamp)) {
        const canonicalSimple = [
          jsonBody.timestamp || '',
          jsonBody.session_id || '',
          jsonBody.status || '',
          jsonBody.webhook_type || '',
        ].join(':');
        const expectedSimple = crypto
          .createHmac('sha256', this.webhookSecret)
          .update(canonicalSimple, 'utf8')
          .digest('hex');
        if (this.safeCompare(normalizedSimpleSig, expectedSimple)) {
          return true;
        }
      }

      // 3) Legacy raw-body signature
      if (normalizedRawSig) {
        const payload = rawBody || (typeof body === 'string' ? body : JSON.stringify(body));
        const expectedHex = crypto
          .createHmac('sha256', this.webhookSecret)
          .update(payload, 'utf8')
          .digest('hex');
        const expectedBase64 = crypto
          .createHmac('sha256', this.webhookSecret)
          .update(payload, 'utf8')
          .digest('base64');

        if (this.safeCompare(normalizedRawSig, expectedHex) || this.safeCompare(normalizedRawSig, expectedBase64)) {
          return true;
        }
      }

      return false;
    } catch (e) {
      logger.error('Webhook signature validation failed', { error: e });
      return false;
    }
  }
}

export default new DiditService();
