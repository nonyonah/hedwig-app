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
    const deliverablesList = data.deliverables.map((d, i) =>
        `${i + 1}. ${d}`
    ).join('\n');

    const milestonesList = data.milestones.map((m, i) => {
        const phaseName = m.phase || `Milestone ${i + 1}`;
        return `**Phase ${i + 1}: ${phaseName}**\n${m.description || 'Work on deliverables'}\nDuration: ${m.duration || 'TBD'}`;
    }).join('\n\n');

    const pricingList = data.pricing_breakdown.map(p =>
        `- ${p.item}: ${p.cost}`
    ).join('\n');

    const paymentTerms = data.payment_terms || 'An invoice will be generated automatically and sent to you via email after the project is completed.';

    return `
# PROJECT PROPOSAL

**To:** ${data.client_name}  
**From:** ${data.freelancer_name}  
**Date:** ${new Date().toLocaleDateString()}  
**Subject:** ${data.title}

---

## EXECUTIVE SUMMARY

Thank you for considering my services for your project. This proposal outlines my approach to delivering **${data.title}**, including scope, timeline, and investment required.

---

## PROBLEM STATEMENT

This project addresses a critical business need for ${data.client_name}. ${data.problem_statement}

By addressing these challenges, we can unlock new opportunities for growth and improved efficiency in your operations.

---

## PROPOSED SOLUTION

To solve the challenges outlined above, I propose the following comprehensive approach:

${data.proposed_solution}

This solution is designed to deliver measurable results while ensuring seamless integration with your existing workflows. My approach combines industry best practices with tailored strategies specific to your needs.

---

## DELIVERABLES

You will receive the following high-quality deliverables upon project completion:

${deliverablesList}

---

## PROJECT TIMELINE & MILESTONES

**Estimated Timeline:** ${data.timeline}

${milestonesList}

---

## INVESTMENT & PRICING

${pricingList}

**Total Project Investment:** ${data.total_cost}

---

## PAYMENT TERMS

${paymentTerms}

All payments will be processed securely through the Hedwig platform using cryptocurrency.

---

## ABOUT ME

${data.about_freelancer}

---

## NEXT STEPS

If you're ready to move forward:

1. **Accept this proposal** - Click the "Accept Proposal" button below
2. **Initial payment** - Complete the first milestone payment
3. **Project kickoff** - We'll schedule a kickoff call to align on details
4. **Delivery** - I'll deliver according to the timeline above

---

## ACCEPTANCE

By clicking "Accept Proposal," you agree to the terms, scope, timeline, and pricing outlined in this document. A formal contract will be generated upon acceptance.

**Proposed by:** ${data.freelancer_name}  
**Email:** ${data.freelancer_email}

**Status:** Awaiting Client Acceptance
`.trim();
}
