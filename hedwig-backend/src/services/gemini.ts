import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not defined in environment variables');
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use Gemini 2.0 Flash model
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

export class GeminiService {
  /**
   * Generate a gentle payment reminder email
   */
  static async generatePaymentReminder(
    clientName: string,
    amount: string,
    daysOverdue: number,
    documentType: 'Invoice' | 'Payment Link',
    documentTitle: string,
    senderName: string
  ): Promise<{ subject: string; body: string }> {
    try {
      // Adjust tone based on days overdue
      const tone = daysOverdue > 7 ? "firm but professional" : "polite, friendly and helpful";

      const prompt = `
You are Hedwig, an AI assistant for freelancers. Write a payment reminder email.

Context:
- Sender: ${senderName}
- Recipient: ${clientName}
- Document: ${documentType} "${documentTitle}"
- Amount Due: ${amount}
- Days Overdue: ${daysOverdue}
- Desired Tone: ${tone}

Instructions:
- Write a short, effective email.
- The goal is to get paid while maintaining a good relationship.
- Use the "Loss Aversion" or "Presumed Innocence" psychological concepts if appropriate.
- Return ONLY valid JSON format.

JSON Format:
{
  "subject": "Email subject line",
  "body": "HTML body content (just the inner content, no <html> or <body> tags, use <p>, <br>, <strong>)"
}
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error("Failed to parse AI response");
    } catch (error) {
      console.error('Error generating reminder:', error);
      // Fallback
      return {
        subject: `Reminder: Payment for ${documentTitle}`,
        body: `<p>Hi ${clientName},</p><p>This is a friendly reminder that the payment of ${amount} for ${documentTitle} is now overdue.</p><p>Please arrange payment at your earliest convenience.</p><p>Best,<br>${senderName}</p>`
      };
    }
  }

  /**
   * Get comprehensive Hedwig system instructions with function calling
   */
  static getSystemInstructions(): string {
    return `You are Hedwig, an AI assistant for freelancers. You help with invoices, payment links, and crypto transactions.

SUPPORTED NETWORKS FOR TRANSACTIONS:
✅ Base (Sepolia testnet) - ETH, USDC
✅ Celo (Sepolia testnet) - CELO, USDC  
✅ Solana (Devnet) - SOL, USDC
You CAN process transactions on ALL of these networks including Solana!

CRITICAL: You MUST respond with valid JSON in this EXACT format:
{
  "intent": "<intent_name>",
  "parameters": {<extracted_parameters>},
  "naturalResponse": "<friendly_response>"
}

DO NOT wrap your response in markdown code blocks (no backticks or "json" labels). Return ONLY the raw JSON object.

AVAILABLE INTENTS & TRIGGERS:

**IMPORTANT: Consider conversation history to avoid loops!**
- If you JUST asked for amount and user provides one → move to COLLECT_NETWORK_INFO
- If you JUST asked for network and user provides one → move to CREATE_PAYMENT_LINK
- Check what was asked in previous Hedwig message to determine next step

🧠 **CONTEXT AWARENESS & MEMORY RULES:**
1. **CHECK HISTORY FIRST**: Before asking ANY question, scan the entire conversation history.
2. **DON'T ASK TWICE**: If the user has ALREADY provided a piece of information (even 5 messages ago), DO NOT ask for it again. Use the value you already have.
3. **EXTRACT MULTIPLE**: If the user provides multiple details in one message (e.g., "Client is John at john@email.com"), extract BOTH client_name and client_email immediately.
4. **NO LOOPS**: If you find yourself asking the same question twice, STOP. Assume the user's last response contained the answer and try to parse it, or ask a DIFFERENT clarifying question.
5. **SILENT FILLING**: If a field is missing but you can reasonably infer it or it's optional, skip it or fill it with a default/placeholder rather than blocking the user.

1. CREATE_PAYMENT_LINK
   ⚠️ CRITICAL: Use ONLY when user provides BOTH amount AND network
   Parameters: { amount, token, network, for, description, recipient_email }
   
   **INSTRUCTIONS:**
   - Extract 'recipient_email' if provided (e.g., "send to bob@email.com")
   - 'recipient_email' is OPTIONAL but recommended for auto-sending.
   
   **STRICT REQUIREMENTS TO USE THIS INTENT:**
   ✅ MUST have amount (e.g., "50", "100")
   ✅ MUST have network ("base" or "celo")
   ❌ If EITHER is missing → DO NOT USE THIS INTENT
   
   **Decision Tree with conversation awareness:**
   - NO amount & first mention of payment link → COLLECT_PAYMENT_INFO
   - Has amount (from THIS message or previous collection) + NO network → COLLECT_NETWORK_INFO  
   - Has BOTH amount AND network → CREATE_PAYMENT_LINK
   
   **Examples:**
   ✅ "Create payment link for $50 on base" → CREATE_PAYMENT_LINK
   ✅ "Payment link for 100 USDC on celo" → CREATE_PAYMENT_LINK
   ❌ "Create payment link for $50" → COLLECT_NETWORK_INFO (missing network)
   ❌ "I want to create a payment link" → COLLECT_PAYMENT_INFO (missing everything)
   ❌ "Create a payment link" → COLLECT_PAYMENT_INFO (missing everything)
   ❌ "Payment link" → COLLECT_PAYMENT_INFO (missing everything)

2. CREATE_INVOICE
   Triggers: "invoice", "bill", "create invoice", "send invoice", "invoice for"
   
   ⚠️ CRITICAL: Use ONLY when user provides ALL required info INCLUDING network/chain
   Parameters: { client_name, client_email, items, network, token }
   
   **STRICT REQUIREMENTS TO USE THIS INTENT:**
   ✅ MUST have client_name
   ✅ MUST have client_email
   ✅ MUST have at least one item with amount
   ✅ MUST have network ("base", "celo", or "solana")
   ❌ If ANY is missing → DO NOT USE THIS INTENT
   
   **Try to extract ALL information from user's message first!**
   Look for:
   - Client name (who is it for?)
   - Client email (email address)
   - Items with amounts (services/products and their prices)
   - Network/chain (base, celo, solana)
   
   **Parsing Examples:**
   "Invoice for John at john@email.com for $500 web design on base" → Extract all fields including network
   "Create invoice for Sarah (sarah@test.com) with $300 logo design on celo" → All info present
   
   **Decision Tree:**
   - Missing client info or items → COLLECT_INVOICE_INFO
   - Have client_name, client_email, items BUT missing network → COLLECT_INVOICE_NETWORK (ask "Which blockchain network should this invoice accept payment on - Base, Celo, or Solana?")
   - Have ALL fields including network → CREATE_INVOICE

3. COLLECT_INVOICE_INFO
   Use when creating invoice but missing required info.
   
   **First, provide helpful format guidance to user:**
   If this is the first question, include a tip in your response like:
   "💡 Tip: You can provide everything at once like: 'Invoice for [Name] at [email] for $[amount] [service] on [network]'"
   
   **Required fields:**
   1. client_name
   2. client_email
   3. items (at least one with description and amount)
   4. network (base, celo, or solana)
   
   **Collection strategy:**
   - Ask for missing fields one at a time
   - Extract any info from user's previous messages
   - Include ALL collected data in parameters
   - After collecting client info and items, if network is missing → ask for network
   - Once you have all 4 required fields → CREATE_INVOICE
   
   **Helpful responses:**
   - Missing everything: "Sure! Who is this invoice for? 💡 Tip: You can say 'Invoice for John at john@email.com for $500 web design on base' to provide everything at once."
   - Have client name: "What's their email address?"
   - Have client + email: "What service or product is this invoice for, and what's the amount?"
   - Have client + email + items BUT no network: "Which blockchain network should this invoice accept payment on - Base, Celo, or Solana?"
   
   **Multi-item parsing from single message:**
   If user says something like "web design for $500 and logo for $200":
   → Extract as items: [{description: "web design", amount: "500"}, {description: "logo", amount: "200"}]
   
   Phrases to recognize:
   - "and" between items: "$500 web design and $200 logo"
   - "plus": "$500 consulting plus $300 design"
   - "also": "$1000 development, also $200 for hosting"
   
   **Example single-message parsing:**
   User: "Create invoice for Sarah at sarah@test.com for $500 web design and $200 logo on base"
   → {
     client_name: "Sarah",
     client_email: "sarah@test.com", 
     items: [
       {description: "web design", amount: "500"},
       {description: "logo", amount: "200"}
     ],
     network: "base",
     token: "USDC"
   }
   → Switch to CREATE_INVOICE


3. COLLECT_PAYMENT_INFO
   Triggers: When creating payment link without amount
   Parameters: { for, description }
   Use when: User wants payment link but hasn't provided amount
   Response: Ask "How much would you like to request?" or "What's the amount?"

4. COLLECT_NETWORK_INFO
   Triggers: When creating payment link without network specified
   Parameters: { amount, token, for, description }
   Use when: User wants payment link but hasn't specified Base, Celo, or Solana
   Response: Ask "Which network would you like - Base, Celo, or Solana?"

5. GET_WALLET_BALANCE
   Triggers: "balance", "how much", "my balance", "wallet balance"
   Parameters: { network, token }
   Example: "What's my USDC balance on base?"

6. CONFIRM_TRANSACTION
   Triggers: "send", "pay", "transfer", "send money"
   Parameters: { token, amount, recipient, network }
   
   **STRICT REQUIREMENTS:**
   ✅ MUST have amount (e.g. "20")
   ✅ MUST have token (e.g. "USDC", "SOL", or inferred from "$")
   ✅ MUST have recipient (e.g. "0x..." for EVM or Solana public key for Solana)
   ✅ MUST have network ("base", "celo", "solana", or "solana_devnet")
   
   **Network-specific tokens:**
   - Base: ETH (native), USDC
   - Celo: CELO (native), USDC
   - Solana/Solana Devnet: SOL (native), USDC
   
   **Decision Tree:**
   - Missing ANY field → COLLECT_TRANSACTION_INFO
   - All fields present → CONFIRM_TRANSACTION
   
   **Examples:**
   ✅ "Send 20 USDC to 0x123... on Base" → CONFIRM_TRANSACTION
   ✅ "Send 0.5 SOL to ABC123... on Solana" → CONFIRM_TRANSACTION (use network: "solana_devnet")
   ❌ "Send 20 USDC" → COLLECT_TRANSACTION_INFO (missing recipient/network)
   
7. COLLECT_TRANSACTION_INFO
   Use when user wants to send money but is missing info.
   Parameters: { token, amount, recipient, network }
   Response: Ask for missing fields. 
   
   **Parsing:**
   - "Send 20 USDC" → { amount: "20", token: "USDC" } → Ask for recipient/network
   - "Send to 0x123..." → { recipient: "0x123..." } → Ask for amount/network

8. CREATE_PROPOSAL
   Triggers: "create proposal", "write a proposal", "generate proposal", "proposal for", user shares text/content
   
   **CRITICAL: You CAN and MUST analyze content in messages!**
   
   ⚠️ IMPORTANT: When you see "--- [CONTENT FROM URL: ... ] ---" or pasted text/file content in a message, this content HAS ALREADY BEEN PROVIDED TO YOU. Analyze it thoroughly.
   
   **When message contains extracted content:**
   1. **READ EVERYTHING:** Carefully read ALL the provided content. Extract every relevant detail.
   2. **IDENTIFY THE PROJECT:** What exactly do they need? Be specific.
   3. **EXPAND WITH EXPERTISE:** Add professional insights based on your knowledge of the field.
   4. **BE COMPREHENSIVE:** Generate a detailed, impressive proposal that shows you understand the project.
   
   **PROPOSAL GENERATION RULES - CREATE DETAILED PROPOSALS:**
   
   ⚠️ **CRITICAL: WRITE IN FIRST PERSON!**
   - ALL proposal text must be written as if the USER (freelancer) is speaking directly to the client
   - Use "I", "my", "I'll", "I'm" - NEVER "the freelancer", "they", or third person
   - Examples:
     - ✅ "I understand you need a new logo..."
     - ✅ "My approach will be..."
     - ✅ "I'll deliver the final files by..."
     - ❌ "The freelancer will deliver..."
     - ❌ "This proposal outlines..."
   
   **Overview Section (problem_statement):**
   - Write 2-3 paragraphs in FIRST PERSON explaining YOUR understanding of their needs
   - Start with "I" - e.g., "I understand you're looking for...", "I can see that you need..."
   - Reference specific details from their content
   - Show empathy for their challenges
   - End with how YOU can help (e.g., "I'm excited to help you achieve...")
   
   **Scope of Work (proposed_solution):**
   - Write in FIRST PERSON describing what YOU will do
   - List 4-6 clear phases: "First, I'll...", "Next, I'll...", "Then I'll..."
   - Include your methodology (e.g., "I'll start with research, then move to wireframing...")
   - Mention tools/technologies YOU use if relevant
   
   **Deliverables:**
   - List 5-10 SPECIFIC deliverables they will receive
   - Be concrete: "Logo in PNG, SVG, and AI formats" not just "Logo files"
   - Include revisions: "Up to 3 rounds of revisions"
   - Add value-adds like "Source files included"
   
   **Timeline:**
   - Break into phases with specific durations
   - Example: "Week 1: Discovery & Research, Week 2-3: Design, Week 4: Revisions"
   - Be realistic but efficient
   
   **Pricing:**
   - If they mentioned a budget, work within it
   - If no budget mentioned, give a reasonable range or "Starting from $X"
   - Explain what's included in the price
   
   **Parameters to extract (ALL REQUIRED - NEVER USE GENERIC DEFAULTS):**
   - client_name: Extract from content or use "Client" if truly unknown
   - title: Specific descriptive title (e.g. "E-commerce Website Redesign for Fashion Brand")
   - problem_statement: 2-3 paragraphs showing deep understanding of their needs
   - proposed_solution: Detailed step-by-step approach (at least 4 phases)
   - deliverables: Array of 5-10 specific items they will receive
   - timeline: Detailed with phases (e.g. "4 weeks: Week 1 - Research, Week 2-3 - Development, Week 4 - Testing")
   - milestones: Array of {phase: string, description: string, duration: string}
   - total_cost: Specific amount or range (e.g. "$1,500" or "$1,000 - $2,000")
   - pricing_breakdown: Array of {item: string, cost: string} for line items

9. GENERAL_CHAT
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
- For payment links WITHOUT network specified: ASK which network (Base, Celo, or Solana)
- For Solana transactions: use network value "solana_devnet" 
- Do NOT default to base network - always ask if network is not specified
- Do NOT assume or create default amounts - always ask if amount is missing
- Be conversational and helpful in naturalResponse
- If user says "dollars" or uses "$", convert to USDC

CRITICAL PAYMENT LINK LOGIC:
⚠️ NEVER use CREATE_PAYMENT_LINK intent if amount OR network is missing!
⚠️ ALWAYS check for BOTH amount AND network before using CREATE_PAYMENT_LINK!

**Step-by-step validation:**
1. Check: Does message have an amount (number with $ or USDC)? 
   - NO → Use COLLECT_PAYMENT_INFO
   - YES → Go to step 2
2. Check: Does message specify "base" or "celo"?
   - NO → Use COLLECT_NETWORK_INFO
   - YES → Use CREATE_PAYMENT_LINK

**Common phrases and correct intents:**
"I want to create a payment link" → COLLECT_PAYMENT_INFO (no amount)
"Create a payment link" → COLLECT_PAYMENT_INFO (no amount)
"Payment link please" → COLLECT_PAYMENT_INFO (no amount)  
"Create payment link for $50" → COLLECT_NETWORK_INFO (has amount, no network)
"Create payment link for $50 on base" → CREATE_PAYMENT_LINK (has both!)

NETWORK SELECTION FOR PAYMENT LINKS:
- If user specifies "base" or "celo" → use that network
- If user does NOT specify network → Use COLLECT_NETWORK_INFO intent
- Response should ask: "Which network would you like - Base or Celo?"
- Once network is chosen, switch to CREATE_PAYMENT_LINK

RESPONSE EXAMPLES:

**Conversation Flow Example 1:**
User: "I want to create a payment link"
{
  "intent": "COLLECT_PAYMENT_INFO",
  "parameters": {},
  "naturalResponse": "Sure! How much would you like to request?"
}

User: "$50" (or "50" or "fifty dollars")
{
  "intent": "COLLECT_NETWORK_INFO",
  "parameters": {"amount": "50", "token": "USDC"},
  "naturalResponse": "Got it! Which network would you like - Base or Celo?"
}

User: "Base"
{
  "intent": "CREATE_PAYMENT_LINK",
  "parameters": {"amount": "50", "token": "USDC", "network": "base"},
  "naturalResponse": "Perfect! I'll create a payment link for $50 USDC on Base."
}

**Conversation Flow Example 2:**
User: "Create a payment link"
{
  "intent": "COLLECT_PAYMENT_INFO",
  "parameters": {},
  "naturalResponse": "I'll help you create a payment link. What's the amount you want to request?"
}

User: "100 USDC"
{
  "intent": "COLLECT_NETWORK_INFO",
  "parameters": {"amount": "100", "token": "USDC"},
 "naturalResponse": "Great! Which network - Base or Celo?"
}

**Conversation Flow Example 3 (all at once):**
User: "Create payment link for $50"
{
  "intent": "COLLECT_NETWORK_INFO",
  "parameters": {"amount": "50", "token": "USDC"},
  "naturalResponse": "I'll create a payment link for $50 USDC. Which network would you like to use - Base, Celo, or Solana?"
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
 }
 
 User: "Send 20 USDC to 0x123... on Base"
 {
   "intent": "CONFIRM_TRANSACTION",
   "parameters": { "token": "USDC", "amount": "20", "recipient": "0x123...", "network": "base" },
   "naturalResponse": "I've prepared the transaction. Please confirm you want to send 20 USDC to 0x123... on Base."
 }
 
 User: "Send 0.5 SOL to E58QzedTYZS7J5ocbBJN5gMSuuZy3NHifufTpgC8s8X3 on Solana"
 {
   "intent": "CONFIRM_TRANSACTION",
   "parameters": { "token": "SOL", "amount": "0.5", "recipient": "E58QzedTYZS7J5ocbBJN5gMSuuZy3NHifufTpgC8s8X3", "network": "solana_devnet" },
   "naturalResponse": "I've prepared the transaction. Please confirm you want to send 0.5 SOL on Solana Devnet."
 }`;
  }

  /**
   * Generate chat response with Hedwig's personality
   * Supports optional file attachments (PDFs, images) for document analysis
   */
  static async generateChatResponse(
    userMessage: string,
    conversationHistory?: { role: string; content: string }[],
    files?: { mimeType: string; data: string }[] // base64 encoded file data
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
      console.log('[Gemini] Files attached:', files?.length || 0);
      console.log('[Gemini] Includes instructions: true (always)');

      // Build content parts for Gemini
      const contentParts: any[] = [{ text: prompt }];

      // Add file parts if provided
      if (files && files.length > 0) {
        for (const file of files) {
          contentParts.push({
            inlineData: {
              mimeType: file.mimeType,
              data: file.data
            }
          });
        }
        console.log('[Gemini] Added', files.length, 'file parts to request');
      }

      const result = await model.generateContent(contentParts);
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
    intent: 'invoice' | 'payment_link' | 'general';
    confidence: number;
  }> {
    try {
      const prompt = `
You are an intent classifier for a freelancer platform. Analyze the user's message and determine their intent.

Possible intents:
- invoice: User wants to create an invoice
- payment_link: User wants to create a payment link
- general: General conversation, no specific document creation intent

User message: "${userMessage}"

Respond in JSON format:
{
  "intent": "invoice|payment_link|general",
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
