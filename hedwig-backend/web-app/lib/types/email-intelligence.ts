// ─── Core Email Types ─────────────────────────────────────────────────────────

export type EmailProvider = 'gmail' | 'outlook';
export type CalendarProvider = 'google_calendar' | 'apple_ics';
export type AnyProvider = EmailProvider | CalendarProvider | 'slack' | 'manual_upload' | 'import';

export type ThreadStatus = 'matched' | 'needs_review' | 'ignored' | 'imported';
export type DocumentType = 'invoice' | 'contract' | 'receipt' | 'proposal' | 'other';
export type AttachmentStatus = 'pending' | 'extracted' | 'linked' | 'needs_review';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface EmailParticipant {
  email: string;
  name: string | null;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  body?: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  date: string;
  hasAttachments: boolean;
  attachmentCount: number;
  labels: string[];
  provider: EmailProvider;
}

export interface EmailThread {
  id: string;
  integrationId: string;
  provider: EmailProvider;
  subject: string;
  snippet: string;
  summary?: string;
  summaryGeneratedAt?: string;
  fromEmail: string;
  fromName: string | null;
  participants: string[];
  messageCount: number;
  hasAttachments: boolean;
  attachmentCount: number;
  lastMessageAt: string;
  labels: string[];
  status: ThreadStatus;
  confidenceScore?: number;
  matchedClientId?: string;
  matchedClientName?: string;
  matchedProjectId?: string;
  matchedProjectName?: string;
  matchedDocumentId?: string;
  matchedDocumentType?: DocumentType;
  isArchived: boolean;
  detectedType?: DocumentType;
  detectedAmount?: number;
  detectedCurrency?: string;
  detectedDueDate?: string;
  messages?: EmailMessage[];
  attachments?: Attachment[];
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export interface Attachment {
  id: string;
  threadId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  r2Key?: string;
  attachmentType?: DocumentType;
  status: AttachmentStatus;
  parsedData?: ParsedDocumentData;
  downloadUrl?: string;
  previewUrl?: string;
  createdAt: string;
}

export interface ParsedDocumentData {
  invoiceNumber?: string;
  issuer?: string;
  recipient?: string;
  amount?: number;
  currency?: string;
  issueDate?: string;
  dueDate?: string;
  lineItems?: LineItem[];
  contractTitle?: string;
  counterparty?: string;
  startDate?: string;
  endDate?: string;
  milestones?: string[];
  paymentTerms?: string;
  confidence: number;
  extractedAt: string;
}

export interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
}

// ─── External Documents & Imports ────────────────────────────────────────────

export interface ExternalDocument {
  id: string;
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  documentType?: DocumentType;
  source: 'email_attachment' | 'manual_upload' | 'import' | 'forwarded';
  sourceThreadId?: string;
  sourceThreadSubject?: string;
  status: AttachmentStatus | 'imported';
  parsedData?: ParsedDocumentData;
  linkedClientId?: string;
  linkedClientName?: string;
  linkedProjectId?: string;
  linkedProjectName?: string;
  linkedInvoiceId?: string;
  linkedContractId?: string;
  downloadUrl?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface ImportedInvoice extends ExternalDocument {
  documentType: 'invoice';
  parsedData: ParsedDocumentData;
  importStatus: 'pending_review' | 'approved' | 'rejected' | 'partially_approved';
  suggestions?: ImportSuggestions;
}

// ─── AI Suggestions ──────────────────────────────────────────────────────────

export type SuggestionEntityType = 'client' | 'project' | 'invoice' | 'contract';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'skipped';

export interface MatchCandidate {
  id: string;
  name: string;
  type: SuggestionEntityType;
  similarity: number;
}

export interface AISuggestion {
  id: string;
  entityType: SuggestionEntityType;
  suggestedName: string;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  reason: string;
  existingMatchCandidates: MatchCandidate[];
  approvalStatus: ApprovalStatus;
  approvedByUser: boolean;
  selectedExistingId?: string;
  suggestedData?: Record<string, unknown>;
}

export interface ImportSuggestions {
  clientSuggestion?: AISuggestion;
  projectSuggestion?: AISuggestion;
  invoiceSuggestion?: AISuggestion;
  contractSuggestion?: AISuggestion;
  allApproved: boolean;
  partiallyApproved: boolean;
  reviewedAt?: string;
}

export interface MatchSuggestion {
  threadId: string;
  suggestedClientId?: string;
  suggestedClientName?: string;
  suggestedProjectId?: string;
  suggestedProjectName?: string;
  suggestedDocumentId?: string;
  suggestedDocumentType?: DocumentType;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  reasons: string[];
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export type CalendarEventStatus = 'confirmed' | 'suggested' | 'linked' | 'unlinked';

export interface CalendarEvent {
  id: string;
  provider: CalendarProvider;
  providerEventId: string;
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  attendees: string[];
  status: CalendarEventStatus;
  matchedClientId?: string;
  matchedClientName?: string;
  matchedProjectId?: string;
  matchedProjectName?: string;
}

export interface CalendarSuggestion {
  threadId?: string;
  documentId?: string;
  event: Partial<CalendarEvent>;
  reason: string;
  confidence: number;
  status: 'pending' | 'confirmed' | 'dismissed';
}

// ─── Review ───────────────────────────────────────────────────────────────────

export type ReviewAction =
  | 'confirm_match'
  | 'reject_match'
  | 'reassign'
  | 'link_project'
  | 'link_invoice'
  | 'link_contract'
  | 'mark_ignored'
  | 'approve_import'
  | 'reject_import';

export interface ReviewDecision {
  threadId?: string;
  documentId?: string;
  action: ReviewAction;
  targetId?: string;
  targetType?: SuggestionEntityType;
  timestamp: string;
  userId: string;
}

// ─── Inbox View State ────────────────────────────────────────────────────────

export type InboxTab =
  | 'all'
  | 'matched'
  | 'needs_review'
  | 'contracts'
  | 'invoices'
  | 'receipts'
  | 'attachments'
  | 'imports';

export type SortOption = 'newest' | 'oldest' | 'confidence_high' | 'confidence_low';

export interface InboxFilter {
  tab: InboxTab;
  provider?: AnyProvider;
  clientId?: string;
  projectId?: string;
  documentType?: DocumentType;
  hasAttachments?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sort: SortOption;
}
