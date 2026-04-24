import type {
  ExistingMatchCandidate,
  ExtractedContractData,
  ExtractedInvoiceData,
  ImportedDocument,
  ImportedDocumentType,
  SourceSignal,
} from '@/lib/types/import-review';

export interface ExistingWorkspaceEntity {
  id: string;
  entity_type: 'client' | 'project' | 'invoice' | 'contract';
  name: string;
  subtitle?: string;
  keywords: string[];
}

export const existingWorkspaceEntities: ExistingWorkspaceEntity[] = [
  {
    id: 'client_acme_studio',
    entity_type: 'client',
    name: 'Acme Studio',
    subtitle: 'Client since 2025 • accounts@acmestudio.co',
    keywords: ['acme', 'studio', 'accounts@acmestudio.co', 'design'],
  },
  {
    id: 'client_acme_ventures',
    entity_type: 'client',
    name: 'Acme Ventures',
    subtitle: 'Prospect • hello@acmeventures.io',
    keywords: ['acme', 'ventures', 'hello@acmeventures.io'],
  },
  {
    id: 'client_northstar',
    entity_type: 'client',
    name: 'Northstar Labs',
    subtitle: 'Active client • finance@northstarlabs.com',
    keywords: ['northstar', 'labs', 'finance@northstarlabs.com'],
  },
  {
    id: 'project_website_redesign',
    entity_type: 'project',
    name: 'Website Redesign',
    subtitle: 'Acme Studio • active',
    keywords: ['website redesign', 'redesign', 'homepage', 'landing page', 'ux refresh'],
  },
  {
    id: 'project_brand_refresh',
    entity_type: 'project',
    name: 'Brand Refresh Sprint',
    subtitle: 'Acme Studio • archived',
    keywords: ['brand refresh', 'refresh', 'identity'],
  },
  {
    id: 'project_q2_growth',
    entity_type: 'project',
    name: 'Q2 Growth Sprint',
    subtitle: 'Northstar Labs • planning',
    keywords: ['growth sprint', 'q2', 'campaign', 'performance'],
  },
  {
    id: 'invoice_inv_2048',
    entity_type: 'invoice',
    name: 'INV-2048',
    subtitle: 'Acme Studio • $4,800 • Apr 11, 2026',
    keywords: ['inv-2048', '2048', '4800', 'acme studio'],
  },
  {
    id: 'invoice_ns_991',
    entity_type: 'invoice',
    name: 'NS-991',
    subtitle: 'Northstar Labs • $6,200 • Mar 30, 2026',
    keywords: ['ns-991', '6200', 'northstar'],
  },
  {
    id: 'contract_acme_retainer',
    entity_type: 'contract',
    name: 'Acme Studio Retainer',
    subtitle: 'Signed Jan 2026',
    keywords: ['retainer', 'acme studio', 'services agreement'],
  },
  {
    id: 'contract_acme_sow',
    entity_type: 'contract',
    name: 'Acme Website Redesign SOW',
    subtitle: 'Drafted Feb 2026',
    keywords: ['website redesign', 'sow', 'statement of work', 'acme'],
  },
];

export const importSourceSignals = {
  issuer: (value: string): SourceSignal => ({ id: `issuer_${value}`, label: 'Issuer name', value, strength: 'strong' }),
  sender: (value: string): SourceSignal => ({ id: `sender_${value}`, label: 'Sender email', value, strength: 'strong' }),
  recipient: (value: string): SourceSignal => ({ id: `recipient_${value}`, label: 'Recipient', value, strength: 'supporting' }),
  invoiceNumber: (value: string): SourceSignal => ({ id: `invoice_${value}`, label: 'Invoice number', value, strength: 'strong' }),
  title: (value: string): SourceSignal => ({ id: `title_${value}`, label: 'Document title', value, strength: 'strong' }),
  project: (value: string): SourceSignal => ({ id: `project_${value}`, label: 'Project reference', value, strength: 'supporting' }),
  paymentTerms: (value: string): SourceSignal => ({ id: `terms_${value}`, label: 'Payment terms', value, strength: 'weak' }),
  date: (value: string): SourceSignal => ({ id: `date_${value}`, label: 'Detected dates', value, strength: 'supporting' }),
  history: (value: string): SourceSignal => ({ id: `history_${value}`, label: 'Historical match', value, strength: 'supporting' }),
  filename: (value: string): SourceSignal => ({ id: `filename_${value}`, label: 'Filename pattern', value, strength: 'weak' }),
};

