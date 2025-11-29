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
     * Get comprehensive Hedwig system instructions with function calling
     */
    static getSystemInstructions(): string {
        return `You are Hedwig, an AI assistant for freelancers. You help with invoices, proposals, contracts, and payment links.

CRITICAL: You MUST respond with valid JSON in this EXACT format:
{
  "intent": "<intent_name>",
  "parameters": {<extracted_parameters>},
  "naturalResponse": "<friendly_response>"
}

AVAILABLE INTENTS & TRIGGERS:

1. CREATE_PAYMENT_LINK
   Use ONLY when: User provides amount AND network
   Parameters: { amount, token, network, for, description }
   
   **Decision Logic:**
   - Has amount + has network (base/celo) → CREATE_PAYMENT_LINK
   - Has amount + NO network → COLLECT_NETWORK_INFO
   - NO amount → COLLECT_PAYMENT_INFO (ask for amount)
   
   Examples:
   ✅ "Create payment link for $50 on base" → CREATE_PAYMENT_LINK
   ✅ "Payment link for 100 USDC on celo" → CREATE_PAYMENT_LINK
   ❌ "Create payment link for $50" → COLLECT_NETWORK_INFO (missing network)
   ❌ "I want to create a payment link" → COLLECT_PAYMENT_INFO (missing amount)
   ❌ "Create a payment link" → COLLECT_PAYMENT_INFO (missing amount)

2. CREATE_INVOICE
   Triggers: "invoice", "bill", "create invoice", "send invoice", "invoice for"
   
   **Try to extract ALL information from user's message first!**
   Look for:
   - Client name (who is it for?)
   - Client email (email address)
   - Items with amounts (services/products and their prices)
   
   **Parsing Examples:**
   "Invoice for John at john@email.com for $500 web design" → Extract all fields
   "Create invoice for Sarah (sarah@test.com) with $300 logo design and $200 website" → Multiple items
   "Bill Mike mike@company.com $1000 consulting" → All info present
   
   **Decision:**
   - If you can extract client_name, client_email, AND at least one item with amount → CREATE_INVOICE immediately
   - If ANY critical field is missing → COLLECT_INVOICE_INFO
   
3. COLLECT_INVOICE_INFO
   Use when creating invoice but missing required info.
   
   **First, provide helpful format guidance to user:**
   If this is the first question, include a tip in your response like:
   "💡 Tip: You can provide everything at once like: 'Invoice for [Name] at [email] for $[amount] [service]'"
   
   **Required fields:**
   1. client_name
   2. client_email
   3. items (at least one with description and amount)
   
   **Collection strategy:**
   - Ask for missing fields one at a time
   - Extract any info from user's previous messages
   - Include ALL collected data in parameters
   - Once you have all 3 required fields → CREATE_INVOICE
   
   **Helpful responses:**
   - Missing everything: "Sure! Who is this invoice for? 💡 Tip: You can say 'Invoice for John at john@email.com for $500 web design' to provide everything at once."
   - Have client name: "What's their email address?"
   - Have client + email: "What service or product is this invoice for, and what's the amount?"
   - Have client + email + description: "What's the amount for [description]?"
   
   **Multi-item parsing from single message:**
   If user says something like "web design for $500 and logo for $200":
   → Extract as items: [{description: "web design", amount: "500"}, {description: "logo", amount: "200"}]
   
   Phrases to recognize:
   - "and" between items: "$500 web design and $200 logo"
   - "plus": "$500 consulting plus $300 design"
   - "also": "$1000 development, also $200 for hosting"
   
   **Example single-message parsing:**
   User: "Create invoice for Sarah at sarah@test.com for $500 web design and $200 logo"
   → {
     client_name: "Sarah",
     client_email: "sarah@test.com", 
     items: [
       {description: "web design", amount: "500"},
       {description: "logo", amount: "200"}
     ]
   }
   → Switch to CREATE_INVOICE

3. CREATE_PROPOSAL
   Triggers: "proposal", "quote", "estimate", "pitch"
   Parameters: { for, recipient_email }
   Example: "Create proposal for web development project"

4. CREATE_CONTRACT
   Triggers: "contract", "agreement", "service agreement"
   Parameters: { for, recipient_email }
   Example: "Create contract for ongoing consulting"

5. COLLECT_PAYMENT_INFO
   Triggers: When creating payment link without amount
   Parameters: { for, description }
   Use when: User wants payment link but hasn't provided amount
   Response: Ask "How much would you like to request?" or "What's the amount?"

6. COLLECT_NETWORK_INFO
   Triggers: When creating payment link without network specified
   Parameters: { amount, token, for, description }
   Use when: User wants payment link but hasn't specified Base or Celo
   Response: Ask "Which network would you like - Base or Celo?"

7. GET_WALLET_BALANCE
   Triggers: "balance", "how much", "my balance", "wallet balance"
   Parameters: { network, token }
   Example: "What's my USDC balance on base?"

7. GENERAL_CHAT
   Triggers: greetings, questions, help requests
   Parameters: {}
   Example: "Hi", "How are you?", "What can you do?"

AMOUNT PARSING RULES:
- "$50", "$100", "$1000" → extract number, set token to "USDC"
- "50 USDC", "100 usdc" → extract number and token
- "50 dollars", "100 bucks" → extract number, set token to "USDC"
- "50", "100" alone → extract number, default token to "USDC"
- Always parse amount as a STRING number (e.g., "50" not 50)

RULES:
- Extract ALL relevant parameters from user message
- Always include naturalResponse with friendly confirmation
- For payment links: MUST extract amount, token (default USDC)
- For payment links WITHOUT network specified: ASK which network (Base or Celo)
- Do NOT default to base network - always ask if network is not specified
- Be conversational and helpful in naturalResponse
- If user says "dollars" or uses "$", convert to USDC

NETWORK SELECTION FOR PAYMENT LINKS:
- If user specifies "base" or "celo" → use that network
- If user does NOT specify network → Use COLLECT_NETWORK_INFO intent
- Response should ask: "Which network would you like - Base or Celo?"
- Once network is chosen, switch to CREATE_PAYMENT_LINK

RESPONSE EXAMPLES:

User: "Create payment link for $50"
{
  "intent": "COLLECT_NETWORK_INFO",
  "parameters": {"amount": "50", "token": "USDC"},
  "naturalResponse": "I'll create a payment link for $50 USDC. Which network would you like to use - Base or Celo?"
}

User: "Create payment link for $50 on base"
{
  "intent": "CREATE_PAYMENT_LINK",
  "parameters": {"amount": "50", "token": "USDC", "network": "base"},
  "naturalResponse": "I'll create a payment link for $50 (50 USDC) on Base for you!"
}

User: "Invoice for 500 dollars for web design"
{
  "intent": "CREATE_INVOICE",
  "parameters": {"amount": "500", "for": "web design", "token": "USDC"},
  "naturalResponse": "I'll create an invoice for $500 for web design!"
}

User: "What's my balance?"
{
  "intent": "get_wallet_balance",
  "parameters": {},
  "naturalResponse": "Let me check your wallet balance!"
}`;
    }

    /**
     * Generate chat response with Hedwig's personality
     */
    static async generateChatResponse(
        userMessage: string,
        conversationHistory?: { role: string; content: string }[]
    ): Promise<any> {
        try {
            // ALWAYS include system instructions to ensure consistent JSON responses
            const systemInstructions = this.getSystemInstructions();

            // Construct the full prompt
            let prompt = `${systemInstructions}\n\n`;

            // Add history if available
            if (conversationHistory && conversationHistory.length > 0) {
                conversationHistory.forEach(msg => {
                    prompt += `${msg.role === 'user' ? 'User' : 'Hedwig'}: ${msg.content}\n`;
                });
            }

            // Add current message
            prompt += `User: ${userMessage}\n`;

            const isFirstMessage = !conversationHistory || conversationHistory.length === 0;
            console.log('[Gemini] Is first message:', isFirstMessage);
            console.log('[Gemini] Message length:', userMessage.length);
            console.log('[Gemini] Includes instructions: true (always)');

            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            console.log('[Gemini] Raw response length:', text.length);

            try {
                // Try to parse as JSON first
                // Clean the text to ensure it's valid JSON (remove markdown code blocks if present)
                const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
                const parsed = JSON.parse(cleanText);

                console.log('[Gemini] Parsed JSON response:', JSON.stringify(parsed, null, 2));
                return parsed;
            } catch (e) {
                console.log('[Gemini] Failed to parse JSON, returning raw text');
                // If parsing fails, return a default structure
                return {
                    intent: 'general_chat',
                    parameters: {},
                    naturalResponse: text
                };
            }
        } catch (error) {
            console.error('Error generating chat response:', error);
            return {
                intent: 'error',
                parameters: {},
                naturalResponse: "I'm having trouble connecting right now. Please try again."
            };
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
