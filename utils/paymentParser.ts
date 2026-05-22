/**
 * Payment Details Parser
 * Extracts bank account, mobile money, and Pix details from raw text strings.
 * Supports Nigeria, Kenya, Tanzania, Uganda, Malawi, and Brazil.
 */

export interface ParsedPaymentDetails {
    country_code: 'NG' | 'KE' | 'TZ' | 'UG' | 'MW' | 'BR' | null;
    payment_method: 'bank_transfer' | 'mobile_money' | 'pix' | null;
    recipient_name: string | null;
    identifier: string | null;
    institution_hint: string | null;
    secondary_reference: string | null;
}

// Nigeria - Bank names and NUBAN (10 digits)
const NIGERIAN_BANKS = [
    'gtbank', 'guaranty trust bank', 'zenith', 'access', 'first bank',
    'uba', 'union bank', 'ecobank', 'fidelity', 'sterling',
    'wema', 'polaris', 'keystone', 'unity', 'heritage',
    'standard chartered', 'citibank', 'kuda', 'opay', 'palmpay',
    'moniepoint', 'sparkle', 'vfd', 'providus', 'jaiz',
];

// Kenya - M-Pesa and banks
const KENYA_NETWORKS = [
    'safaricom', 'm-pesa', 'mpesa', 'airtel kenya', 'telkom',
    'equity', 'kcb', 'co-operative', 'standard chartered kenya',
    'barclays', 'absa', 'nbk', 'family bank', 'diamond trust',
];

// Tanzania - Networks and banks
const TANZANIA_NETWORKS = [
    'vodacom', 'm-pesa tanzania', 'tigo pesa', 'airtel money tanzania',
    'halopesa', 'zantel', 'crdb', 'nbc', 'stanbic tanzania',
    'exim', 'nmb', 'dcb', 'akiba',
];

// Uganda - Networks and banks
const UGANDA_NETWORKS = [
    'mtn uganda', 'mtn mobile money', 'airtel uganda', 'airtel money uganda',
    'stanbic uganda', 'centenary', 'diamond trust uganda', 'barclays uganda',
    'standard chartered uganda', 'bank of uganda',
];

// Malawi - Networks and banks
const MALAWI_NETWORKS = [
    'airtel malawi', 'airtel money malawi', 'tnm', 'mpamba',
    'national bank malawi', 'standard bank malawi', 'nedbank malawi',
    'fdh', 'ecobank malawi', 'first capital',
];

// Pix key type detectors
function detectPixKeyType(key: string): string {
    const clean = key.replace(/[^\d]/g, '');
    if (clean.length === 11) return 'cpf';
    if (clean.length === 14) return 'cnpj';
    if (/^\+55/.test(key) || /^55\d{10,11}$/.test(clean)) return 'phone';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return 'email';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return 'evp_hash';
    return 'unknown';
}

function normalizePixKey(key: string): string {
    // Remove dots, dashes, slashes from CPF/CNPJ
    return key.replace(/[.\-/]/g, '');
}

function inferCountry(text: string): string | null {
    const lower = text.toLowerCase();

    // Brazil
    if (/\bpix\b/i.test(text) || /\bchave\s+pix\b/i.test(text) || /\bcpf\b/i.test(text) || /\bcnpj\b/i.test(text)) {
        return 'BR';
    }

    // Nigeria
    if (/\bnigeria\b/i.test(text) || /\bnaira\b/i.test(text) || /\bngn\b/i.test(text)) {
        return 'NG';
    }
    for (const bank of NIGERIAN_BANKS) {
        if (lower.includes(bank)) return 'NG';
    }

    // Kenya
    if (/\bkenya\b/i.test(text) || /\bkenyan\b/i.test(text) || /\bkes\b/i.test(text) || /\bsafaricom\b/i.test(text)) {
        return 'KE';
    }

    // Tanzania (+255 prefix)
    if (/\+255\d{9}/.test(text) || /\btanzania\b/i.test(text) || /\btzs\b/i.test(text)) {
        return 'TZ';
    }
    for (const network of KENYA_NETWORKS) {
        if (lower.includes(network)) return 'KE';
    }

    // Tanzania
    if (/\btanzania\b/i.test(text) || /\btanzanian\b/i.test(text) || /\btzs\b/i.test(text)) {
        return 'TZ';
    }
    for (const network of TANZANIA_NETWORKS) {
        if (lower.includes(network)) return 'TZ';
    }

    // Uganda
    if (/\buganda\b/i.test(text) || /\bugandan\b/i.test(text) || /\bugx\b/i.test(text)) {
        return 'UG';
    }
    for (const network of UGANDA_NETWORKS) {
        if (lower.includes(network)) return 'UG';
    }

    // Malawi
    if (/\bmalawi\b/i.test(text) || /\bmalawian\b/i.test(text) || /\bmwmk\b/i.test(text)) {
        return 'MW';
    }
    for (const network of MALAWI_NETWORKS) {
        if (lower.includes(network)) return 'MW';
    }

    return null;
}

