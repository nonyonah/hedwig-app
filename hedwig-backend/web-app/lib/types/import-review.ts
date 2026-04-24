export type ImportedDocumentType = 'invoice' | 'contract' | 'unknown';
export type ImportedDocumentSource =
  | 'email_attachment'
  | 'manual_upload'
  | 'drag_drop'
  | 'external_workflow';

export type SuggestedActionType =
  | 'create_client'
  | 'create_project'
  | 'create_external_invoice'
  | 'create_external_contract'
  | 'link_existing_client'
  | 'link_existing_project'
  | 'link_existing_invoice'
  | 'link_existing_contract'
  | 'skip';

export type SuggestedEntityType = 'client' | 'project' | 'invoice' | 'contract';
export type ConfidenceTier = 'high' | 'medium' | 'low';
export type ReviewDecisionType =
  | 'approve_creation'
  | 'link_existing'
  | 'edit_then_approve'
  | 'reject'
  | 'skip'
  | 'defer';

export type ImportReviewStep =
  | 'upload'
  | 'processing'
  | 'review'
  | 'confirm'
  | 'result'
  | 'error';

export interface SourceSignal {
  id: string;
  label: string;
  value: string;
  strength: 'strong' | 'supporting' | 'weak';
}

export interface SuggestionReason {
  id: string;
  summary: string;
  details: string[];
  source_signals: SourceSignal[];
}

export interface ExistingMatchCandidate {
  id: string;
  entity_type: SuggestedEntityType;
  name: string;
  subtitle?: string;
  similarity_score: number;
  confidence_tier: ConfidenceTier;
  reason_summary: string;
  reason_details: string[];
  source_signals: SourceSignal[];
  conflict_labels?: string[];
}

export interface SuggestedAction {
  id: string;
  action_type: SuggestedActionType;
  label: string;
  target_entity_type: SuggestedEntityType;
  confidence_score: number;
  confidence_tier: ConfidenceTier;
  explanation: string;
  requires_explicit_confirmation: true;
}

export interface SuggestedEntity {
  id: string;
  entity_type: SuggestedEntityType;
  suggested_name: string;
  normalized_name: string;
  confidence_score: number;
  confidence_tier: ConfidenceTier;
  reason_summary: string;
  reason_details: string[];
  source_signals: SourceSignal[];
  existing_match_candidates: ExistingMatchCandidate[];
  suggested_actions: SuggestedAction[];
  duplicate_warning?: string;
  conflict_warning?: string;
  user_decision?: ReviewDecisionType;
  edited_value?: string;
  approved: boolean;
  selected_existing_match_id?: string;
  manual_review_recommended: boolean;
}

export interface ImportedDocument {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  source: ImportedDocumentSource;
  uploaded_at: string;
  detected_document_type: ImportedDocumentType;
  review_status: 'uploaded' | 'processing' | 'ready_for_review' | 'confirmed' | 'deferred' | 'error';
  preview_url?: string;
  email_metadata?: {
    sender_name?: string;
    sender_email?: string;
    subject?: string;
    thread_id?: string;
  };
}

export interface ExtractedLineItem {
  description: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
}

export interface ExtractedMilestone {
  id: string;
  title: string;
  amount?: number;
  due_date?: string;
}

export interface ExtractedInvoiceData {
  invoice_number?: string;
  issuer_name?: string;
  sender_email?: string;
  recipient_name?: string;
  recipient_email?: string;
  project_reference?: string;
  title?: string;
  currency?: string;
  amount_total?: number;
  issue_date?: string;
  due_date?: string;
  line_items: ExtractedLineItem[];
  payment_terms?: string;
  notes?: string;
}

export interface ExtractedContractData {
  contract_title?: string;
  counterparty_name?: string;
  counterparty_email?: string;
  project_reference?: string;
  start_date?: string;
  end_date?: string;
  payment_terms?: string;
  milestones: ExtractedMilestone[];
  renewal_terms?: string;
  notes?: string;
}

export interface ReviewDecision {
  id: string;
  suggestion_id: string;
  document_id: string;
  entity_type: SuggestedEntityType;
  decision: ReviewDecisionType;
  selected_existing_match_id?: string;
  edited_value?: string;
  approved: boolean;
  created_at: string;
}

export interface ApprovalState {
  step: ImportReviewStep;
  processing_stage?: 'extracting_fields' | 'checking_existing_matches' | 'preparing_suggestions';
  confirm_enabled: boolean;
  review_complete: boolean;
  approved_actions: SuggestedAction[];
  rejected_actions: SuggestedAction[];
  deferred_actions: SuggestedAction[];
}

export interface ImportReviewResult {
  created_entities: Array<{ entity_type: SuggestedEntityType; label: string }>;
  linked_entities: Array<{ entity_type: SuggestedEntityType; label: string }>;
  ignored_entities: Array<{ entity_type: SuggestedEntityType; label: string }>;
  deferred_entities: Array<{ entity_type: SuggestedEntityType; label: string }>;
}

export interface ImportReviewSession {
  id: string;
  document: ImportedDocument;
  extracted_invoice_data?: ExtractedInvoiceData;
  extracted_contract_data?: ExtractedContractData;
  suggestions: SuggestedEntity[];
  existing_matches: ExistingMatchCandidate[];
  warnings: string[];
  decisions: ReviewDecision[];
  approval_state: ApprovalState;
  explanation_json: Record<string, unknown>;
}

export interface ImportedDocumentsTableRow {
  id: string;
  user_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  source: ImportedDocumentSource;
  detected_document_type: ImportedDocumentType;
  review_status: ImportReviewStep | 'deferred';
  confidence_score: number | null;
  explanation_json: Record<string, unknown> | null;
  source_signals: SourceSignal[];
  approved_actions: string[];
  rejected_actions: string[];
  deferred_actions: string[];
  created_at: string;
  updated_at: string;
}

export interface ExtractedDocumentEntitiesTableRow {
  id: string;
  imported_document_id: string;
  entity_type: SuggestedEntityType | 'document';
  normalized_name: string | null;
  raw_value: string | null;
  extracted_json: Record<string, unknown>;
  confidence_score: number | null;
  created_at: string;
}

export interface EntitySuggestionsTableRow {
  id: string;
  imported_document_id: string;
  action_type: SuggestedActionType;
  entity_type: SuggestedEntityType;
  confidence_score: number;
  explanation_json: Record<string, unknown>;
  source_signals: SourceSignal[];
  review_status: 'pending' | 'approved' | 'rejected' | 'deferred';
  created_at: string;
}

export interface SuggestionReviewSessionsTableRow {
  id: string;
  imported_document_id: string;
  review_status: ImportReviewStep | 'deferred';
  confidence_score: number | null;
  explanation_json: Record<string, unknown> | null;
  approved_actions: string[];
  rejected_actions: string[];
  deferred_actions: string[];
  created_at: string;
  updated_at: string;
}

export interface ReviewDecisionsTableRow {
  id: string;
  suggestion_review_session_id: string;
  suggestion_id: string;
  decision: ReviewDecisionType;
  selected_existing_match_id: string | null;
  edited_value: string | null;
  approved: boolean;
  created_at: string;
}
