import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables');
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use Gemini 2.0 Flash model
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

export class GeminiService {
    /**
     * Get comprehensive Hedwig system instructions
     */
    static getSystemInstructions(): string {
        return `You are Hedwig, a friendly and intelligent AI assistant for freelancers and creators. You help users manage their freelance business.

IMPORTANT: Always respond with valid JSON in this format:
{
  "intent": "<intent_name>",
  "params": {...},
  "naturalResponse": "A friendly, conversational response to the user"
}

VALID INTENTS:
- create_invoice: For creating professional invoices
- create_proposal: For generating project proposals or quotes
- create_contract: For creating service agreements or contracts
- create_payment_link: For generating payment request links
- general_chat: For conversations, greetings, and questions

INTENT RECOGNITION RULES:

1. INVOICE: "invoice", "bill", "create invoice"
2. PROPOSAL: "proposal", "quote", "estimate"
3. CONTRACT: "contract", "agreement"
4. PAYMENT LINK: "payment link", "payment request"
5. GENERAL CHAT: greetings, questions, casual conversation

Be warm, professional, and helpful. Always include a naturalResponse in your JSON output.`;
    }

    /**
     * Generate chat response with Hedwig's personality
     */
    static async generateChatResponse(
        userMessage: string,
        conversationHistory?: { role: string; content: string }[]
    ): Promise<string> {
        try {
            const chat = model.startChat({
                history: conversationHistory?.map((msg) => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }],
                })),
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.7,
                },
            });

            const result = await chat.sendMessage(userMessage);
            const response = await result.response;
            let responseText = response.text();

            // Try to parse JSON response and extract naturalResponse
            try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.naturalResponse) {
                        return parsed.naturalResponse;
                    }
                }
            } catch (e) {
                // Not JSON, return as-is
            }

            return responseText;
        } catch (error) {
            console.error('Gemini API error:', error);
            throw new Error('Failed to generate AI response');
        }
    }

    /**
     * Detect user intent (what document they want to create)
     */
    static async detectIntent(
        userMessage: string
    ): Promise<{
        intent: 'invoice' | 'proposal' | 'contract' | 'payment_link' | 'general';
        confidence: number;
    }> {
        try {
            const prompt = `
You are an intent classifier for a freelancer platform. Analyze the user's message and determine their intent.

Possible intents:
- invoice: User wants to create an invoice
- proposal: User wants to create a proposal
- contract: User wants to create a contract
- payment_link: User wants to create a payment link
- general: General conversation, no specific document creation intent

User message: "${userMessage}"

Respond in JSON format:
{
  "intent": "invoice|proposal|contract|payment_link|general",
  "confidence": 0.0-1.0
}
`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Parse JSON response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return { intent: 'general', confidence: 0.5 };
        } catch (error) {
            console.error('Intent detection error:', error);
            return { intent: 'general', confidence: 0.0 };
        }
    }

    /**
     * Extract structured data from user input for document generation
     */
    static async extractDocumentData(
        userMessage: string,
        documentType: string,
        conversationHistory?: { role: string; content: string }[]
    ): Promise<any> {
        try {
            const prompt = `
You are a data extraction assistant for a freelancer platform. Extract structured data from the conversation to create a ${documentType}.

Conversation history:
${conversationHistory?.map((msg) => `${msg.role}: ${msg.content}`).join('\n')}

Latest message: "${userMessage}"

Extract the following data and respond in JSON format:
{
  "clientName": "string or null",
  "clientEmail": "string or null",
  "amount": number or null,
  "currency": "USD" or "NGN" or null,
  "description": "string or null",
  "items": [
    {"description": "string", "quantity": number, "rate": number, "amount": number}
  ] or [],
  "dueDate": "ISO date string or null",
  "terms": "string or null"
}

If certain fields are not mentioned, set them to null or empty array.
`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Parse JSON response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return {};
        } catch (error) {
            console.error('Data extraction error:', error);
            return {};
        }
    }

    /**
     * Generate follow-up questions to fill missing data
     */
    static async generateFollowUpQuestions(
        documentType: string,
        extractedData: any
    ): Promise<string[]> {
        try {
            const prompt = `
You are a helpful assistant helping a freelancer create a ${documentType}.

Current data extracted:
${JSON.stringify(extractedData, null, 2)}

Generate a list of follow-up questions to ask the user for any missing critical information.
Respond with a JSON array of questions:
["question 1", "question 2", ...]

If all critical data is present, return an empty array.
`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Parse JSON response
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return [];
        } catch (error) {
            console.error('Follow-up questions error:', error);
            return [];
        }
    }
}

export default GeminiService;