function extractBankName(text: string): string | null {
    const lower = text.toLowerCase();

    const bankMap: Record<string, string> = {
        'gtbank': 'GTBank',
        'guaranty trust bank': 'GTBank',
        'zenith': 'Zenith Bank',
        'access': 'Access Bank',
        'first bank': 'First Bank of Nigeria',
        'uba': 'United Bank for Africa',
        'union bank': 'Union Bank',
        'ecobank': 'Ecobank',
        'fidelity': 'Fidelity Bank',
        'sterling': 'Sterling Bank',
        'wema': 'Wema Bank',
        'polaris': 'Polaris Bank',
        'keystone': 'Keystone Bank',
        'unity': 'Unity Bank',
        'heritage': 'Heritage Bank',
        'standard chartered': 'Standard Chartered',
        'kuda': 'Kuda Bank',
        'opay': 'OPay',
        'moniepoint': 'Moniepoint',
    };

    for (const [key, name] of Object.entries(bankMap)) {
        if (lower.includes(key)) return name;
    }

    // Generic "Bank" match
    const bankMatch = text.match(/([A-Z][a-zA-Z\s]+(?:Bank|Banco|Microfinance))/);
    if (bankMatch) return bankMatch[1].trim();

    return null;
}

function extractMobileNetwork(text: string): string | null {
    const lower = text.toLowerCase();

    if (lower.includes('m-pesa') || lower.includes('mpesa')) return 'M-Pesa';
    if (lower.includes('safaricom')) return 'Safaricom M-Pesa';
    if (lower.includes('tigo pesa')) return 'Tigo Pesa';
    if (lower.includes('airtel money tanzania')) return 'Airtel Money';
    if (lower.includes('airtel money')) return 'Airtel Money';
    if (lower.includes('airtel')) return 'Airtel';
    if (lower.includes('mtn mobile money') || lower.includes('mtn momo')) return 'MTN Mobile Money';
    if (lower.includes('mtn')) return 'MTN';
    if (lower.includes('halopesa')) return 'HaloPesa';
    if (lower.includes('tnm mpamba') || lower.includes('mpamba')) return 'TNM Mpamba';

    return null;
}

function extractAccountNumber(text: string): string | null {
    // Nigeria NUBAN: 10 digits
    const nubanMatch = text.match(/\b(\d{10})\b/);
    if (nubanMatch) return nubanMatch[1];

    // Generic account number (6-20 digits)
    const genericMatch = text.match(/(?:account\s*(?:number|no)?[:\s]*)(\d{6,20})/i);
    if (genericMatch) return genericMatch[1];

    return null;
}

function extractPhoneNumber(text: string): string | null {
    // Match various phone formats
    const patterns = [
        /(?:phone|mobile|tel|contact|number)[:\s]*([+\d\s-]{10,20})/i,
        /\b(07\d{8,9})\b/,  // Kenya/Tanzania/Uganda format
        /\b(01\d{8,9})\b/,  // Nigeria format
        /\b(\+\d{1,3}[\s-]?\d{9,12})\b/,  // International format
        /\b(\d{3}[\s-]\d{3}[\s-]\d{4})\b/,  // US-style
        /\b(0\d{9,10})\b/,  // General format with leading zero
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1].replace(/[\s-]/g, '');
        }
    }

    return null;
}

