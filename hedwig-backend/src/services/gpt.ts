import { createLogger } from '../utils/logger';
import { llmService } from './llm';

const logger = createLogger('GPT');

// AI service for generating contracts and proposals (provider-agnostic via llmService).

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
Format the output in clean markdown with proper headings and sections.
Keep the contract comprehensive but concise (around 600-900 words).

CRITICAL OUTPUT RULES:
- Return ONLY the contract text in markdown format - NO explanations, NO instructions, NO commentary
- DO NOT include any text before or after the contract
- DO NOT explain how to use the contract
- DO NOT include disclaimers or legal advice warnings
- DO NOT include phrases like "Here's the contract" or "Key improvements"
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
10. Acceptance (state that by clicking "Approve" the client agrees to terms - NO signature lines)

REMEMBER: Return ONLY the contract in markdown format. No explanations. No instructions. No commentary. Just the contract text.`;

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

async function generateWithLLM(systemPrompt: string, userPrompt: string, purpose: 'contract' | 'proposal'): Promise<string> {
    logger.debug('Generating content with configured LLM provider', { purpose });
    return llmService.generateText(userPrompt, {
        systemPrompt,
        purpose,
        temperature: 0.7,
        maxOutputTokens: 2000,
        useFallbacks: true,
    });
}

export async function generateContractWithGPT(params: ContractGenerationParams): Promise<string> {
    const { system, user } = buildContractPrompt(params);

    const content = await generateWithLLM(system, user, 'contract');

    // Extract HTML if AI included explanations
    return extractHTMLFromResponse(content);
}

/**
 * Extract clean contract from AI response that may include explanations
 */
function extractHTMLFromResponse(content: string): string {
    // First, try to extract from markdown code blocks
    const markdownMatch = content.match(/```(?:markdown|md)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
        return markdownMatch[1].trim();
    }
    
    // Check if it's HTML (old behavior that we want to avoid)
    if (content.includes('<!DOCTYPE html>') || content.includes('<html>')) {
        // Extract just the HTML, removing any explanations after </html>
        const htmlEndMatch = content.match(/(<!DOCTYPE[\s\S]*?<\/html>)/i);
        if (htmlEndMatch) {
            // Return empty string to force regeneration with markdown
            logger.warn('Contract generated as HTML instead of markdown, returning empty to trigger fallback');
            return '';
        }
    }
    
    // Split by lines and remove explanation lines
    const lines = content.split('\n');
    const cleanedLines: string[] = [];
    let inContract = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lowerLine = line.toLowerCase().trim();
        
        // Skip common AI explanation patterns
        if (lowerLine.startsWith('here') || 
            lowerLine.startsWith('key improvements') ||
            lowerLine.startsWith('how to use') ||
            lowerLine.includes('disclaimer:') ||
            lowerLine.includes('legal advice') ||
            lowerLine.includes('consult') ||
            lowerLine.includes('important considerations') ||
            lowerLine.includes('this improved') ||
            lowerLine.includes('remember')) {
            continue;
        }
        
        // Start of contract (heading)
        if (line.startsWith('#') && !inContract) {
            inContract = true;
        }
        
        if (inContract) {
            cleanedLines.push(line);
        }
    }
    
    return cleanedLines.join('\n').trim();
}

export async function generateProposalWithGPT(params: ProposalGenerationParams): Promise<string> {
    const { system, user } = buildProposalPrompt(params);
    return generateWithLLM(system, user, 'proposal');
}

/**
 * Check if any AI generation is available.
 */
export function isGPTEnabled(): boolean {
    return llmService.isAnyProviderConfigured();
}
