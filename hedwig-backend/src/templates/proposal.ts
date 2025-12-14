export interface ProposalData {
    client_name: string;
    client_email: string;
    title: string;
    problem_statement: string;
    proposed_solution: string;
    deliverables: string[];
    timeline: string;
    milestones: ProposalMilestone[];
    pricing_breakdown: PricingItem[];
    total_cost: string;
    payment_terms: string;
    about_freelancer: string;
    freelancer_name: string;
    freelancer_email: string;
}

export interface ProposalMilestone {
    phase: string;
    description: string;
    duration: string;
}

export interface PricingItem {
    item: string;
    cost: string;
}

export function generateProposalTemplate(data: ProposalData): string {
    // Build deliverables list with bullet points
    const deliverablesList = data.deliverables && data.deliverables.length > 0
        ? data.deliverables.map(d => `• ${d}`).join('\n')
        : '• Final deliverables to be confirmed upon project kickoff';

    // Build milestones section
    const milestonesSection = data.milestones && data.milestones.length > 0
        ? data.milestones.map((m, i) => {
            const phaseName = m.phase || `Phase ${i + 1}`;
            return `**${phaseName}** (${m.duration || 'TBD'})\n${m.description || 'Work on deliverables'}`;
        }).join('\n\n')
        : '';

    // Build pricing breakdown
    const pricingBreakdown = data.pricing_breakdown && data.pricing_breakdown.length > 0
        ? data.pricing_breakdown.map(p => `• ${p.item}: ${p.cost}`).join('\n')
        : '';

    // Timeline section with milestones
    const timelineSection = data.timeline && data.timeline !== 'TBD' && data.timeline !== 'To be determined'
        ? `## Timeline\n\n**Estimated Duration:** ${data.timeline}\n\n${milestonesSection ? '### Project Phases\n\n' + milestonesSection : ''}`
        : '';

    // Pricing section with breakdown
    const totalCost = data.total_cost && data.total_cost !== 'TBD' && data.total_cost !== 'To be determined'
        ? data.total_cost
        : 'To be discussed based on final scope';

    const pricingSection = `## Pricing

${pricingBreakdown ? '### Breakdown\n\n' + pricingBreakdown + '\n\n' : ''}**Total:** ${totalCost}

${data.payment_terms && data.payment_terms !== 'TBD' ? `**Payment Terms:** ${data.payment_terms}` : '*Payment terms to be discussed upon acceptance.*'}`;

    // Safe defaults for overview and scope
    const overview = data.problem_statement && data.problem_statement !== 'undefined' && data.problem_statement.length > 20
        ? data.problem_statement
        : `I'm excited to submit this proposal for ${data.title}. Based on the project requirements, I'm confident I can deliver high-quality work that meets your needs and exceeds expectations.`;

    const scope = data.proposed_solution && data.proposed_solution !== 'undefined' && data.proposed_solution.length > 20
        ? data.proposed_solution
        : `My approach will focus on understanding your specific requirements, developing solutions iteratively with your feedback, and delivering polished final assets that achieve your goals.`;



    return `# ${data.title}

*Proposal for ${data.client_name}*

---

## Project Understanding

${overview}

## My Approach

${scope}

## What You'll Receive

${deliverablesList}

${timelineSection ? '\n' + timelineSection : ''}

${pricingSection}



## Next Steps

1. Review this proposal and let me know if you have any questions
2. Once approved, I'll send a brief kickoff questionnaire
3. We'll schedule a quick call to align on expectations
4. Work begins!

---

**Proposed by:** ${data.freelancer_name}  
**Email:** ${data.freelancer_email}  
**Date:** ${new Date().toLocaleDateString()}

*Click "Accept Proposal" when you're ready to proceed.*
`.trim();
}

