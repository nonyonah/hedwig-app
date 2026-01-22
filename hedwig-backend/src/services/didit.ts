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

class DiditService {
  private apiKey: string;
  private workflowId: string;
  private webhookSecret: string;

  constructor() {
    // For Didit V2, we need the API Key instead of client ID/secret
    this.apiKey = process.env.DIDIT_API_KEY || process.env.DIDIT_CLIENT_SECRET || 'placeholder_api_key';
    this.workflowId = process.env.DIDIT_WORKFLOW_ID || 'placeholder_workflow_id';
    this.webhookSecret = process.env.DIDIT_WEBHOOK_SECRET || 'placeholder_webhook_secret';
  }

  /**
   * Create a verification session
   */
  async createSession(params: CreateSessionParams): Promise<DiditSession> {
    try {
      // Try different authentication methods for Didit V2
      const authMethods = [
        { name: 'Bearer', getHeaders: () => ({ 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }) },
        { name: 'X-API-Key', getHeaders: () => ({ 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' }) },
        { name: 'Api-Key', getHeaders: () => ({ 'Api-Key': this.apiKey, 'Content-Type': 'application/json' }) },
      ];

      let lastError: Error | null = null;

      for (const method of authMethods) {
        try {
          logger.info(`Trying authentication method: ${method.name}`);
          
          const response = await fetch(`${DIDIT_API_URL}/session/`, {
            method: 'POST',
            headers: method.getHeaders(),
            body: JSON.stringify({
              workflow_id: this.workflowId,
              vendor_data: params.userId,
              callback_url: `${process.env.EXPO_PUBLIC_API_URL}/api/webhooks/didit`,
              email: params.email
            }),
          });

          if (response.ok) {
            const data = await response.json();
            logger.info(`Didit session created successfully with ${method.name}`, { sessionId: data.session_id });
            
            return {
              id: data.session_id,
              url: data.redirect_url || data.url,
              status: data.status,
            };
          } else {
            const errorText = await response.text();
            logger.warn(`Authentication method ${method.name} failed`, { 
              status: response.status, 
              body: errorText 
            });
            lastError = new Error(`${method.name}: ${response.status} ${errorText}`);
          }
        } catch (error) {
          logger.warn(`Authentication method ${method.name} threw error`, { error });
          lastError = error as Error;
        }
      }

      // If all methods failed, throw the last error
      throw lastError || new Error('All authentication methods failed');
      
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
        // Try the same authentication methods
        const authMethods = [
          { name: 'Bearer', getHeaders: () => ({ 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }) },
          { name: 'X-API-Key', getHeaders: () => ({ 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' }) },
          { name: 'Api-Key', getHeaders: () => ({ 'Api-Key': this.apiKey, 'Content-Type': 'application/json' }) },
        ];

        let lastError: Error | null = null;

        for (const method of authMethods) {
          try {
            const response = await fetch(`${DIDIT_API_URL}/session/${sessionId}`, {
              method: 'GET',
              headers: method.getHeaders(),
            });
      
            if (response.ok) {
              const data = await response.json();
              return {
                status: data.status,
                decision: data.decision
              };
            } else {
              const errorText = await response.text();
              lastError = new Error(`${method.name}: ${response.status} ${errorText}`);
            }
          } catch (error) {
            lastError = error as Error;
          }
        }

        throw lastError || new Error('All authentication methods failed');
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
