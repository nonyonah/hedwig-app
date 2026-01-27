import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { GeminiService } from '../services/gemini';
import { createLogger } from '../utils/logger';

const logger = createLogger('CreationBox');
const router = Router();

/**
 * POST /api/creation-box/parse
 * Parse natural language input to extract intent and structured data
 */
router.post('/parse', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { text } = req.body;

        if (!text || typeof text !== 'string') {
            res.status(400).json({
                success: false,
                error: 'Text input is required'
            });
            return;
        }

        logger.debug('Parsing creation box input', { textLength: text.length });

        // Use Gemini to parse the input
        const prompt = `
You are a structured data extractor for a freelancer financial platform. 
Analyze the following text and extract relevant information for creating invoices, payment links, or contracts.

User input: "${text}"

Extract all of the following and respond ONLY with valid JSON (no markdown, no explanation):
{
    "intent": "invoice" | "payment_link" | "contract" | "unknown",
    "clientName": "string or null",
    "amount": number or null,
    "currency": "USD" | "NGN" | "EUR" | "GBP" | null,
    "dueDate": "ISO 8601 date string or null",
    "priority": "low" | "medium" | "high" | null,
    "title": "string or null",
    "confidence": 0.0-1.0
}

Date parsing rules:
- "tomorrow" = today + 1 day
- "next week" = today + 7 days
- "Friday" = the coming Friday
- "in X days" = today + X days
- If no date mentioned, set to null

Priority parsing rules:
- "p1", "high priority", "urgent", "asap" = "high"
- "p2", "normal", "regular" = "medium"  
- "p3", "low", "whenever" = "low"
- If not mentioned, set to null

Currency rules:
- "$", "dollars", "usd" = "USD"
- "₦", "naira", "ngn" = "NGN"
- "€", "euro", "eur" = "EUR"
- "£", "pounds", "gbp" = "GBP"
- Default to null if unclear
`;

        const result = await GeminiService.generateChatResponse(prompt, [], undefined, {});
        
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
        } = {
            intent: 'unknown',
            clientName: null,
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
            
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const extracted = JSON.parse(jsonMatch[0]);
                parsedData = { ...parsedData, ...extracted };
            }
        } catch (parseError) {
            logger.warn('Failed to parse Gemini response as JSON', { error: parseError });
        }

        // Normalize the date to ISO string if it's a relative date
        if (parsedData.dueDate) {
            try {
                const date = new Date(parsedData.dueDate);
                if (!isNaN(date.getTime())) {
                    parsedData.dueDate = date.toISOString();
                }
            } catch {
                // Keep original value if parsing fails
            }
        }

        logger.debug('Parsed creation box data', { 
            intent: parsedData.intent, 
            hasClient: !!parsedData.clientName,
            hasAmount: !!parsedData.amount 
        });

        res.json({
            success: true,
            data: parsedData
        });

    } catch (error) {
        logger.error('Creation box parsing error', { error });
        next(error);
    }
});

export default router;
