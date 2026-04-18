import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// fs was used for legacy contract.html, now using React app
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis, closeRedis, isRedisFailClosed } from './lib/redis';

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
import engagementRoutes from './routes/engagement';
import insightsRoutes from './routes/insights';
import beneficiaryRoutes from './routes/beneficiaries';
import recipientRoutes from './routes/recipients';
import calendarRoutes from './routes/calendar';
import recurringRoutes from './routes/recurring';
import kycRoutes from './routes/kyc';
import diditWebhookRoutes from './routes/diditWebhook';
import blockradarWebhookRoutes from './routes/blockradarWebhook';
import creationBoxRoutes from './routes/creation-box';
import solanaRpcRoutes from './routes/solanaRpc';
import usdAccountRoutes from './routes/usdAccounts';
import bridgeUsdWebhookRoutes from './routes/bridgeUsdWebhook';
import billingRoutes from './routes/billing';
import revenuecatWebhookRoutes from './routes/revenuecatWebhook';
import feedbackRoutes from './routes/feedback';
import paymentWebhooksRoutes from './routes/paymentWebhooks';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { SchedulerService } from './services/scheduler';
import NotificationService from './services/notifications';
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
const normalizeOrigin = (value: string): string => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    try {
        const url = new URL(trimmed);
        return url.origin.toLowerCase();
    } catch {
        return '';
    }
};

const expandOriginVariants = (origin: string): string[] => {
    try {
        const url = new URL(origin);
        const variants = new Set<string>([url.origin.toLowerCase()]);
        const host = url.hostname.toLowerCase();

        // Treat apex and www as equivalent for configured domains.
        if (host.startsWith('www.')) {
            const apex = host.replace(/^www\./, '');
            variants.add(`${url.protocol}//${apex}${url.port ? `:${url.port}` : ''}`.toLowerCase());
        } else if (host.split('.').length === 2) {
            variants.add(`${url.protocol}//www.${host}${url.port ? `:${url.port}` : ''}`.toLowerCase());
        }

        return [...variants];
    } catch {
        return [origin.toLowerCase()];
    }
};

const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8081,http://localhost:3001')
    .split(',')
    .map((o) => normalizeOrigin(o))
    .filter(Boolean);

const inferredOrigins = [
    normalizeOrigin(process.env.WEB_CLIENT_URL || ''),
    normalizeOrigin(process.env.PUBLIC_BASE_URL || ''),
    normalizeOrigin(process.env.APP_URL || ''),
    'https://hedwigbot.xyz',
    'https://www.hedwigbot.xyz',
    'https://pay.hedwigbot.xyz',
].filter(Boolean);

const allowedOriginSet = new Set<string>();
for (const origin of [...configuredOrigins, ...inferredOrigins]) {
    for (const variant of expandOriginVariants(origin)) {
        allowedOriginSet.add(variant);
    }
}

const hedwigDomainRegex = /^https:\/\/([a-z0-9-]+\.)?hedwigbot\.xyz$/i;

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow server-to-server (no origin) and any listed origin
            if (!origin) {
                callback(null, true);
                return;
            }

            const normalizedOrigin = normalizeOrigin(origin);
            const originAllowed =
                Boolean(normalizedOrigin) &&
                (allowedOriginSet.has(normalizedOrigin) || hedwigDomainRegex.test(normalizedOrigin));

            if (originAllowed) {
                callback(null, true);
                return;
            }

            logger.warn('CORS origin rejected', { origin: normalizedOrigin || origin });
            // Do not throw an app error/500; simply deny CORS for this origin.
            callback(null, false);
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

// Build a Redis store for rate limiting if Redis is available.
// Falls back to the default in-memory store when REDIS_URL is not set.
function makeRateLimitStore(prefix: string) {
    const redis = getRedis();
    if (!redis) return undefined; // express-rate-limit defaults to memory store
    return new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: `rl:${prefix}:`,
    });
}

