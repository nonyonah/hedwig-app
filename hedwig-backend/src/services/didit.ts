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

interface DiditAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

class DiditService {
  private clientId: string;
  private clientSecret: string;
  private workflowId: string;
  private webhookSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.clientId = process.env.DIDIT_CLIENT_ID || '';
    this.clientSecret = process.env.DIDIT_CLIENT_SECRET || '';
    this.workflowId = process.env.DIDIT_WORKFLOW_ID || '';
    this.webhookSecret = process.env.DIDIT_WEBHOOK_SECRET || '';

    if (!this.clientId || !this.clientSecret || !this.workflowId) {
      logger.warn('Didit configuration missing', {
        hasClientId: !!this.clientId,
        hasClientSecret: !!this.clientSecret,
        hasWorkflowId: !!this.workflowId
      });
    }
  }

  /**
   * Authenticate with Didit and get access token
   */
  private async authenticate(): Promise<string> {
    try {
      logger.info('Authenticating with Didit OAuth');

      const response = await fetch(`${DIDIT_API_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Didit authentication failed', { 
          status: response.status, 
          body: errorText 
        });
        throw new Error(`Didit auth error: ${response.status} ${errorText}`);
      }

      const authData = await response.json() as DiditAuthResponse;
      
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

      // Get valid access token
      const accessToken = await this.getAccessToken();

      const response = await fetch(`${DIDIT_API_URL}/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workflow_id: this.workflowId,
          vendor_data: params.userId,
          callback_url: `https://pay.hedwigbot.xyz/api/webhooks/didit`,
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
        // Get valid access token
        const accessToken = await this.getAccessToken();

        const response = await fetch(`${DIDIT_API_URL}/sessions/${sessionId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
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
          logger.error('Failed to get Didit session status', { 
            status: response.status, 
            body: errorText 
          });
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
