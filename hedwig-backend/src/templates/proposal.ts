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
    const deliverablesList = data.deliverables && data.deliverables.length > 0
        ? data.deliverables.map(d => `- ${d}`).join('\n')
        : '- To be defined based on project scope';

    const milestonesList = data.milestones && data.milestones.length > 0
        ? data.milestones.map((m, i) => {
            const phaseName = m.phase || `Phase ${i + 1}`;
            return `**${phaseName}:** ${m.description || 'Work on deliverables'} (${m.duration || 'TBD'})`;
        }).join('\n')
        : '';

    const pricingList = data.pricing_breakdown && data.pricing_breakdown.length > 0
        ? data.pricing_breakdown.map(p => `- ${p.item}: ${p.cost}`).join('\n')
        : '';

    const timelineSection = data.timeline && data.timeline !== 'TBD' && data.timeline !== 'To be determined' && data.timeline !== 'To be discussed based on project requirements.'
        ? `\n\n## Timeline\n\n${data.timeline}${milestonesList ? '\n\n' + milestonesList : ''}`
        : '';

    const pricingSection = data.total_cost && data.total_cost !== 'TBD' && data.total_cost !== 'To be determined' && data.total_cost !== 'To be discussed based on scope.'
        ? `\n\n## Compensation\n\n${pricingList ? pricingList + '\n\n' : ''}**Total:** ${data.total_cost}`
        : '\n\n## Compensation\n\nThis is a paid engagement. Pricing can be discussed based on scope and requirements.';

    // Safe defaults for overview and scope
    const overview = data.problem_statement && data.problem_statement !== 'undefined'
        ? data.problem_statement
        : `Professional services for ${data.title}.`;

    const scope = data.proposed_solution && data.proposed_solution !== 'undefined'
        ? data.proposed_solution
        : `I will deliver high-quality work for this project, meeting all requirements and deadlines.`;

    return `# Proposal: ${data.title}

## Overview

${overview}

## Scope of Work

${scope}

## Deliverables

${deliverablesList}${timelineSection}${pricingSection}

## Next Steps

Please share any additional details about your requirements so we can proceed. Once you're ready, click "Accept Proposal" to move forward.

---

**Proposed by:** ${data.freelancer_name}  
**Email:** ${data.freelancer_email}  
**Date:** ${new Date().toLocaleDateString()}

**Status:** Awaiting Acceptance
`.trim();
}