const createLimiter = (prefix: string, max: number, message: string) =>
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message,
        store: makeRateLimitStore(prefix),
    });

const getUserAwareRateLimitKey = (req: Request): string => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (token) {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
            return `user:${tokenHash}`;
        }
    }
    return `ip:${req.ip || 'unknown'}`;
};

const createUserAwareLimiter = (prefix: string, max: number, message: string) =>
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message,
        store: makeRateLimitStore(`${prefix}:user`),
        keyGenerator: getUserAwareRateLimitKey,
    });

// Baseline API protection — skip webhooks so external providers are never throttled.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
    skip: (req) => req.originalUrl.startsWith('/api/webhooks/'),
    store: makeRateLimitStore('global'),
});
app.use('/api/', limiter);

const authLimiter     = createLimiter('auth',     60,  'Too many authentication requests. Please try again shortly.');
const aiLimiter       = createUserAwareLimiter('ai',       40,  'Too many AI requests. Please slow down and try again.');
const documentLimiter = createUserAwareLimiter('docs',    180,  'Too many document requests. Please try again later.');
const financialLimiter = createUserAwareLimiter('finance', 120, 'Too many financial requests. Please try again later.');
const transactionsLimiter = createUserAwareLimiter('transactions', 240, 'Too many transaction requests. Please try again shortly.');
const insightsLimiter = createUserAwareLimiter('insights', 120, 'Too many insights requests. Please try again shortly.');
const solanaRpcLimiter = createUserAwareLimiter('solana-rpc', 90, 'Too many Solana RPC requests. Please slow down.');

// Health check
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
    });
});

// ─── Cloud Scheduler HTTP endpoints ──────────────────────────────────────────
// Use these with GCP Cloud Scheduler instead of in-process cron (SCHEDULER_MODE=cloud).
// Each job is protected by a shared secret set via SCHEDULER_SECRET env var.
// Cloud Scheduler → HTTP target → POST https://your-service/internal/scheduler/<job>
//   Header: Authorization: Bearer <SCHEDULER_SECRET>
// ─────────────────────────────────────────────────────────────────────────────
const schedulerRouter = express.Router();

schedulerRouter.use((req: Request, res: Response, next) => {
    const secret = process.env.SCHEDULER_SECRET;
    if (!secret) {
        // No secret configured — reject all calls to avoid accidental exposure
        res.status(503).json({ error: 'Scheduler endpoint not configured' });
        return;
    }
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
});

schedulerRouter.post('/check-and-remind', async (_req, res) => {
    res.json({ accepted: true });
    await SchedulerService.checkAndRemind();
});
schedulerRouter.post('/due-date-reminders', async (_req, res) => {
    res.json({ accepted: true });
    await SchedulerService.checkDueDateReminders();
});
schedulerRouter.post('/recurring-invoices', async (_req, res) => {
    res.json({ accepted: true });
    await SchedulerService.checkRecurringInvoices();
});
schedulerRouter.post('/dormant-nudges', async (_req, res) => {
    res.json({ accepted: true });
    await SchedulerService.sendDormantUserNudges();
});
schedulerRouter.post('/kyc-nudges', async (_req, res) => {
    res.json({ accepted: true });
    await SchedulerService.sendKycReminderNudges();
});
schedulerRouter.post('/feature-nudges', async (_req, res) => {
    res.json({ accepted: true });
    await SchedulerService.sendFeatureHighlightNudges();
});
schedulerRouter.post('/rate-nudges', async (_req, res) => {
    res.json({ accepted: true });
    await SchedulerService.sendPaycrestRateNudges();
});
schedulerRouter.post('/token-cleanup', async (_req, res) => {
    res.json({ accepted: true });
    await NotificationService.cleanupExpoDeviceTokens();
});
schedulerRouter.post('/onboarding-nudges', async (_req, res) => {
    res.json({ accepted: true });
    await SchedulerService.sendOnboardingIncompleteNudges();
});

