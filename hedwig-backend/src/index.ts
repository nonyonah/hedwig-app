import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// fs was used for legacy contract.html, now using React app
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Load environment variables (loaded via import 'dotenv/config')

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import chatRoutes from './routes/chat';
import documentRoutes from './routes/document';
import transactionRoutes from './routes/transaction';
import offrampRoutes from './routes/offramp';
import bridgeRoutes from './routes/bridge';
import clientRoutes from './routes/client';
import projectRoutes from './routes/project';
import milestoneRoutes from './routes/milestone';
import conversationsRoutes from './routes/conversations';
import webhookRoutes from './routes/webhook';
import paycrestWebhookRoutes from './routes/paycrestWebhook';
import pdfRoutes from './routes/pdf';
import walletRoutes from './routes/wallet';
import notificationRoutes from './routes/notifications';
import insightsRoutes from './routes/insights';
import beneficiaryRoutes from './routes/beneficiaries';
import recipientRoutes from './routes/recipients';
import calendarRoutes from './routes/calendar';
import kycRoutes from './routes/kyc';
import diditWebhookRoutes from './routes/diditWebhook';
import blockradarWebhookRoutes from './routes/blockradarWebhook';
import creationBoxRoutes from './routes/creation-box';
import solanaRpcRoutes from './routes/solanaRpc';
import usdAccountRoutes from './routes/usdAccounts';
import bridgeUsdWebhookRoutes from './routes/bridgeUsdWebhook';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { SchedulerService } from './services/scheduler';
import { createLogger } from './utils/logger';

const logger = createLogger('Server');

const app: Application = express();
const PORT = process.env.PORT || 8080;
const trustProxyEnv = process.env.TRUST_PROXY;
const trustProxySetting =
    trustProxyEnv !== undefined
        ? (trustProxyEnv === 'true' || trustProxyEnv === '1' ? 1 : false)
        : process.env.NODE_ENV === 'production'
            ? 1
            : false;

app.set('trust proxy', trustProxySetting);

// Initialize background tasks
SchedulerService.initScheduler();

// Security middleware with CSP configuration for web pages
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'", // Needed for inline scripts in HTML
                    "https://unpkg.com", // Phosphor icons + Solana web3.js
                    "https://cdnjs.cloudflare.com", // ethers.js and html2pdf.js
                    "https://cdn.tailwindcss.com", // Tailwind CSS
                    "https://cdn.jsdelivr.net", // Marked.js
                    "https://esm.sh", // Reown AppKit ES modules
                    "https://bundle.run", // Buffer polyfill for Solana
                    "chrome-extension:",
                    "moz-extension:",
                    "https://*.phantom.app",
                ],
                scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'", // Needed for inline styles
                    "https://fonts.googleapis.com", // Google Fonts
                ],
                fontSrc: [
                    "'self'",
                    "https://fonts.googleapis.com",
                    "https://fonts.gstatic.com",
                    "https://fonts.reown.com",
                    "https://*.reown.com",
                    "https://auth.privy.io",
                ],
                imgSrc: ["'self'", "data:", "blob:", "https://*.walletconnect.com", "https://*.reown.com", "chrome-extension:", "moz-extension:", "https://*.phantom.app", "https://auth.privy.io"],
                connectSrc: [
                    "'self'",
                    "https://cdn.jsdelivr.net",
                    "https://esm.sh",
                    "https://unpkg.com", // Solana web3.js source maps
                    "chrome-extension:",
                    "moz-extension:",
                    "https://api.devnet.solana.com", // Solana Devnet RPC
                    "https://api.mainnet-beta.solana.com", // Solana Mainnet RPC
                    "https://api.testnet.solana.com", // Solana Testnet RPC
                    "https://solana-mainnet.g.alchemy.com", // Alchemy Solana Mainnet RPC
                    "https://rpc.ankr.com", // Ankr Solana RPC
                    "https://solana-rpc.publicnode.com", // PublicNode Solana RPC
                    "wss://api.devnet.solana.com", // Solana Devnet WebSocket
                    "wss://api.mainnet-beta.solana.com", // Solana Mainnet WebSocket
                    "wss://api.testnet.solana.com", // Solana Testnet WebSocket
                    // Reown/WalletConnect endpoints
                    "https://rpc.walletconnect.org",
                    "https://rpc.walletconnect.com",
                    "wss://relay.walletconnect.org",
                    "wss://relay.walletconnect.com",
                    "https://pulse.walletconnect.org",
                    "https://explorer-api.walletconnect.com",
                    "https://verify.walletconnect.org",
                    "https://verify.walletconnect.com",
                    // Reown/Web3Modal API endpoints
                    "https://api.web3modal.org",
                    "https://api.web3modal.com",
                    "https://*.web3modal.org",
                    "https://*.web3modal.com",
                    "https://*.reown.com",
                    "https://*.reown.org",
                    "wss://*.walletconnect.org",
                    "wss://*.walletconnect.com",
                    "https://*.phantom.app",
                    "wss://*.phantom.app",
                    // EVM RPC endpoints
                    "https://mainnet.base.org",
                    "https://sepolia.base.org",
                    "https://forno.celo.org",
                    // Privy APIs
                    "https://auth.privy.io",
                    "wss://auth.privy.io",
                    "https://*.privy.io",
                    "wss://*.privy.io",
                ],
                frameSrc: ["'self'", "https:", "blob:", "data:", "chrome-extension:", "moz-extension:", "https://*.phantom.app", "https://*.privy.io"],
                childSrc: ["'self'", "https:", "blob:", "data:", "chrome-extension:", "moz-extension:", "https://*.phantom.app", "https://*.privy.io"],
            },
        },
    })
);

