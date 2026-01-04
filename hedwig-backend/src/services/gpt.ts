import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// GPT service for generating contracts and proposals
// Primary: OpenAI GPT-4o-mini | Fallback: Gemini 2.5 Flash

// Initialize OpenAI (may be undefined if no API key)
const openai = process.env.OPENAI_API_KEY 
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

// Initialize Gemini (should always be available)
const genAI = process.env.GEMINI_API_KEY 
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

const geminiModel = genAI?.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

// Use GPT-4o-mini for cost-effective generation
const OPENAI_MODEL = 'gpt-4o-mini';

export interface ContractGenerationParams {
    clientName: string;
    clientEmail: string;
    freelancerName: string;
    freelancerEmail: string;
    title: string;
    scopeOfWork: string;
    deliverables: string[];
    milestones: { title: string; amount: string; description?: string }[];
    paymentAmount: string;
    paymentTerms?: string;
    startDate?: string;
    endDate?: string;
}

export interface ProposalGenerationParams {
    clientName: string;
    clientEmail: string;
    freelancerName: string;
    freelancerEmail: string;
    title: string;
    problemStatement?: string;
    proposedSolution?: string;
    deliverables: string[];
    timeline?: string;
    totalCost: string;
    paymentTerms?: string;
}

/**
 * Format currency properly (e.g., $1,000.00)
 */
function formatCurrency(amount: string | number): string {
    const num = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

/**
 * Get today's date formatted nicely
 */
function getTodayDate(): string {
    return new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Build contract prompt for AI generation
 */
function buildContractPrompt(params: ContractGenerationParams): { system: string; user: string } {
    const today = getTodayDate();
    const totalFormatted = formatCurrency(params.paymentAmount);
    
    const systemPrompt = `You are a professional legal document writer specializing in freelance service contracts. 
Generate clear, professional, and legally sound contracts that protect both parties.
Always use formal language and include standard contract clauses.
Format the output in markdown with proper headings and sections.
Keep the contract comprehensive but concise (around 600-900 words).

IMPORTANT RULES:
- Use the EXACT date provided (${today}) - NO placeholders like "DATE" or "[Date]"
- Format all currency amounts properly (e.g., $1,000.00)
- DO NOT include a "Governing Law" section
- DO NOT include signature lines or "sign here" sections - approval is done electronically via email
- End with a simple "Acceptance" section that mentions the client can approve electronically`;

    const userPrompt = `Generate a professional freelance service contract with the following details:

**Contract Date:** ${today}

**Freelancer (Service Provider):**
- Name: ${params.freelancerName}
- Email: ${params.freelancerEmail}

**Client:**
- Name: ${params.clientName}
- Email: ${params.clientEmail}

**Project Details:**
- Title: ${params.title}
- Scope of Work: ${params.scopeOfWork}
- Total Contract Value: ${totalFormatted}
- Start Date: ${params.startDate || today}
- End Date: ${params.endDate || 'Upon completion of deliverables'}

**Deliverables:**
${params.deliverables.length > 0 ? params.deliverables.map((d, i) => `${i + 1}. ${d}`).join('\n') : '- As specified in the scope of work'}

**Payment Milestones:**
${params.milestones.length > 0 ? params.milestones.map((m, i) => `${i + 1}. ${m.title} - ${formatCurrency(m.amount)}${m.description ? ` (${m.description})` : ''}`).join('\n') : `- Full payment of ${totalFormatted} upon completion`}

**Payment Terms:**
${params.paymentTerms || 'Payment will be made via cryptocurrency through the Hedwig platform upon milestone completion.'}

Include ONLY these sections (no Governing Law, no signature blocks):
1. Contract Overview (parties, date, project title)
2. Scope of Work
3. Deliverables
4. Timeline and Milestones  
5. Payment Terms (use proper currency format like $1,000.00)
6. Intellectual Property Rights
7. Confidentiality
8. Revisions and Changes
9. Termination
10. Acceptance (state that by clicking "Approve" the client agrees to terms - NO signature lines)`;

    return { system: systemPrompt, user: userPrompt };
}

/**
 * Build proposal prompt for AI generation
 */
function buildProposalPrompt(params: ProposalGenerationParams): { system: string; user: string } {
    const today = getTodayDate();
    const totalFormatted = formatCurrency(params.totalCost);
    
    const systemPrompt = `You are a professional business proposal writer who helps freelancers win clients.
Generate compelling, clear proposals that:
- Show understanding of the client's needs
- Present a clear solution and approach
- Include specific deliverables and timeline
- Have professional but warm tone
Format in markdown. Keep it concise (600-900 words) but comprehensive.
Use the exact date provided - NO placeholders.
Format all currency amounts properly (e.g., $1,000.00).`;

    const userPrompt = `Generate a professional project proposal with the following details:

**Date:** ${today}

**From:**
- Name: ${params.freelancerName}
- Email: ${params.freelancerEmail}

**To:**
- Client: ${params.clientName}
- Email: ${params.clientEmail}

**Project:**
- Title: ${params.title}
- Timeline: ${params.timeline || 'To be discussed'}
- Total Investment: ${totalFormatted}

${params.problemStatement ? `**Project Background/Problem:**\n${params.problemStatement}\n` : ''}

${params.proposedSolution ? `**Proposed Approach:**\n${params.proposedSolution}\n` : ''}

**Deliverables:**
${params.deliverables.length > 0 ? params.deliverables.map((d, i) => `${i + 1}. ${d}`).join('\n') : '- Final deliverables to be confirmed upon project kickoff'}

**Payment Terms:**
${params.paymentTerms || 'Payment via cryptocurrency through Hedwig platform.'}

Create a proposal with these sections:
1. Executive Summary
2. Project Understanding
3. Proposed Approach/Solution
4. Deliverables
5. Timeline
6. Investment/Pricing (use proper currency format like $1,000.00)
7. Why Work With Me
8. Next Steps

Make it persuasive and client-focused.`;

    return { system: systemPrompt, user: userPrompt };
}

/**
 * Generate contract using OpenAI GPT-4o-mini
 */
async function generateWithOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!openai) {
        throw new Error('OpenAI not configured');
    }
    
    console.log('[GPT] Generating with GPT-4o-mini...');
    
    const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content;
    
    if (!content) {
        throw new Error('OpenAI returned empty response');
    }

    return content;
}

