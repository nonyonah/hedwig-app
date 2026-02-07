import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { GeminiService } from '../services/gemini';
import { createLogger } from '../utils/logger';

const logger = createLogger('CreationBox');
const router = Router();

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

        // Use provided currentDate or fallback to server time
        const referenceDate = currentDate ? new Date(currentDate) : new Date();
        
        logger.debug('[CreationBox] Parsing input', { textLength: text.length, text, referenceDate: referenceDate.toISOString(), mode });

        // Build prompt with date context for accurate relative date parsing
        const dateContext = `Today is ${referenceDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Current time: ${referenceDate.toLocaleTimeString('en-US')}.`;
        
        let modeInstruction = '';
        if (mode === 'payment_link') {
            modeInstruction = `
User has explicitly selected PAYMENT LINK mode.
EXPECTED INPUT FORMAT: [Title] [Amount] [Recipient].
- Extract 'title' from the text (do not use generic "Payment Link" if a specific title is provided).
- Extract 'amount' and 'currency'.
- Extract 'recipient' (email or name).
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
- Intent MUST be 'invoice'.
`;
        }

        const enrichedText = `${dateContext}\n${modeInstruction}\nUser input: ${text}`;
        
        // Use Gemini's chat response which includes system instructions for intent recognition
        // This will properly detect intents like invoice, payment_link, contract, etc.
        const result = await GeminiService.generateChatResponse(enrichedText, [], undefined, {});
        
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
                    
                    // Title - Do NOT default to text
                    parsedData.title = params.title || params.description || null;
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
                    parsedData.title = extracted.title || null;
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

        // FORCE OVERRIDES
        const lowerText = text.toLowerCase();
        
        // 1. Force Mode if provided
        if (mode) {
            parsedData.intent = mode;
        } else {
             // Legacy detection
            if (lowerText.includes('payment link') || lowerText.includes('pay link')) {
                parsedData.intent = 'payment_link';
            }
        }
        
        // 2. Disable Contracts (Strict)
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

        // Fallback: Improve title if it's missing or valid
        if (!parsedData.title) {
            if (parsedData.clientName) {
                parsedData.title = `Invoice for ${parsedData.clientName}`;
            } else if (parsedData.intent === 'invoice') {
                // Try to find "for [Something]"
                const forMatch = text.match(/invoice\s+for\s+(.+?)(\s+(?:\$|due|at)|$)/i);
                if (forMatch) {
                    const extractedName = forMatch[1].trim();
                    parsedData.title = `Invoice for ${extractedName}`;
                    // Also set client name if missing
                    if (!parsedData.clientName) {
                        parsedData.clientName = extractedName;
                        logger.info('[CreationBox] Extracted client name via regex fallback (invoice)', { extracted: extractedName });
                    }
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
