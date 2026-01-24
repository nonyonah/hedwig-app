import { createLogger } from '../utils/logger';
import crypto from 'crypto';

const logger = createLogger('DiditService');

class DiditService {
  private apiKey: string;
  private baseUrl: string;
  private workflowId: string;
  private webhookSecret: string;

  constructor() {
    this.apiKey = process.env.DIDIT_API_KEY || '';
    this.baseUrl = process.env.DIDIT_BASE_URL || 'https://verification.didit.me';
    this.workflowId = process.env.DIDIT_WORKFLOW_ID || '';
    this.webhookSecret = process.env.DIDIT_WEBHOOK_SECRET_KEY || process.env.DIDIT_WEBHOOK_SECRET || '';

    if (!this.apiKey || !this.workflowId) {
      logger.warn('Didit configuration missing', {
        hasApiKey: !!this.apiKey,
        hasWorkflowId: !!this.workflowId
      });
    }
  }

  /**
   * Create a verification session
   */
  async createSession(userId: string, callbackUrl: string): Promise<{ session_id: string; url: string; status: string }> {
    try {
      logger.info('Creating Didit session', { userId });

      const response = await fetch(`${this.baseUrl}/v2/session/`, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({
          workflow_id: this.workflowId,
          vendor_data: userId,
          callback: callbackUrl
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Failed to create Didit session', { 
          status: response.status, 
          body: errorText 
        });
        throw new Error(`Didit API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { session_id: string; url: string; status: string };
      logger.info('Didit session created successfully', { sessionId: data.session_id });
      
      return data;
    } catch (error) {
      logger.error('Failed to create Didit session', { error });
      throw error;
    }
  }

  /**
   * Get session status
   */
  async getSession(sessionId: string): Promise<any> {
      try {
        const response = await fetch(`${this.baseUrl}/v2/session/${sessionId}/`, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'x-api-key': this.apiKey
          },
        });
  
        if (!response.ok) {
          const errorText = await response.text();
          logger.error('Failed to get Didit session status', { 
            status: response.status, 
            body: errorText 
          });
          throw new Error(`Didit API error: ${response.status} ${errorText}`);
        }

        return await response.json();
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
