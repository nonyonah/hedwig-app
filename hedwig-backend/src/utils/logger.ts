/**
 * Secure Structured Logger
 * 
 * Features:
 * - Structured JSON logging for machine readability
 * - Input sanitization to prevent log injection attacks
 * - Automatic PII redaction (emails, wallets, tokens)
 * - Log levels with environment-based filtering
 * - Context enrichment (timestamp, environment)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    [key: string]: unknown;
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    service: string;
    environment: string;
    context?: LogContext;
}

// Sensitive field patterns to redact
const SENSITIVE_PATTERNS = {
    email: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    wallet: /0x[a-fA-F0-9]{40}/gi,
    solanaWallet: /[1-9A-HJ-NP-Za-km-z]{32,44}/g,
    bearerToken: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi,
    jwt: /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi,
    privyId: /did:privy:[a-zA-Z0-9]+/gi,
    apiKey: /(api[_-]?key|apikey|secret|password|token)\s*[:=]\s*["']?[^\s"']+["']?/gi,
};

// Fields that should always be redacted
const SENSITIVE_FIELD_NAMES = [
    'password',
    'secret',
    'apiKey',
    'api_key',
    'token',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'authorization',
    'privateKey',
    'private_key',
    'mnemonic',
    'seed',
    'accountNumber',
    'account_number',
];

/**
 * Sanitize a string to prevent log injection attacks
 * Removes newlines, carriage returns, and other control characters
 */
function sanitizeString(input: string): string {
    if (typeof input !== 'string') return String(input);
    
    // Remove control characters and normalize whitespace
    return input
        .replace(/[\r\n\t]/g, ' ')  // Replace newlines/tabs with spaces
        .replace(/[\x00-\x1F\x7F]/g, '')  // Remove other control characters
        .trim()
        .slice(0, 1000);  // Limit length to prevent log flooding
}

/**
 * Redact sensitive data from a string
 */
function redactString(input: string): string {
    let result = input;
    
    // Redact emails: user@domain.com -> u***@***.com
    result = result.replace(SENSITIVE_PATTERNS.email, (match) => {
        const [local, domain] = match.split('@');
        return `${local[0]}***@***.${domain.split('.').pop()}`;
    });
    
    // Redact EVM wallet addresses: 0x1234...abcd
    result = result.replace(SENSITIVE_PATTERNS.wallet, (match) => {
        return `${match.slice(0, 6)}...${match.slice(-4)}`;
    });
    
    // Redact Solana wallet addresses (base58, 32-44 chars)
    result = result.replace(SENSITIVE_PATTERNS.solanaWallet, (match) => {
        if (match.length >= 32) {
            return `${match.slice(0, 4)}...${match.slice(-4)}`;
        }
        return match;
    });
    
    // Redact Bearer tokens
    result = result.replace(SENSITIVE_PATTERNS.bearerToken, 'Bearer [REDACTED]');
    
    // Redact JWTs
    result = result.replace(SENSITIVE_PATTERNS.jwt, '[JWT_REDACTED]');
    
    // Redact Privy IDs
    result = result.replace(SENSITIVE_PATTERNS.privyId, 'did:privy:[REDACTED]');
    
    // Redact API keys and secrets in key=value format
    result = result.replace(SENSITIVE_PATTERNS.apiKey, '$1=[REDACTED]');
    
    return result;
}

/**
 * Deep redact sensitive fields from an object
 */
function redactObject(obj: unknown, depth = 0): unknown {
    // Prevent infinite recursion
    if (depth > 10) return '[MAX_DEPTH]';
    
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
        return redactString(sanitizeString(obj));
    }
    
    if (typeof obj === 'number' || typeof obj === 'boolean') {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.slice(0, 50).map(item => redactObject(item, depth + 1));
    }
    
    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        const entries = Object.entries(obj as Record<string, unknown>).slice(0, 50);
        
        for (const [key, value] of entries) {
            const lowerKey = key.toLowerCase();
            
            // Check if this is a sensitive field name
            if (SENSITIVE_FIELD_NAMES.some(name => lowerKey.includes(name.toLowerCase()))) {
                result[key] = '[REDACTED]';
            } else {
                result[key] = redactObject(value, depth + 1);
            }
        }
        
        return result;
    }
    
    return '[UNKNOWN_TYPE]';
}

/**
 * Get current log level from environment
 */
function getMinLogLevel(): LogLevel {
    const env = process.env.NODE_ENV || 'development';
    const configuredLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
    
    if (configuredLevel && ['debug', 'info', 'warn', 'error'].includes(configuredLevel)) {
        return configuredLevel;
    }
    
    // Default levels based on environment
    return env === 'production' ? 'info' : 'debug';
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
    const minLevel = getMinLogLevel();
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

/**
 * Format and output a log entry
 */
function outputLog(entry: LogEntry): void {
    const env = process.env.NODE_ENV || 'development';
    
    if (env === 'production') {
        // JSON format for production (machine readable)
        console.log(JSON.stringify(entry));
    } else {
        // Human-readable format for development
        const levelColors: Record<LogLevel, string> = {
            debug: '\x1b[36m',  // Cyan
            info: '\x1b[32m',   // Green
            warn: '\x1b[33m',   // Yellow
            error: '\x1b[31m', // Red
        };
        const reset = '\x1b[0m';
        const color = levelColors[entry.level];
        
        const contextStr = entry.context 
            ? ` ${JSON.stringify(entry.context)}`
            : '';
            
        console.log(
            `${color}[${entry.level.toUpperCase()}]${reset} [${entry.service}] ${entry.message}${contextStr}`
        );
    }
}

/**
 * Create a log entry and output it
 */
function log(level: LogLevel, service: string, message: string, context?: LogContext): void {
    if (!shouldLog(level)) return;
    
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message: sanitizeString(message),
        service,
        environment: process.env.NODE_ENV || 'development',
    };
    
    if (context) {
        entry.context = redactObject(context) as LogContext;
    }
    
    outputLog(entry);
}

/**
 * Logger factory - creates a logger for a specific service/module
 */
export function createLogger(service: string) {
    const sanitizedService = sanitizeString(service).slice(0, 50);
    
    return {
        debug: (message: string, context?: LogContext) => 
            log('debug', sanitizedService, message, context),
        
        info: (message: string, context?: LogContext) => 
            log('info', sanitizedService, message, context),
        
        warn: (message: string, context?: LogContext) => 
            log('warn', sanitizedService, message, context),
        
        error: (message: string, context?: LogContext) => 
            log('error', sanitizedService, message, context),
    };
}

// Default logger for general use
export const logger = createLogger('Hedwig');

// Export utilities for testing
export const _internal = {
    sanitizeString,
    redactString,
    redactObject,
};
