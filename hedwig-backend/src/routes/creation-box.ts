import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { GeminiService } from '../services/gemini';
import { createLogger } from '../utils/logger';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { requireProFeatureAccess } from '../services/billingRules';

const logger = createLogger('CreationBox');
const router = Router();

const unwrapNaturalResponse = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed?.naturalResponse === 'string') return parsed.naturalResponse;
            if (typeof parsed?.response === 'string') return parsed.response;
            if (typeof parsed?.message === 'string') return parsed.message;
        } catch {
            // Keep original string if it's not valid JSON.
        }
    }

    return value;
};

const buildFallbackDocumentTitle = (
    intent: string | null | undefined,
    clientName: string | null | undefined,
    clientEmail: string | null | undefined,
    text: string
): string | null => {
    const normalizedIntent = String(intent || '').toLowerCase();
    const baseLabel = normalizedIntent === 'payment_link' ? 'Payment Link' : 'Invoice';

    if (clientName) {
        return `${baseLabel} for ${clientName}`;
    }

    if (clientEmail) {
        const namePart = clientEmail.split('@')[0]?.trim();
        if (namePart) {
            return `${baseLabel} for ${namePart.charAt(0).toUpperCase() + namePart.slice(1)}`;
        }
    }

    if (normalizedIntent === 'invoice') {
        const forMatch = text.match(/invoice\s+for\s+(.+?)(\s+(?:\$|due|at)|$)/i);
        if (forMatch) {
            return `Invoice for ${forMatch[1].trim()}`;
        }
    }

    if (normalizedIntent === 'payment_link') {
        const linkForMatch = text.match(/(?:payment link|pay link)\s+for\s+(.+?)(\s+(?:\$|due|at)|$)/i);
        if (linkForMatch) {
            return `Payment Link for ${linkForMatch[1].trim()}`;
        }
    }

    return null;
};

/**
 * Reject a title that is just the user's raw prompt echoed back.
 * Accepts only short, descriptive labels (≤ 60 chars, no action verbs at the start,
 * and not a substring match of the original input).
 */
const sanitizeTitle = (candidate: string | null | undefined, originalText: string): string | null => {
    if (!candidate) return null;
    const t = candidate.trim();
    if (!t) return null;

    // Too long to be a useful label
    if (t.length > 60) return null;

    // Starts with action verbs typically copied from the prompt
    if (/^(create|make|send|generate|build|please|i need|i want)/i.test(t)) return null;

    // Nearly identical to the original input (case-insensitive)
    if (t.toLowerCase() === originalText.toLowerCase().trim()) return null;

    // The original text contains the candidate verbatim (it's just a slice of the prompt)
    if (originalText.toLowerCase().includes(t.toLowerCase()) && t.split(' ').length > 6) return null;

    return t;
};

/**
 * POST /api/creation-box/parse
 * Parse natural language input to extract intent and structured data
 * Uses Gemini's full system instructions for better intent recognition
 */
