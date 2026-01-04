import OpenAI from 'openai';

// GPT service for generating contracts and proposals
// Using GPT-5.2 Nano for cost-effective document generation

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const GPT_MODEL = 'gpt-5.2-nano'; // Latest efficient model for document generation

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
 * Generate a professional contract using GPT-5.2 Nano
 */
export async function generateContractWithGPT(params: ContractGenerationParams): Promise<string> {
    const systemPrompt = `You are a professional legal document writer specializing in freelance service contracts. 
Generate clear, professional, and legally sound contracts that protect both parties.
Always use formal language and include standard contract clauses.
Format the output in markdown with proper headings and sections.
Keep the contract comprehensive but not overly long (around 800-1200 words).`;

    const userPrompt = `Generate a professional freelance service contract with the following details:

**Freelancer:**
- Name: ${params.freelancerName}
- Email: ${params.freelancerEmail}

**Client:**
- Name: ${params.clientName}
- Email: ${params.clientEmail}

**Project Details:**
- Title: ${params.title}
- Scope of Work: ${params.scopeOfWork}
- Total Value: ${params.paymentAmount}
- Start Date: ${params.startDate || 'Upon contract signing'}
- End Date: ${params.endDate || 'As per milestones'}

**Deliverables:**
${params.deliverables.map((d, i) => `${i + 1}. ${d}`).join('\n')}

**Payment Milestones:**
${params.milestones.map((m, i) => `${i + 1}. ${m.title} - $${m.amount}${m.description ? ` (${m.description})` : ''}`).join('\n')}

**Payment Terms:**
${params.paymentTerms || 'Payment will be made via cryptocurrency through the Hedwig platform upon milestone completion.'}

Include the following sections:
1. Parties and Recitals
2. Scope of Work
3. Deliverables
4. Timeline and Milestones  
5. Payment Terms
6. Intellectual Property Rights
7. Confidentiality
8. Revisions and Changes
9. Termination
10. Limitation of Liability
11. Governing Law
12. Signatures/Acceptance`;

    try {
        console.log('[GPT] Generating contract with GPT-5.2 Nano...');
        
        const completion = await openai.chat.completions.create({
            model: GPT_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 2000,
        });

        const content = completion.choices[0]?.message?.content;
        
        if (!content) {
            throw new Error('GPT returned empty response');
        }

        console.log('[GPT] Contract generated successfully');
        return content;
    } catch (error) {
        console.error('[GPT] Error generating contract:', error);
        // Fall back to template-based generation
        throw error;
    }
}

/**
 * Generate a professional proposal using GPT-5.2 Nano
 */
export async function generateProposalWithGPT(params: ProposalGenerationParams): Promise<string> {
    const systemPrompt = `You are a professional business proposal writer who helps freelancers win clients.
Generate compelling, clear proposals that:
- Show understanding of the client's needs
- Present a clear solution and approach
- Include specific deliverables and timeline
- Have professional but warm tone
Format in markdown. Keep it concise (600-900 words) but comprehensive.`;

    const userPrompt = `Generate a professional project proposal with the following details:

**From:**
- Name: ${params.freelancerName}
- Email: ${params.freelancerEmail}

**To:**
- Client: ${params.clientName}
- Email: ${params.clientEmail}

**Project:**
- Title: ${params.title}
- Timeline: ${params.timeline || 'To be discussed'}
- Total Cost: ${params.totalCost}

${params.problemStatement ? `**Project Background/Problem:**\n${params.problemStatement}\n` : ''}

${params.proposedSolution ? `**Proposed Approach:**\n${params.proposedSolution}\n` : ''}

**Deliverables:**
${params.deliverables.map((d, i) => `${i + 1}. ${d}`).join('\n')}

**Payment Terms:**
${params.paymentTerms || 'Payment via cryptocurrency through Hedwig platform.'}

Create a proposal with these sections:
1. Executive Summary
2. Project Understanding (expand on the background if minimal info provided)
3. Proposed Approach/Solution
4. Deliverables
5. Timeline
6. Investment/Pricing
7. Why Work With Me
8. Next Steps

Make it persuasive and client-focused.`;

    try {
        console.log('[GPT] Generating proposal with GPT-5.2 Nano...');
        
        const completion = await openai.chat.completions.create({
            model: GPT_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.75,
            max_tokens: 1500,
        });

        const content = completion.choices[0]?.message?.content;
        
        if (!content) {
            throw new Error('GPT returned empty response');
        }

        console.log('[GPT] Proposal generated successfully');
        return content;
    } catch (error) {
        console.error('[GPT] Error generating proposal:', error);
        throw error;
    }
}

/**
 * Check if OpenAI API is configured
 */
export function isGPTEnabled(): boolean {
    return !!process.env.OPENAI_API_KEY;
}