app.use('/internal/scheduler', schedulerRouter);

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
app.use('/api/transactions', transactionsLimiter, transactionRoutes);
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
app.use('/api/webhooks/revenuecat', revenuecatWebhookRoutes);
app.use('/api/webhooks/payments', paymentWebhooksRoutes);
app.use('/api/documents', pdfRoutes); // PDF generation and signing
app.use('/api/wallet', walletRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/engagement', engagementRoutes);
app.use('/api/insights', insightsLimiter, insightsRoutes);
app.use('/api/beneficiaries', beneficiaryRoutes);
app.use('/api/recipients', recipientRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/recurring-invoices', documentLimiter, recurringRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/webhooks/didit', diditWebhookRoutes);
app.use('/api/webhooks/blockradar', blockradarWebhookRoutes);
app.use('/api/creation-box', aiLimiter, creationBoxRoutes);
app.use('/api/solana/rpc', solanaRpcLimiter, solanaRpcRoutes);
app.use('/api/billing', financialLimiter, billingRoutes);
app.use('/api/feedback', feedbackRoutes);
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

app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// Public web pages are now served by Next.js web-app.
const PUBLIC_WEB_APP_URL = (
    process.env.APP_URL ||
    process.env.WEB_APP_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.WEB_CLIENT_URL ||
    'https://hedwigbot.xyz'
).replace(/\/+$/, '');

const redirectToWebApp = (pathFor: (req: Request) => string) => (req: Request, res: Response) => {
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    const targetPath = pathFor(req);
    res.redirect(302, `${PUBLIC_WEB_APP_URL}${targetPath}${query}`);
};

const safeParam = (value: string | string[] | undefined) =>
    encodeURIComponent(Array.isArray(value) ? (value[0] ?? '') : (value ?? ''));

// Legacy public routes -> Next.js routes
app.get('/invoice/:id', redirectToWebApp((req) => `/invoice/${safeParam(req.params.id)}`));
app.get('/invoices/:id', redirectToWebApp((req) => `/invoices/${safeParam(req.params.id)}`));
app.get('/pay/:id', redirectToWebApp((req) => `/pay/${safeParam(req.params.id)}`));
app.get('/payment-link/:id', redirectToWebApp((req) => `/payment-link/${safeParam(req.params.id)}`));
app.get('/contract/:id', redirectToWebApp((req) => `/contract/${safeParam(req.params.id)}`));
app.get('/contracts/:id', redirectToWebApp((req) => `/contracts/${safeParam(req.params.id)}`));
app.get('/export-wallet', redirectToWebApp(() => '/export-wallet'));
app.get('/feedback', redirectToWebApp(() => '/settings'));

// Proposal routes - still using legacy HTML for now
app.get('/proposal/:id', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/proposal.html'));
});

// 404 handler
app.use(notFound);

// Error handler (must be last)
app.use(errorHandler);

// Start server - bind to 0.0.0.0 for Cloud Run / Docker
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(Number(PORT), HOST, () => {
    logger.info('Hedwig Backend started', { host: HOST, port: PORT });
    logger.info('Environment', { env: process.env.NODE_ENV });
    logger.info('Proxy trust configured', { trustProxy: app.get('trust proxy') });
    logger.info('Redis rate limiting', { enabled: !!getRedis(), failClosed: isRedisFailClosed() });
    logger.info('Scheduler mode', { mode: process.env.SCHEDULER_MODE || 'in-process' });
});

// Cloud Run sends SIGTERM when it wants to stop the container.
// We stop accepting new connections, let in-flight requests finish,
// then close Redis before exiting. Cloud Run waits up to
// SIGTERM_TIMEOUT_MS (default 25 s) before sending SIGKILL.
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SIGTERM_TIMEOUT_MS || 25_000);

async function shutdown(signal: string) {
    logger.info(`${signal} received — starting graceful shutdown`);

    const forceExit = setTimeout(() => {
        logger.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async () => {
        logger.info('HTTP server closed');
        await closeRedis();
        logger.info('Shutdown complete');
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export default app;
