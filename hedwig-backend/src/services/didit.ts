import { createLogger } from '../utils/logger';
import crypto from 'crypto';

const logger = createLogger('DiditService');

const DIDIT_API_URL = 'https://api.didit.me/v3'; // Updated to v3

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
  redirect_url?: string;
  url?: string;
  status: string;
}

interface DiditGetSessionResponse {
  status: string;
  decision?: string;
}

class DiditService {
  private apiKey: string;
  private workflowId: string;
  private webhookSecret: string;

  constructor() {
    this.apiKey = process.env.DIDIT_API_KEY || '';
    this.workflowId = process.env.DIDIT_WORKFLOW_ID || '';
    this.webhookSecret = process.env.DIDIT_WEBHOOK_SECRET || '';

    if (!this.apiKey || !this.workflowId) {
      logger.warn('Didit configuration missing');
    }
  }

  /**
   * Create a verification session
   */
  async createSession(params: CreateSessionParams): Promise<DiditSession> {
    try {
      logger.info('Creating Didit session', { userId: params.userId });

      const response = await fetch(`${DIDIT_API_URL}/session/`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workflow_id: this.workflowId,
          vendor_data: params.userId,
          callback_url: `${process.env.EXPO_PUBLIC_API_URL}/api/webhooks/didit`,
          email: params.email
        }),
      });

      if (response.ok) {
        const data = await response.json() as DiditCreateSessionResponse;
        logger.info('Didit session created successfully', { sessionId: data.session_id });
        
        return {
          id: data.session_id,
          url: data.redirect_url || data.url || '',
          status: data.status,
        };
      } else {
        const errorText = await response.text();
        logger.error('Failed to create Didit session', { 
          status: response.status, 
          body: errorText 
        });
        throw new Error(`Didit API error: ${response.status} ${errorText}`);
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
        const response = await fetch(`${DIDIT_API_URL}/session/${sessionId}`, {
          method: 'GET',
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
        });
  
        if (response.ok) {
          const data = await response.json() as DiditGetSessionResponse;
          return {
            status: data.status,
            decision: data.decision
          };
        } else {
          const errorText = await response.text();
          throw new Error(`Didit API error: ${response.status} ${errorText}`);
        }
      } catch (error) {
        logger.error('Failed to get Didit session status', { error });
        throw error;
      }
  }

  /**
   * Validate webhook signature
   */
  validateWebhook(signature: string, body: any): boolean {
    if (!this.webhookSecret || this.webhookSecret.includes('placeholder')) {
        return true; // Bypass if not configured (dev mode)
    }
    
    try {
        const payload = JSON.stringify(body);
        const computedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(payload)
            .digest('hex');
            
        // Didit signature format validation
        return signature === computedSignature;
    } catch (e) {
        logger.error('Webhook signature validation failed', { error: e });
        return false;
    }
  }
}

export default new DiditService();