router.post('/parse', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { text, currentDate, mode } = req.body;

        if (!text || typeof text !== 'string') {
            res.status(400).json({
                success: false,
                error: 'Text input is required'
            });
            return;
        }

        // Pro gate — Creation Box uses Gemini per call. Greetings short-circuit
        // below before the gate so basic UX still works on the free plan.
        const referenceDate = currentDate ? new Date(currentDate) : new Date();

        // Short-circuit for simple greetings — don't call the AI so it can't hallucinate
        // capabilities we haven't exposed in this surface.
        const isGreeting = !mode && /^\s*(hi+|hey+|hello+|howdy|good\s+(morning|afternoon|evening)|greetings|sup|what'?s\s+up)\s*[!?.]*\s*$/i.test(text.trim());
        if (isGreeting) {
            res.json({
                success: true,
                data: {
                    intent: 'unknown',
                    clientName: null, clientEmail: null,
                    amount: null, currency: null, chain: null,
                    dueDate: null, priority: null, title: null,
                    confidence: 1,
                    naturalResponse: "Hi! I can help you create invoices, payment links, and set up recurring invoices. What would you like to do?",
                },
            });
            return;
        }

        logger.debug('[CreationBox] Parsing input', { textLength: text.length, text, referenceDate: referenceDate.toISOString(), mode });

        // Pro gate — block before LLM call, after greeting short-circuit.
        const gateUser = await getOrCreateUser(req.user!.id);
        if (!gateUser) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }
        const gateEnabledAt = process.env.HEDWIG_AI_GATE_ENABLED_AT || '';
        const grandfathered = gateEnabledAt
            && gateUser.created_at
            && Date.parse(gateUser.created_at) < Date.parse(gateEnabledAt);
        if (!grandfathered) {
            const access = await requireProFeatureAccess(gateUser as any, 'creation_box');
            if (!access.allowed) {
                res.status(402).json({
                    success: false,
                    error: { code: 'requires_pro', message: access.message || 'Upgrade to Pro to use this feature.' },
                });
                return;
            }
        }

        // Build prompt with date context for accurate relative date parsing
        const dateContext = `Today is ${referenceDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Current time: ${referenceDate.toLocaleTimeString('en-US')}.`;

        // Load user's existing clients so Gemini can match names intelligently
        let clientsContext: { id: string; name: string; email: string | null; phone: string | null; company: string | null }[] = [];
        try {
            const user = gateUser;
            if (user?.id) {
                const { data: clients } = await supabase
                    .from('clients')
                    .select('id, name, email, phone, company')
                    .eq('user_id', user.id)
                    .limit(50);
                if (clients) clientsContext = clients;
            }
        } catch (e) {
            logger.warn('[CreationBox] Could not load clients context', { error: e });
        }

        // CREATION BOX OVERRIDES: network defaults to base — never ask for it
        const networkDefault = `
CREATION BOX RULES (override chat rules):
- Network/chain is ALWAYS "base" unless the user explicitly says "solana". NEVER ask for network.
- client_name and client_email are OPTIONAL. NEVER block creation if they are missing.
- If the user mentions a client by first name only, match it against saved clients intelligently.
- Always respond with CREATE_INVOICE or CREATE_PAYMENT_LINK (never COLLECT_INVOICE_NETWORK or COLLECT_INVOICE_INFO) when amount and due_date are present.
`;

        let modeInstruction = '';
        if (mode === 'payment_link') {
            modeInstruction = `
User has explicitly selected PAYMENT LINK mode.
EXPECTED INPUT FORMAT: [Title] [Amount] [Recipient].
- Extract 'title' from the text (do not use generic "Payment Link" if a specific title is provided).
- Extract 'amount' and 'currency'.
- Extract 'recipient' (email or name).
- Extract 'dueDate' if mentioned (preferably in YYYY-MM-DD format).
- Intent MUST be 'payment_link'.
`;
        } else if (mode === 'invoice') {
            modeInstruction = `
User has explicitly selected INVOICE mode.
EXPECTED INPUT FORMAT: [Title] [Amount] [Recipient] [Milestones/Items].
- Extract 'title' for the invoice.
- Extract 'amount' and 'currency'.
- Extract 'recipient' (email or name).
- Extract 'items' if listed.
- Extract 'dueDate' if mentioned (preferably in YYYY-MM-DD format).
- Intent MUST be 'invoice'.
`;
        }

        const enrichedText = `${dateContext}\n${networkDefault}\n${modeInstruction}\nUser input: ${text}`;

        // Use Gemini's chat response with the user's saved clients so names are matched intelligently
        const result = await GeminiService.generateChatResponse(enrichedText, [], undefined, {
            clients: clientsContext,
        });
        const topLevelNaturalResponse =
            (typeof result === 'object' && result && typeof (result as any).naturalResponse === 'string'
                ? (result as any).naturalResponse
                : null) ||
            (typeof result === 'object' && result && typeof (result as any).response === 'string'
                ? (result as any).response
                : null);
        
        logger.debug('[CreationBox] Gemini raw response', { result });

        // Extract JSON from the response
        let parsedData: {
            intent: string;
            clientName: string | null;
            amount: number | null;
            currency: string | null;
            chain: string | null;
            dueDate: string | null;
            priority: string | null;
            title: string | null;
            naturalResponse: string | null;
            confidence: number;
            clientEmail: string | null;
            items: Array<{ description: string; amount: number }> | null;
            recipient?: string | null;
            parameters?: any;
        } = {
            intent: mode || 'unknown', // Default to mode if provided
            clientName: null,
            clientEmail: null,
            amount: null,
            currency: null,
            chain: null,
            dueDate: null,
            priority: null,
            title: null,
            naturalResponse: null,
            items: null,
            recipient: null,
            confidence: 0.5
        };

        try {
            // Handle both string responses and object responses
            const responseText = typeof result === 'string' ? result : 
                (result.textResponse || result.response || JSON.stringify(result));
            
            logger.debug('[CreationBox] Processing response text', { responseText: responseText.substring(0, 200) });

            // Try to extract JSON object from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const extracted = JSON.parse(jsonMatch[0]);
                logger.debug('[CreationBox] Extracted JSON', { extracted });

                // Map Gemini response to our format
                parsedData.intent = mode || extracted.intent || parsedData.intent; // Prioritize explicit mode
                parsedData.naturalResponse = unwrapNaturalResponse(extracted.naturalResponse);
                
                // Extract parameters if available
                if (extracted.parameters) {
                    const params = extracted.parameters;
                    
                    // Client name
                    parsedData.clientName = params.clientName || params.client_name || null;
                    
                    // Client email
                    parsedData.clientEmail = params.clientEmail || params.client_email || params.email || null;
                    
                    // Amount - handle various formats
                    // Amount - handle various formats including nested items
                    if (params.amount) {
                        const amountStr = typeof params.amount === 'string' 
                            ? params.amount.replace(/[^0-9.]/g, '') 
                            : params.amount.toString();
                        parsedData.amount = parseFloat(amountStr);
                    } else if (params.items && Array.isArray(params.items) && params.items.length > 0) {
                        // Sum up items if available and map them
                        const items: any[] = [];
                        const total = params.items.reduce((sum: number, item: any) => {
                            const val = item.amount ? parseFloat(item.amount.toString().replace(/[^0-9.]/g, '')) : 0;
                            if (item.description || item.amount) {
                                items.push({
                                    description: item.description || 'Item',
                                    amount: val
                                });
                            }
                            return sum + (isNaN(val) ? 0 : val);
                        }, 0);
                        
                        if (total > 0) parsedData.amount = total;
                        if (items.length > 0) parsedData.items = items;
                    }
                    
                    // Currency/Token
                    parsedData.currency = params.currency || params.token || 'USDC';

                    // Chain/Network
                    if (params.chain || params.network) {
                         parsedData.chain = params.chain || params.network;
                    }

                    // Recipient for Transfers
                    if (params.recipient || params.to_address || params.toAddress) {
                        parsedData.recipient = params.recipient || params.to_address || params.toAddress;
                    }
                    
                    // Due date
                    if (params.dueDate || params.due_date) {
                        parsedData.dueDate = params.dueDate || params.due_date;
                    }
                    
                    // Priority
                    if (params.priority) {
                        const priorityStr = params.priority.toLowerCase();
                        if (priorityStr.includes('high') || priorityStr === 'p1') {
                            parsedData.priority = 'high';
                        } else if (priorityStr.includes('medium') || priorityStr === 'p2') {
                            parsedData.priority = 'medium';
                        } else if (priorityStr.includes('low') || priorityStr === 'p3') {
                            parsedData.priority = 'low';
                        }
                    }
                    
                    // Title - validate it's a short descriptive label, not the raw prompt
                    parsedData.title = sanitizeTitle(params.title || params.description || null, text);
                } else {
                    // Fallback: try to extract from top-level fields
                    parsedData.clientName = extracted.clientName || extracted.client_name || null;
                    parsedData.clientEmail = extracted.clientEmail || extracted.client_email || extracted.email || null;
                    parsedData.amount = extracted.amount || null;
                    parsedData.currency = extracted.currency || extracted.token || 'USDC';
                    parsedData.chain = extracted.chain || extracted.network || null;
                    parsedData.recipient = extracted.recipient || extracted.to_address || extracted.toAddress || null;
                    parsedData.dueDate = extracted.dueDate || extracted.due_date || null;
                    parsedData.priority = extracted.priority || null;
                    parsedData.title = sanitizeTitle(extracted.title || null, text);
                }
                
                parsedData.confidence = extracted.confidence || 0.7;
            } else {
                logger.warn('[CreationBox] No JSON found in response, using defaults');
                // Try to extract basic info from text
                // Only use fallbacks if mode isn't set or if we need to fill gaps
                
                parsedData.title = null;
                
                // Simple intent detection (only if mode not provided)
                if (!mode) {
                    const lowerText = text.toLowerCase();
                    if (lowerText.includes('payment link') || lowerText.includes('pay link')) {
                        parsedData.intent = 'payment_link';
                        parsedData.title = 'Payment Link'; 
                    } else if (lowerText.includes('invoice')) {
                        parsedData.intent = 'invoice'; 
                        parsedData.title = 'Invoice'; 
                    } else if (lowerText.includes('send') || lowerText.includes('transfer') || lowerText.includes('pay')) {
                        parsedData.intent = 'transfer';
                        parsedData.title = 'Transfer';
                    }
                }
                
                // Extract amount if present
                const amountMatch = text.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)|(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:dollars|usd)/i);
                if (amountMatch) {
                    const amountStr = (amountMatch[1] || amountMatch[2]).replace(/,/g, '');
                    parsedData.amount = parseFloat(amountStr);
                }
            }
        } catch (parseError) {
            logger.error('[CreationBox] Failed to parse Gemini response', { error: parseError, result });
        }

        // Ensure natural response is always available for chat/general intents
        if (!parsedData.naturalResponse && topLevelNaturalResponse) {
            parsedData.naturalResponse = unwrapNaturalResponse(topLevelNaturalResponse);
        }
        if (!parsedData.naturalResponse && String(parsedData.intent || '').toLowerCase() === 'general_chat') {
            parsedData.naturalResponse = "I’m here to help. Tell me what you want to do, and I’ll guide you.";
        }

        // FORCE OVERRIDES
        const lowerText = text.toLowerCase();

        // 1. Normalize intent — Gemini may return 'CREATE_INVOICE', 'CREATE_PAYMENT_LINK', etc.
        const rawIntent = String(parsedData.intent || '').toLowerCase();
        if (rawIntent === 'invoice' || rawIntent === 'create_invoice' || rawIntent.startsWith('invoice')) {
            parsedData.intent = 'invoice';
        } else if (rawIntent === 'payment_link' || rawIntent === 'create_payment_link' || rawIntent.startsWith('payment_link')) {
            parsedData.intent = 'payment_link';
        } else if (rawIntent === 'create_recurring_invoice' || rawIntent === 'recurring_invoice' || rawIntent.startsWith('recurring')) {
            parsedData.intent = 'recurring_invoice';
        }
        // COLLECT_* intents → leave amount/date intact, just normalize to the right creation intent
        if (rawIntent.startsWith('collect_invoice') || rawIntent === 'collect_invoice_info' || rawIntent === 'collect_invoice_network') {
            parsedData.intent = 'invoice';
        } else if (rawIntent.startsWith('collect_payment') || rawIntent === 'collect_payment_info' || rawIntent === 'collect_network_info') {
            parsedData.intent = 'payment_link';
        }

        // Also extract recurring-specific params from Gemini parameters
        if (parsedData.intent === 'recurring_invoice' && parsedData.parameters) {
            const params = parsedData.parameters;
            (parsedData as any).frequency = params.frequency || 'monthly';
            (parsedData as any).autoSend = params.auto_send === true || params.autoSend === true;
            (parsedData as any).startDate = params.start_date || params.startDate || null;
            (parsedData as any).endDate = params.end_date || params.endDate || null;
        }

        // 2. Force Mode if explicitly selected — always wins
        if (mode) {
            parsedData.intent = mode;
        } else {
            // Legacy detection from text keywords
            if (lowerText.includes('payment link') || lowerText.includes('pay link')) {
                parsedData.intent = 'payment_link';
            }
            // Recurring keyword detection as fallback
            if (!mode && (lowerText.includes('recurring') || lowerText.includes('repeat invoice') || lowerText.includes('monthly invoice') || lowerText.includes('weekly invoice'))) {
                parsedData.intent = 'recurring_invoice';
            }
        }

        // 3. Disable Contracts (Strict)
        if (parsedData.intent === 'contract' || lowerText.includes('contract')) {
             parsedData.intent = 'contract_disabled'; 
             parsedData.items = []; 
             parsedData.amount = null;
        }

        // Fallback: If no date extracted by AI, try regex on the original text
        if (!parsedData.dueDate) {
            const datePatterns = [
                /\bdue\s+(?:on\s+)?(today|tomorrow|next\s+\w+|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
                /\bdue\s+(?:in\s+)?(\d+)\s+days?/i,
                /\bdue\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i
            ];

            for (const pattern of datePatterns) {
                const match = text.match(pattern);
                if (match) {
                    parsedData.dueDate = match[1];
                    logger.info('[CreationBox] Extracted due date via regex fallback', { extracted: match[1] });
                    break;
                }
            }
        }

        // Fallback: If no email extracted, try regex
        if (!parsedData.clientEmail) {
            const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) {
                parsedData.clientEmail = emailMatch[0];
                logger.info('[CreationBox] Extracted email via regex fallback', { extracted: emailMatch[0] });
                
                // If no client name, try to derive from email
                if (!parsedData.clientName) {
                    const namePart = parsedData.clientEmail.split('@')[0];
                    // Capitalize first letter
                    parsedData.clientName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
                }
            }
        }

        // Fallback: If no amount, try regex again (strict)
        if (!parsedData.amount) {
            const amountMatch = text.match(/(?:\$|USD\s?)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
            if (amountMatch) {
                 parsedData.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                 logger.info('[CreationBox] Extracted amount via regex fallback', { extracted: parsedData.amount });
            }
        }

        // Fallback: Improve title if it's missing
        if (!parsedData.title) {
            parsedData.title = buildFallbackDocumentTitle(
                parsedData.intent,
                parsedData.clientName,
                parsedData.clientEmail,
                text
            );

            if (!parsedData.clientName && parsedData.intent === 'invoice') {
                const forMatch = text.match(/invoice\s+for\s+(.+?)(\s+(?:\$|due|at)|$)/i);
                if (forMatch) {
                    const extractedName = forMatch[1].trim();
                    parsedData.clientName = extractedName;
                    logger.info('[CreationBox] Extracted client name via regex fallback (invoice)', { extracted: extractedName });
                }
            }
        }

        // Fallback: Generic client name extraction if still missing (works for payment links too)
        if (!parsedData.clientName) {
             // Look for "for [Name]" pattern, stopping at keywords like $, due, at, on, with
             const forMatch = text.match(/\bfor\s+([A-Z][a-zA-Z0-9\s]+?)(?:\s+(?:\$|due|at|on|with|and)|$)/);
             if (forMatch) {
                 const extractedName = forMatch[1].trim();
                 // Avoid capturing common words if they happen to run in
                 if (extractedName.length > 2 && !['invoice', 'payment', 'link'].includes(extractedName.toLowerCase())) {
                     parsedData.clientName = extractedName;
                     logger.info('[CreationBox] Extracted client name via regex fallback (generic)', { extracted: extractedName });
                 }
             }
        }

        // Smart date parsing - handle relative dates like "Friday", "next Monday", etc.
        if (parsedData.dueDate) {
            try {
                let date: Date | null = null;
                const dueDateStr = parsedData.dueDate.toLowerCase().trim();
                
                // Try parsing as ISO date first
                const isoDate = new Date(parsedData.dueDate);
                if (!isNaN(isoDate.getTime()) && parsedData.dueDate.includes('-')) {
                    date = isoDate;
                } else {
                    // Parse relative dates
                    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                    const today = new Date(referenceDate);
                    today.setHours(0, 0, 0, 0);
                    
                    // Check for Month Day format (e.g. "Feb 25", "February 25th")
                    // Matches: Jan, Feb, January, etc. + space + 1-31 + optional st/nd/rd/th + optional year
                    const monthMatch = dueDateStr.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/i);
                    
                    if (monthMatch) {
                        const monthName = monthMatch[1].toLowerCase();
                        const day = parseInt(monthMatch[2]);
                        const year = monthMatch[3] ? parseInt(monthMatch[3]) : today.getFullYear();
                        
                        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                        const monthIndex = months.findIndex(m => monthName.startsWith(m));
                        
                        if (monthIndex >= 0) {
                            date = new Date(year, monthIndex, day);
                            
                            // If no year specified and date is in the past (more than 30 days?), assume next year?
                            // Or generally, invoices are future.
                            // If Today is Dec 2024, and user says "Jan 5", they likely mean Jan 2025.
                            // If Today is Jan 2024, and user says "Feb 25", they mean Feb 2024.
                            if (!monthMatch[3] && date < today) {
                                // If the date is in the past, add one year
                                date.setFullYear(year + 1);
                            }
                        }
                    } else {
                        // Check for day names (e.g., "Friday", "next Monday")
                        const isNextWeek = dueDateStr.includes('next');
                        const dayMatch = dayNames.find(day => dueDateStr.includes(day));
                        
                        if (dayMatch) {
                            const targetDayIndex = dayNames.indexOf(dayMatch);
                            const currentDayIndex = today.getDay();
                            let daysToAdd = targetDayIndex - currentDayIndex;
                            
                            if (daysToAdd <= 0 || isNextWeek) {
                                daysToAdd += 7; // Move to next week
                            }
                            if (isNextWeek && daysToAdd <= 7) {
                                daysToAdd += 7; // "next Friday" when today is Thursday
                            }
                            
                            date = new Date(today);
                            date.setDate(today.getDate() + daysToAdd);
                        } else if (dueDateStr.includes('today')) {
                            date = today;
                        } else if (dueDateStr.includes('tomorrow')) {
                            date = new Date(today);
                            date.setDate(today.getDate() + 1);
                        } else if (dueDateStr.includes('next week')) {
                            date = new Date(today);
                            date.setDate(today.getDate() + 7);
                        } else if (dueDateStr.includes('end of week') || dueDateStr.includes('this week')) {
                            // Find next Friday
                            const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
                            date = new Date(today);
                            date.setDate(today.getDate() + daysUntilFriday);
                        } else if (dueDateStr.includes('end of month')) {
                            date = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                        }
                    }
                }
                
                if (date && !isNaN(date.getTime())) {
                    parsedData.dueDate = date.toISOString();
                } else {
                    // If we couldn't parse, set to null instead of Invalid Date
                    logger.warn('[CreationBox] Could not parse date, setting to null', { dueDate: parsedData.dueDate });
                    parsedData.dueDate = null;
                }
            } catch {
                logger.warn('[CreationBox] Failed to parse date', { dueDate: parsedData.dueDate });
                parsedData.dueDate = null;
            }
        }

        logger.info('[CreationBox] Parsed data successfully', { 
            intent: parsedData.intent, 
            hasClient: !!parsedData.clientName,
            hasAmount: !!parsedData.amount,
            hasDueDate: !!parsedData.dueDate,
            priority: parsedData.priority
        });

        res.json({
            success: true,
            data: parsedData
        });

    } catch (error) {
        logger.error('[CreationBox] Parsing error', { error });
        next(error);
    }
});

export default router;
