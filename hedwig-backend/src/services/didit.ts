import { createLogger } from '../utils/logger';
import crypto from 'crypto';

const logger = createLogger('DiditService');

const DIDIT_API_URL = 'https://api.didit.me/v1'; // Verify valid URL

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

class DiditService {
  private clientId: string;
  private clientSecret: string;
  private workflowId: string;
  private webhookSecret: string;

  constructor() {
    this.clientId = process.env.DIDIT_CLIENT_ID || 'placeholder_client_id';
    this.clientSecret = process.env.DIDIT_CLIENT_SECRET || 'placeholder_client_secret';
    this.workflowId = process.env.DIDIT_WORKFLOW_ID || 'placeholder_workflow_id';
    this.webhookSecret = process.env.DIDIT_WEBHOOK_SECRET || 'placeholder_webhook_secret';
  }

  /**
   * Create a verification session
   */
  async createSession(params: CreateSessionParams): Promise<DiditSession> {
    try {
      // Authenticate (Basic Auth or Bearer - assuming Bearer for now based on typical modern APIs)
      // Didit often uses Basic Auth with Client ID/Secret.
      const authHeader = 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await fetch(`${DIDIT_API_URL}/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workflow_id: this.workflowId,
          vendor_data: params.userId,
          callback_url: `${process.env.EXPO_PUBLIC_API_URL}/api/webhooks/didit`, // Corrected webhook path
          email: params.email
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Didit API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return {
        id: data.session_id,
        url: data.redirect_url || data.url,
        status: data.status,
      };
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
        const authHeader = 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
  
        const response = await fetch(`${DIDIT_API_URL}/sessions/${sessionId}`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });
  
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Didit API error: ${response.status} ${errorText}`);
        }
  
        const data = await response.json();
        return {
          status: data.status,
          decision: data.decision
        };
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
            
        // Didit might verify differently (e.g. specific header format), verify docs.
        // Assuming simple HMAC-SHA256 match.
        return signature === computedSignature;
    } catch (e) {
        logger.error('Webhook signature validation failed', { error: e });
        return false;
    }
  }
}

export default new DiditService();
