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
        const { text, currentDate } = req.body;

        if (!text || typeof text !== 'string') {
            res.status(400).json({
                success: false,
                error: 'Text input is required'
            });
            return;
        }

        // Use provided currentDate or fallback to server time
        const referenceDate = currentDate ? new Date(currentDate) : new Date();
        
        logger.debug('[CreationBox] Parsing input', { textLength: text.length, text, referenceDate: referenceDate.toISOString() });

        // Build prompt with date context for accurate relative date parsing
        const dateContext = `Today is ${referenceDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Current time: ${referenceDate.toLocaleTimeString('en-US')}.`;
        const enrichedText = `${dateContext}\n\nUser input: ${text}`;
        
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
            dueDate: string | null;
            priority: string | null;
            title: string | null;
            confidence: number;
            clientEmail: string | null;
            parameters?: any;
        } = {
            intent: 'unknown',
            clientName: null,
            clientEmail: null,
            amount: null,
            currency: null,
            dueDate: null,
            priority: null,
            title: null,
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
                parsedData.intent = extracted.intent || parsedData.intent;
                
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
                        // Sum up items if available
                        const total = params.items.reduce((sum: number, item: any) => {
                            const val = item.amount ? parseFloat(item.amount.toString().replace(/[^0-9.]/g, '')) : 0;
                            return sum + (isNaN(val) ? 0 : val);
                        }, 0);
                        if (total > 0) parsedData.amount = total;
                    }
                    
                    // Currency
                    parsedData.currency = params.currency || 'USD';
                    
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
                    
                    // Title
                    parsedData.title = params.title || params.description || text.substring(0, 50);
                } else {
                    // Fallback: try to extract from top-level fields
                    parsedData.clientName = extracted.clientName || extracted.client_name || null;
                    parsedData.clientEmail = extracted.clientEmail || extracted.client_email || extracted.email || null;
                    parsedData.amount = extracted.amount || null;
                    parsedData.currency = extracted.currency || 'USD';
                    parsedData.dueDate = extracted.dueDate || extracted.due_date || null;
                    parsedData.priority = extracted.priority || null;
                    parsedData.title = extracted.title || text.substring(0, 50);
                }
                
                parsedData.confidence = extracted.confidence || 0.7;
            } else {
                logger.warn('[CreationBox] No JSON found in response, using defaults');
                // Try to extract basic info from text
                parsedData.title = text.substring(0, 50);
                
                // Simple intent detection
                const lowerText = text.toLowerCase();
                if (lowerText.includes('invoice')) {
                    parsedData.intent = 'invoice';
                } else if (lowerText.includes('payment link') || lowerText.includes('pay link')) {
                    parsedData.intent = 'payment_link';
                } else if (lowerText.includes('contract')) {
                    parsedData.intent = 'contract';
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
