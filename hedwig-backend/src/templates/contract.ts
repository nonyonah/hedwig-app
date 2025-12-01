export interface ContractData {
    client_name: string;
    client_email: string;
    client_address?: string;
    title: string;
    scope_of_work: string;
    deliverables: string[];
    milestones: Milestone[];
    payment_amount: string;
    payment_terms: string;
    start_date?: string;
    end_date?: string;
    revisions?: string;
    termination_clause?: string;
    confidentiality?: string;
    governing_law?: string;
    freelancer_name: string;
    freelancer_email: string;
}

export interface Milestone {
    description: string;
    amount: string;
    due_date?: string;
}

export function generateContractTemplate(data: ContractData): string {
    const milestonesList = data.milestones.map((m, i) =>
        `${i + 1}. ${m.description} - ${m.amount}${m.due_date ? ` (Due: ${m.due_date})` : ''}`
    ).join('\n');

    const deliverablesList = data.deliverables.map((d, i) =>
        `${i + 1}. ${d}`
    ).join('\n');

    return `
# ${data.title.toUpperCase()}

**Date:** ${new Date().toLocaleDateString()}

## PARTIES

**Service Provider (Freelancer):**
- Name: ${data.freelancer_name}
- Email: ${data.freelancer_email}

**Client:**
- Name: ${data.client_name}
- Email: ${data.client_email}
${data.client_address ? `- Address: ${data.client_address}` : ''}

---

## 1. PROJECT OVERVIEW

**Project Title:** ${data.title}

**Scope of Work:**
${data.scope_of_work}

---

## 2. DELIVERABLES

The Service Provider agrees to deliver the following:

${deliverablesList}

---

## 3. TIMELINE & MILESTONES

**Project Start Date:** ${data.start_date || 'Upon contract signing'}
**Project End Date:** ${data.end_date || 'As per milestones'}

**Payment Milestones:**

${milestonesList}

---

## 4. PAYMENT TERMS

**Total Project Value:** ${data.payment_amount}

**Payment Schedule:**
${data.payment_terms || 'An invoice will be generated automatically and sent to you via email after the project is completed.'}

**Payment Method:** Cryptocurrency payments via Hedwig platform

---

## 5. REVISIONS

${data.revisions || 'The Client is entitled to reasonable revisions during the project. Major scope changes will require a separate agreement and additional compensation.'}

---

## 6. OWNERSHIP & INTELLECTUAL PROPERTY

Upon full payment, all intellectual property rights for the deliverables will transfer to the Client. The Service Provider retains the right to display the work in their portfolio unless otherwise agreed.

---

## 7. CONFIDENTIALITY

${data.confidentiality || 'Both parties agree to keep confidential any proprietary information shared during this engagement.'}

---

## 8. TERMINATION

${data.termination_clause || 'Either party may terminate this contract with 7 days written notice. The Client agrees to compensate the Service Provider for all work completed up to the termination date.'}

---

## 9. GOVERNING LAW

${data.governing_law || 'This contract shall be governed by the laws of the jurisdiction where the Service Provider operates.'}

---

## 10. ACCEPTANCE

By accepting this contract, both parties agree to the terms outlined above.
`.trim();
}
