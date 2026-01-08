import express, { Application, Request, Response } from 'express';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// fs was used for legacy contract.html, now using React app
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

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
import beneficiaryRoutes from './routes/beneficiaries';
import calendarRoutes from './routes/calendar';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { SchedulerService } from './services/scheduler';

const app: Application = express();
const PORT = process.env.PORT || 3000;

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
                ],
                imgSrc: ["'self'", "data:", "https://*.walletconnect.com", "https://*.reown.com"],
                connectSrc: [
                    "'self'",
                    "https://cdn.jsdelivr.net",
                    "https://esm.sh",
                    "https://unpkg.com", // Solana web3.js source maps
                    "https://api.devnet.solana.com", // Solana Devnet RPC
                    "https://api.mainnet-beta.solana.com", // Solana Mainnet RPC
                    "https://api.testnet.solana.com", // Solana Testnet RPC
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
                    // EVM RPC endpoints
                    "https://mainnet.base.org",
                    "https://sepolia.base.org",
                    "https://forno.celo.org",
                ],
            },
        },
    })
);

// CORS configuration
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || 'http://localhost:8081',
        credentials: true,
    })
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting - increased to handle multiple API calls per page load
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Add logging middleware for chat routes
app.use('/api/chat', (req, _res, next) => {
    console.log('[API] Chat route hit:', {
        method: req.method,
        path: req.path,
        fullUrl: req.originalUrl,
        headers: req.headers.authorization ? 'Has auth header' : 'No auth header'
    });
    next();
});

app.use('/api/chat', chatRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/offramp', offrampRoutes);
app.use('/api/bridge', bridgeRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/webhooks/paycrest', paycrestWebhookRoutes);
app.use('/api/documents', pdfRoutes); // PDF generation and signing
app.use('/api/wallet', walletRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/beneficiaries', beneficiaryRoutes);
app.use('/api/calendar', calendarRoutes);

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
    console.log(`🚀 Hedwig Backend running on ${HOST}:${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 Health check: http://${HOST}:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    process.exit(0);
});

export default app;