/**
 * Generate content using Gemini (fallback)
 */
async function generateWithGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!geminiModel) {
        throw new Error('Gemini not configured');
    }
    
    console.log('[Gemini] Generating with Gemini 2.5 Flash Lite...');
    
    // Combine system and user prompts for Gemini
    const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
    
    const result = await geminiModel.generateContent(combinedPrompt);
    const response = await result.response;
    const content = response.text();
    
    if (!content) {
        throw new Error('Gemini returned empty response');
    }

    return content;
}

/**
 * Generate a professional contract - tries OpenAI first, falls back to Gemini
 */
export async function generateContractWithGPT(params: ContractGenerationParams): Promise<string> {
    const { system, user } = buildContractPrompt(params);
    
    // Try OpenAI first
    if (openai) {
        try {
            return await generateWithOpenAI(system, user);
        } catch (error) {
            console.error('[GPT] OpenAI error, falling back to Gemini:', error);
        }
    }
    
    // Fallback to Gemini
    if (geminiModel) {
        try {
            return await generateWithGemini(system, user);
        } catch (error) {
            console.error('[Gemini] Gemini error:', error);
            throw error;
        }
    }
    
    throw new Error('No AI service available for contract generation');
}

/**
 * Generate a professional proposal - tries OpenAI first, falls back to Gemini
 */
export async function generateProposalWithGPT(params: ProposalGenerationParams): Promise<string> {
    const { system, user } = buildProposalPrompt(params);
    
    // Try OpenAI first
    if (openai) {
        try {
            return await generateWithOpenAI(system, user);
        } catch (error) {
            console.error('[GPT] OpenAI error, falling back to Gemini:', error);
        }
    }
    
    // Fallback to Gemini
    if (geminiModel) {
        try {
            return await generateWithGemini(system, user);
        } catch (error) {
            console.error('[Gemini] Gemini error:', error);
            throw error;
        }
    }
    
    throw new Error('No AI service available for proposal generation');
}

/**
 * Check if any AI generation is available (OpenAI or Gemini)
 */
export function isGPTEnabled(): boolean {
    return !!(openai || geminiModel);
}