export const mockInvoiceExtraction: ExtractedInvoiceData = {
  invoice_number: 'INV-2048',
  issuer_name: 'Acme Studio',
  sender_email: 'accounts@acmestudio.co',
  recipient_name: 'Hedwig Labs',
  recipient_email: 'ops@hedwigbot.xyz',
  project_reference: 'Website Redesign',
  title: 'Website redesign - April milestone invoice',
  currency: 'USD',
  amount_total: 4800,
  issue_date: '2026-04-14',
  due_date: '2026-04-28',
  line_items: [
    { description: 'Homepage redesign milestone', quantity: 1, unit_price: 3200, total: 3200 },
    { description: 'Design QA and implementation support', quantity: 1, unit_price: 1600, total: 1600 },
  ],
  payment_terms: 'Net 14',
  notes: 'Mentions redesign work and milestone delivery in the footer.',
};

export const mockContractExtraction: ExtractedContractData = {
  contract_title: 'Acme Studio Website Redesign Statement of Work',
  counterparty_name: 'Acme Studio',
  counterparty_email: 'legal@acmestudio.co',
  project_reference: 'Website Redesign',
  start_date: '2026-05-01',
  end_date: '2026-08-31',
  payment_terms: '50% upfront, 25% on design approval, 25% on launch',
  milestones: [
    { id: 'milestone_discovery', title: 'Discovery and scope alignment', due_date: '2026-05-12', amount: 2500 },
    { id: 'milestone_design', title: 'Design approval', due_date: '2026-06-16', amount: 2500 },
    { id: 'milestone_launch', title: 'Launch support', due_date: '2026-08-31', amount: 2500 },
  ],
  renewal_terms: 'Optional monthly optimization addendum after launch.',
  notes: 'The contract references redesign work, delivery dates, and staged payments.',
};

export const mockAmbiguousInvoiceExtraction: ExtractedInvoiceData = {
  invoice_number: 'APR-114',
  issuer_name: 'Acme',
  sender_email: 'billing@acmehq.co',
  recipient_name: 'Hedwig Labs',
  project_reference: 'Refresh work',
  title: 'April design invoice',
  currency: 'USD',
  amount_total: 5100,
  issue_date: '2026-04-10',
  due_date: '2026-04-24',
  line_items: [
    { description: 'Refresh sprint', quantity: 1, unit_price: 5100, total: 5100 },
  ],
  payment_terms: 'Due on receipt',
  notes: 'Counterparty name is incomplete and project naming is ambiguous.',
};

export const buildMockImportedDocument = (
  filename: string,
  mime_type: string,
  size_bytes: number,
  detected_document_type: ImportedDocumentType,
): ImportedDocument => ({
  id: `import_${filename.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  filename,
  mime_type,
  size_bytes,
  source: 'manual_upload',
  uploaded_at: new Date().toISOString(),
  detected_document_type,
  review_status: 'processing',
});

export const toCandidate = (
  entity: ExistingWorkspaceEntity,
  similarity_score: number,
  source_signals: SourceSignal[],
  reason_summary: string,
  reason_details: string[],
  conflict_labels?: string[],
): ExistingMatchCandidate => ({
  id: entity.id,
  entity_type: entity.entity_type,
  name: entity.name,
  subtitle: entity.subtitle,
  similarity_score,
  confidence_tier: similarity_score >= 0.84 ? 'high' : similarity_score >= 0.62 ? 'medium' : 'low',
  reason_summary,
  reason_details,
  source_signals,
  conflict_labels,
});