function extractPixKey(text: string): { key: string; type: string } | null {
    // Random UUID/EVP hash first (to avoid being caught by other patterns)
    const uuidMatch = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch) {
        return { key: uuidMatch[1], type: 'evp_hash' };
    }

    // Email format
    const emailMatch = text.match(/(?:pix|chave)?[:\s]*([^\s@]+@[^\s@]+\.[^\s@]+)/i);
    if (emailMatch && !emailMatch[1].match(/^\d+$/)) {
        return { key: emailMatch[1], type: 'email' };
    }

    // CNPJ: 14 digits (check before CPF since it's longer)
    const cnpjMatch = text.match(/(\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/);
    if (cnpjMatch) {
        const clean = normalizePixKey(cnpjMatch[1]);
        if (clean.length === 14) {
            return { key: clean, type: 'cnpj' };
        }
    }

    // CPF: 11 digits (with or without formatting)
    const cpfMatch = text.match(/(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})/);
    if (cpfMatch) {
        const clean = normalizePixKey(cpfMatch[1]);
        if (clean.length === 11) {
            return { key: clean, type: 'cpf' };
        }
    }

    // Phone with +55
    const phoneMatch = text.match(/(?:\+55\s*)?(\(?\d{2}\)?[\s-]?\d{4,5}[-\s]?\d{4})/);
    if (phoneMatch) {
        const key = phoneMatch[1].replace(/[\s\-\(\)]/g, '');
        return { key: `+55${key}`, type: 'phone' };
    }

    return null;
}

function extractRecipientName(text: string): string | null {
    // Look for patterns like "Name: John Doe" or "Account Name: Jane Smith"
    const namePatterns = [
        /(?:name|account name|recipient|beneficiary|titular)[:\s]*([A-Z][a-zA-Z\s\.]+?)(?:\s*(?:\n|Account|Bank|Number|Phone|\d{3,}|$))/i,
        /(?:send to|transfer to|payment to)[:\s]*([A-Z][a-zA-Z\s\.]+?)(?:\s*(?:\n|Account|Bank|Number|Phone|\d{3,}|$))/i,
        // Match name between delimiters like "Bank / Name / Number"
        /\/(?:\s*)([A-Z][a-zA-Z\s\.]+?)(?:\s*)\//,
    ];

    for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match) {
            const name = match[1].trim();
            // Filter out common non-name words
            if (name.length > 2 && !/\b(bank|account|transfer|payment|send|money|cash|mobile|phone)\b/i.test(name)) {
                return name;
            }
        }
    }

    return null;
}

function extractPaybillReference(text: string): string | null {
    const match = text.match(/(?:paybill|account reference|reference|acc ref)[:\s]*([\w\d-]+)/i);
    if (match) return match[1];
    return null;
}

function extractPaybillNumber(text: string): string | null {
    // For formats like "M-Pesa Paybill: 247247"
    const match = text.match(/(?:paybill|business number|till number)[:\s]*(\d{4,6})/i);
    if (match) return match[1];
    return null;
}

export function parsePaymentDetails(rawText: string): ParsedPaymentDetails {
    const text = rawText.trim();

    if (!text) {
        return {
            country_code: null,
            payment_method: null,
            recipient_name: null,
            identifier: null,
            institution_hint: null,
            secondary_reference: null,
        };
    }

    // Infer country first
    const countryCode = inferCountry(text);

    // Try Pix (Brazil) first
    if (countryCode === 'BR') {
        const pixData = extractPixKey(text);
        if (pixData) {
            return {
                country_code: 'BR',
                payment_method: 'pix',
                recipient_name: extractRecipientName(text),
                identifier: pixData.key,
                institution_hint: pixData.type,
                secondary_reference: null,
            };
        }
    }

    // Try bank transfer
    const accountNumber = extractAccountNumber(text);
    const bankName = extractBankName(text);
    const recipientName = extractRecipientName(text);

    if (accountNumber && bankName) {
        return {
            country_code: (countryCode as any) || 'NG',
            payment_method: 'bank_transfer',
            recipient_name: recipientName,
            identifier: accountNumber,
            institution_hint: bankName,
            secondary_reference: null,
        };
    }

    // Try mobile money
    const phoneNumber = extractPhoneNumber(text);
    const network = extractMobileNetwork(text);
    const paybillRef = extractPaybillReference(text);

    if (phoneNumber || (network && countryCode)) {
        const paybillNumber = extractPaybillNumber(text);
        // If we have both paybill number and a separate account reference
        const accountRef = text.match(/(?:account)[:\s]*(\d{4,})/i)?.[1];
        return {
            country_code: (countryCode as any) || 'KE',
            payment_method: 'mobile_money',
            recipient_name: recipientName,
            identifier: paybillNumber || phoneNumber,
            institution_hint: network,
            secondary_reference: accountRef || null,
        };
    }

    // Fallback - try to extract anything useful
    const anyNumber = text.match(/\b(\d{6,})\b/);

    return {
        country_code: (countryCode as any) || null,
        payment_method: null,
        recipient_name: recipientName,
        identifier: anyNumber ? anyNumber[1] : null,
        institution_hint: bankName || network,
        secondary_reference: paybillRef,
    };
}