// CORS configuration
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8081')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow server-to-server (no origin) and any listed origin
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`Origin ${origin} not allowed by CORS`));
            }
        },
        credentials: true,
    })
);

// Body parsing middleware
app.use(express.json({ 
    limit: '10mb',
    verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const createLimiter = (max: number, message: string) =>
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message,
    });

// Baseline API protection; skip webhook delivery so providers are not throttled.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
    skip: (req) => req.originalUrl.startsWith('/api/webhooks/'),
});
app.use('/api/', limiter);

const authLimiter = createLimiter(60, 'Too many authentication requests. Please try again shortly.');
const aiLimiter = createLimiter(40, 'Too many AI requests. Please slow down and try again.');
const documentLimiter = createLimiter(180, 'Too many document requests. Please try again later.');
const financialLimiter = createLimiter(120, 'Too many financial requests. Please try again later.');

// Health check
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
    });
});

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);

// Add logging middleware for chat routes
app.use('/api/chat', (req, _res, next) => {
    logger.debug('Chat route hit', {
        method: req.method,
        path: req.path,
        hasAuth: !!req.headers.authorization
    });
    next();
});

app.use('/api/chat', aiLimiter, chatRoutes);
app.use('/api/documents', documentLimiter, documentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/offramp', financialLimiter, offrampRoutes);
app.use('/api/bridge', bridgeRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/webhooks/paycrest', (req, _res, next) => {
    logger.info('Paycrest webhook route hit', {
        method: req.method,
        path: req.path,
        hasSignature: Boolean(req.headers['x-paycrest-signature'] || req.headers['x-signature']),
        userAgent: req.headers['user-agent'] || null,
    });
    next();
});
app.use('/api/webhooks/paycrest', paycrestWebhookRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/documents', pdfRoutes); // PDF generation and signing
app.use('/api/wallet', walletRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/beneficiaries', beneficiaryRoutes);
app.use('/api/recipients', recipientRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/webhooks/didit', diditWebhookRoutes);
app.use('/api/webhooks/blockradar', blockradarWebhookRoutes);
app.use('/api/creation-box', aiLimiter, creationBoxRoutes);
app.use('/api/solana/rpc', solanaRpcRoutes);
app.use('/api/usd-accounts', (req, _res, next) => {
    logger.info('USD account route hit', {
        method: req.method,
        path: req.path,
        hasAuth: Boolean(req.headers.authorization),
        origin: req.headers.origin || null,
        userAgent: req.headers['user-agent'] || null,
    });
    next();
});
app.use('/api/usd-accounts', financialLimiter, usdAccountRoutes);
app.use('/api/webhooks/bridge-usd', bridgeUsdWebhookRoutes);

// Serve static files from legacy public folder (for assets)
app.use(express.static(path.join(__dirname, '../public')));

// Serve React web client build
const webClientPath = path.join(__dirname, '../web-client/dist');
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// React Web Client Routes - Serve React app for invoice and payment pages
const serveReactApp = (_req: Request, res: Response) => {
    res.sendFile(path.join(webClientPath, 'index.html'));
};

// Invoice routes - served by React app
app.get('/invoice/:id', serveReactApp);
app.get('/invoices/:id', serveReactApp);

// Payment link routes - served by React app
app.get('/pay/:id', serveReactApp);
app.get('/payment-link/:id', serveReactApp);

// Serve React app static assets
app.use(express.static(webClientPath));

// Contract routes - now served by React app (no wallet signing)
app.get('/contract/:id', serveReactApp);
app.get('/contracts/:id', serveReactApp);

// Export wallet route - served by React app
app.get('/export-wallet', serveReactApp);

// Feedback route - served by React app
app.get('/feedback', serveReactApp);

// Proposal routes - still using legacy HTML for now
app.get('/proposal/:id', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/proposal.html'));
});

// 404 handler
app.use(notFound);

// Error handler (must be last)
app.use(errorHandler);

// Start server - bind to 0.0.0.0 for Fly.io/Docker
const HOST = process.env.HOST || '0.0.0.0';
app.listen(Number(PORT), HOST, () => {
    logger.info('Hedwig Backend started', { host: HOST, port: PORT });
    logger.info('Environment', { env: process.env.NODE_ENV });
    logger.info('Proxy trust configured', { trustProxy: app.get('trust proxy') });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    process.exit(0);
});

export default app;
