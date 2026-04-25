import type { Client, Invoice, Project } from '@/lib/models/entities';
import type {
  ApprovalState,
  ExistingMatchCandidate,
  ExtractedInvoiceData,
  ImportReviewResult,
  ImportReviewSession,
  ImportedDocument,
  ImportedDocumentType,
  ReviewDecision,
  ReviewDecisionType,
  SourceSignal,
  SuggestedAction,
  SuggestedActionType,
  SuggestedEntity,
  SuggestedEntityType,
} from '@/lib/types/import-review';

export interface UploadDescriptor {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface WorkspaceImportContext {
  clients: Client[];
  projects: Project[];
  invoices: Invoice[];
}

export interface ParsedAnalysisDocument {
  documentType?: string;
  invoiceNumber?: string;
  issuer?: string;
  senderEmail?: string;
  recipient?: string;
  recipientEmail?: string;
  amount?: number;
  currency?: string;
  issueDate?: string;
  dueDate?: string;
  title?: string;
  projectReference?: string;
  lineItems?: Array<{ description?: string; quantity?: number; unitPrice?: number; total?: number }>;
  paymentTerms?: string;
  notes?: string;
  confidence?: number;
  paymentStatus?: 'paid' | 'unpaid';
}

const normalize = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9@.\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const titleize = (value?: string | null) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

const tokenSet = (value?: string | null) =>
  new Set(normalize(value).split(' ').filter(Boolean));

const jaccard = (left?: string | null, right?: string | null) => {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
};

const includesEitherWay = (left?: string | null, right?: string | null) => {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
};

const emailDomain = (value?: string | null) => {
  const normalized = normalize(value);
  const parts = normalized.split('@');
  return parts.length === 2 ? parts[1] : '';
};

const confidenceTier = (score: number) => {
  if (score >= 0.84) return 'high' as const;
  if (score >= 0.62) return 'medium' as const;
  return 'low' as const;
};

const sourceSignal = (
  id: string,
  label: string,
  value: string,
  strength: SourceSignal['strength'],
): SourceSignal => ({ id, label, value, strength });

const createAction = (
  id: string,
  action_type: SuggestedActionType,
  target_entity_type: SuggestedEntityType,
  label: string,
  confidence_score: number,
  explanation: string,
): SuggestedAction => ({
  id,
  action_type,
  target_entity_type,
  label,
  confidence_score,
  confidence_tier: confidenceTier(confidence_score),
  explanation,
  requires_explicit_confirmation: true,
});

const detectDocumentType = (parsed: ParsedAnalysisDocument, upload: UploadDescriptor): ImportedDocumentType => {
  const fromParsed = normalize(parsed.documentType);
  if (fromParsed === 'invoice') return 'invoice';
  return 'invoice';
};

const buildImportedDocument = (
  upload: UploadDescriptor,
  detected_document_type: ImportedDocumentType,
): ImportedDocument => ({
  id: `import_${Date.now()}_${normalize(upload.filename).replace(/\s+/g, '_')}`,
  filename: upload.filename,
  mime_type: upload.mimeType,
  size_bytes: upload.sizeBytes,
  source: 'manual_upload',
  uploaded_at: new Date().toISOString(),
  detected_document_type,
  review_status: 'ready_for_review',
});

const toInvoiceExtraction = (parsed: ParsedAnalysisDocument): ExtractedInvoiceData => ({
  invoice_number: parsed.invoiceNumber,
  issuer_name: parsed.issuer,
  sender_email: parsed.senderEmail,
  recipient_name: parsed.recipient,
  recipient_email: parsed.recipientEmail,
  project_reference: parsed.projectReference,
  title: parsed.title,
  currency: parsed.currency,
  amount_total: parsed.amount,
  issue_date: parsed.issueDate,
  due_date: parsed.dueDate,
  line_items: (parsed.lineItems || []).map((item) => ({
    description: item.description || 'Imported line item',
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total: item.total,
  })),
  payment_terms: parsed.paymentTerms,
  notes: parsed.notes,
  payment_status: parsed.paymentStatus,
});

const rankCandidates = <T extends ExistingMatchCandidate>(candidates: T[]) =>
  [...candidates].sort((a, b) => b.similarity_score - a.similarity_score);

const reasonDetails = (summary: string, signals: SourceSignal[], details: string[]) => [
  summary,
  ...details,
  ...signals.map((signal) => `${signal.label}: ${signal.value}`),
];

const buildClientCandidates = (extracted: ExtractedInvoiceData, clients: Client[]): ExistingMatchCandidate[] => {
  const name = extracted.issuer_name;
  const email = extracted.sender_email;
  const signals = [
    ...(name ? [sourceSignal('client_name', 'Detected counterparty', name, 'strong')] : []),
    ...(email ? [sourceSignal('client_email', 'Detected email', email, 'strong')] : []),
  ];

  return rankCandidates(
    clients.map((client) => {
      const nameScore = Math.max(jaccard(name, client.name), includesEitherWay(name, client.name) ? 0.92 : 0);
      const companyScore = Math.max(jaccard(name, client.company), includesEitherWay(name, client.company) ? 0.86 : 0);
      const emailScore = email && client.email ? (normalize(email) === normalize(client.email) ? 1 : emailDomain(email) === emailDomain(client.email) ? 0.82 : 0) : 0;
      const similarity_score = Math.max(nameScore, companyScore) * 0.72 + emailScore * 0.28;
      return {
        id: client.id,
        entity_type: 'client' as const,
        name: client.name,
        subtitle: client.email || client.company,
        similarity_score,
        confidence_tier: confidenceTier(similarity_score),
        reason_summary:
          emailScore >= 0.82
            ? 'Counterparty email aligns with an existing client record.'
            : 'Client name overlaps with the detected counterparty name.',
        reason_details: reasonDetails(
          'This candidate was ranked from live workspace client data.',
          signals,
          [
            `Saved client name: ${client.name}`,
            client.email ? `Saved client email: ${client.email}` : 'Saved client email unavailable.',
          ],
        ),
        source_signals: signals,
        conflict_labels: includesEitherWay(name, client.name) && emailScore < 0.5 ? ['Name similar, email weaker'] : undefined,
      };
    }).filter((candidate) => candidate.similarity_score > 0.2),
  ).slice(0, 4);
};

const buildProjectCandidates = (extracted: ExtractedInvoiceData, projects: Project[]): ExistingMatchCandidate[] => {
  const projectRef = extracted.project_reference || extracted.title || '';
  const signals = [
    ...(projectRef ? [sourceSignal('project_ref', 'Project reference', projectRef, 'supporting')] : []),
    ...(extracted.payment_terms ? [sourceSignal('payment_terms', 'Payment terms', extracted.payment_terms, 'weak')] : []),
  ];

  return rankCandidates(
    projects.map((project) => {
      const nameScore = Math.max(jaccard(projectRef, project.name), includesEitherWay(projectRef, project.name) ? 0.9 : 0);
      const similarity_score = nameScore;
      return {
        id: project.id,
        entity_type: 'project' as const,
        name: project.name,
        subtitle: `${project.status} project`,
        similarity_score,
        confidence_tier: confidenceTier(similarity_score),
        reason_summary: 'Project title overlaps with detected project language from the imported document.',
        reason_details: reasonDetails(
          'This candidate was ranked from live workspace project data.',
          signals,
          [`Saved project name: ${project.name}`],
        ),
        source_signals: signals,
      };
    }).filter((candidate) => candidate.similarity_score > 0.2),
  ).slice(0, 4);
};

const buildInvoiceCandidates = (
  extracted: ExtractedInvoiceData,
  invoices: Invoice[],
): ExistingMatchCandidate[] => {
  const signals = [
    ...(extracted.invoice_number ? [sourceSignal('invoice_number', 'Invoice number', extracted.invoice_number, 'strong')] : []),
    ...(extracted.amount_total ? [sourceSignal('invoice_amount', 'Invoice amount', String(extracted.amount_total), 'supporting')] : []),
    ...(extracted.due_date ? [sourceSignal('invoice_due', 'Due date', extracted.due_date, 'weak')] : []),
  ];

  return rankCandidates(
    invoices.map((invoice) => {
      const numberMatch =
        extracted.invoice_number && normalize(invoice.number) === normalize(extracted.invoice_number)
          ? 1
          : extracted.invoice_number && includesEitherWay(invoice.number, extracted.invoice_number)
          ? 0.86
          : 0;
      const amountDiff =
        extracted.amount_total && invoice.amountUsd
          ? Math.abs(invoice.amountUsd - extracted.amount_total) / Math.max(extracted.amount_total, 1)
          : 1;
      const amountScore = extracted.amount_total ? Math.max(0, 1 - amountDiff) : 0;
      const dueScore =
        extracted.due_date && invoice.dueAt
          ? normalize(invoice.dueAt).slice(0, 10) === normalize(extracted.due_date).slice(0, 10)
            ? 0.8
            : 0
          : 0;
      const similarity_score = numberMatch * 0.55 + amountScore * 0.3 + dueScore * 0.15;
      return {
        id: invoice.id,
        entity_type: 'invoice' as const,
        name: invoice.number,
        subtitle: `${invoice.status} · ${invoice.amountUsd.toFixed(2)}`,
        similarity_score,
        confidence_tier: confidenceTier(similarity_score),
        reason_summary:
          numberMatch >= 0.86
            ? 'Invoice number closely matches an existing invoice.'
            : 'Amount and due date overlap with an existing invoice.',
        reason_details: reasonDetails(
          'This candidate was ranked from live invoice data.',
          signals,
          [
            `Saved invoice number: ${invoice.number}`,
            `Saved invoice amount: ${invoice.amountUsd}`,
          ],
        ),
        source_signals: signals,
        conflict_labels: numberMatch >= 0.86 ? ['Possible duplicate'] : undefined,
      };
    }).filter((candidate) => candidate.similarity_score > 0.25),
  ).slice(0, 4);
};

const makeSuggestion = (input: {
  id: string;
  entity_type: SuggestedEntityType;
  suggested_name: string;
  reason_summary: string;
  reason_details: string[];
  source_signals: SourceSignal[];
  candidates: ExistingMatchCandidate[];
  duplicate_warning?: string;
  conflict_warning?: string;
}) : SuggestedEntity => {
  const topScore = input.candidates[0]?.similarity_score ?? 0;
  const suggestedScore = input.candidates.length ? topScore : 0.48;
  const normalized = normalize(input.suggested_name);
  return {
    id: input.id,
    entity_type: input.entity_type,
    suggested_name: titleize(input.suggested_name),
    normalized_name: normalized,
    confidence_score: suggestedScore,
    confidence_tier: confidenceTier(suggestedScore),
    reason_summary: input.reason_summary,
    reason_details: input.reason_details,
    source_signals: input.source_signals,
    existing_match_candidates: input.candidates,
    suggested_actions: [],
    duplicate_warning: input.duplicate_warning,
    conflict_warning: input.conflict_warning,
    approved: false,
    manual_review_recommended: suggestedScore < 0.84 || Boolean(input.duplicate_warning || input.conflict_warning),
  };
};

const attachActions = (suggestion: SuggestedEntity): SuggestedEntity => {
  const linkAction = suggestion.existing_match_candidates.length
    ? createAction(
        `link_${suggestion.id}`,
        (`link_existing_${suggestion.entity_type}` as SuggestedActionType),
        suggestion.entity_type,
        `Link to existing ${suggestion.entity_type}`,
        suggestion.existing_match_candidates[0].similarity_score,
        `Use the best live ${suggestion.entity_type} match instead of creating a new record.`,
      )
    : null;

  const createActionType =
    suggestion.entity_type === 'invoice'
      ? 'create_external_invoice'
      : suggestion.entity_type === 'contract'
      ? 'create_external_contract'
      : suggestion.entity_type === 'client'
      ? 'create_client'
      : 'create_project';

  return {
    ...suggestion,
    suggested_actions: [
      ...(linkAction ? [linkAction] : []),
      createAction(
        `create_${suggestion.id}`,
        createActionType,
        suggestion.entity_type,
        `Create ${suggestion.entity_type}`,
        suggestion.existing_match_candidates.length ? Math.max(0.35, 1 - suggestion.existing_match_candidates[0].similarity_score) : 0.72,
        `Create a new ${suggestion.entity_type} only if the existing candidates are not correct.`,
      ),
      createAction(
        `skip_${suggestion.id}`,
        'skip',
        suggestion.entity_type,
        `Skip ${suggestion.entity_type}`,
        0.4,
        'Leave this suggestion unresolved for later review.',
      ),
    ],
  };
};

const buildInvoiceSuggestions = (
  extracted: ExtractedInvoiceData,
  workspace: WorkspaceImportContext,
) => {
  const clientSignals = [
    ...(extracted.issuer_name ? [sourceSignal('issuer_name', 'Issuer name', extracted.issuer_name, 'strong')] : []),
    ...(extracted.sender_email ? [sourceSignal('sender_email', 'Sender email', extracted.sender_email, 'strong')] : []),
  ];
  const projectSignals = [
    ...(extracted.project_reference ? [sourceSignal('project_reference', 'Project reference', extracted.project_reference, 'supporting')] : []),
    ...(extracted.title ? [sourceSignal('invoice_title', 'Invoice title', extracted.title, 'supporting')] : []),
    ...extracted.line_items.slice(0, 2).map((item, index) =>
      sourceSignal(`line_item_${index}`, 'Line item', item.description, 'supporting'),
    ),
  ];

  const clientCandidates = buildClientCandidates(extracted, workspace.clients);
  const projectCandidates = buildProjectCandidates(extracted, workspace.projects);
  const invoiceCandidates = buildInvoiceCandidates(extracted, workspace.invoices);

  const suggestions = [
    attachActions(
      makeSuggestion({
        id: 'suggest_client',
        entity_type: 'client',
        suggested_name: extracted.issuer_name || 'Imported client',
        reason_summary: `Suggested client: ${titleize(extracted.issuer_name || 'Imported client')} because the issuer name and sender email were detected from the document.`,
        reason_details: reasonDetails(
          'Client matching used your live Hedwig clients.',
          clientSignals,
          [
            clientCandidates.length
              ? 'Existing client alternatives were found and ranked below.'
              : 'No confident existing client match was found, so creating a new client may be appropriate.',
          ],
        ),
        source_signals: clientSignals,
        candidates: clientCandidates,
        conflict_warning:
          clientCandidates.length > 1 && (clientCandidates[0].similarity_score - clientCandidates[1].similarity_score) < 0.12
            ? 'More than one similar client was found. Review before approving.'
            : undefined,
      }),
    ),
    attachActions(
      makeSuggestion({
        id: 'suggest_project',
        entity_type: 'project',
        suggested_name: extracted.project_reference || extracted.title || 'Imported project',
        reason_summary: `Suggested project: ${titleize(extracted.project_reference || extracted.title || 'Imported project')} because the document references project-specific work.`,
        reason_details: reasonDetails(
          'Project matching used your live Hedwig projects.',
          projectSignals,
          [
            projectCandidates.length
              ? 'Top likely project matches are listed below.'
              : 'No confident project match was found, so a new project may be needed.',
          ],
        ),
        source_signals: projectSignals,
        candidates: projectCandidates,
        conflict_warning:
          projectCandidates.length > 1 && (projectCandidates[0].similarity_score - projectCandidates[1].similarity_score) < 0.15
            ? 'Multiple possible projects were found.'
            : undefined,
      }),
    ),
    attachActions(
      makeSuggestion({
        id: 'suggest_invoice',
        entity_type: 'invoice',
        suggested_name: extracted.invoice_number || extracted.title || 'Imported external invoice',
        reason_summary:
          invoiceCandidates[0]?.conflict_labels?.includes('Possible duplicate')
            ? 'Suggested link to an existing invoice because the invoice number and amount appear to match a live invoice.'
            : 'Suggested external invoice record because Hedwig detected a valid invoice and no strong duplicate was confirmed.',
        reason_details: reasonDetails(
          'Invoice duplicate checks used your live invoice records.',
          [
            ...(extracted.invoice_number ? [sourceSignal('invoice_number', 'Invoice number', extracted.invoice_number, 'strong')] : []),
            ...(extracted.amount_total ? [sourceSignal('invoice_amount', 'Invoice amount', String(extracted.amount_total), 'supporting')] : []),
          ],
          ['If you approve creation, the invoice import can be executed against live data.'],
        ),
        source_signals: [
          ...(extracted.invoice_number ? [sourceSignal('invoice_number_base', 'Invoice number', extracted.invoice_number, 'strong')] : []),
          ...(extracted.amount_total ? [sourceSignal('invoice_amount_base', 'Invoice amount', String(extracted.amount_total), 'supporting')] : []),
        ],
        candidates: invoiceCandidates,
        duplicate_warning: invoiceCandidates[0]?.conflict_labels?.includes('Possible duplicate')
          ? `Possible duplicate detected against live invoice ${invoiceCandidates[0].name}.`
          : undefined,
      }),
    ),
  ];

  const warnings = [
    ...(invoiceCandidates[0]?.conflict_labels?.includes('Possible duplicate')
      ? [`Live duplicate warning: invoice ${invoiceCandidates[0].name} may already exist.`]
      : []),
    ...(projectCandidates.length > 1 && (projectCandidates[0].similarity_score - projectCandidates[1].similarity_score) < 0.15
      ? ['Multiple live project candidates were found for this invoice.']
      : []),
  ];

  return { suggestions, warnings, matches: [...clientCandidates, ...projectCandidates, ...invoiceCandidates] };
};

export const buildReviewSession = (params: {
  upload: UploadDescriptor;
  parsed: ParsedAnalysisDocument;
  workspace: WorkspaceImportContext;
}): ImportReviewSession => {
  const detectedDocumentType = detectDocumentType(params.parsed, params.upload);
  const document = buildImportedDocument(params.upload, detectedDocumentType);
  const extracted_invoice_data = toInvoiceExtraction(params.parsed);
  const suggestionBundle = buildInvoiceSuggestions(extracted_invoice_data, params.workspace);

  return {
    id: `review_${document.id}`,
    document,
    extracted_invoice_data,
    suggestions: suggestionBundle.suggestions,
    existing_matches: suggestionBundle.matches,
    warnings: suggestionBundle.warnings,
    decisions: [],
    approval_state: {
      step: 'review',
      confirm_enabled: false,
      review_complete: false,
      approved_actions: [],
      rejected_actions: [],
      deferred_actions: [],
    },
    explanation_json: {
      engine: 'live_workspace_matcher_v1',
      detectedDocumentType,
      parsedConfidence: params.parsed.confidence ?? null,
      liveCounts: {
        clients: params.workspace.clients.length,
        projects: params.workspace.projects.length,
        invoices: params.workspace.invoices.length,
      },
    },
  };
};

const actionForDecision = (suggestion: SuggestedEntity): SuggestedAction | null => {
  if (suggestion.user_decision === 'skip' || suggestion.user_decision === 'defer' || suggestion.user_decision === 'reject') {
    return createAction(
      `skip_${suggestion.id}`,
      'skip',
      suggestion.entity_type,
      `Skip ${suggestion.entity_type}`,
      suggestion.confidence_score,
      'No create or link action will be executed for this suggestion.',
    );
  }

  if (suggestion.user_decision === 'link_existing') {
    return suggestion.suggested_actions.find((action) => action.action_type.startsWith('link_existing')) ?? null;
  }

  if (suggestion.user_decision === 'approve_creation' || suggestion.user_decision === 'edit_then_approve') {
    return suggestion.suggested_actions.find((action) => action.action_type.startsWith('create_')) ?? null;
  }

  return null;
};

export const isSuggestionResolved = (suggestion: SuggestedEntity) =>
  suggestion.user_decision === 'approve_creation' ||
  suggestion.user_decision === 'link_existing' ||
  suggestion.user_decision === 'edit_then_approve' ||
  suggestion.user_decision === 'reject' ||
  suggestion.user_decision === 'skip' ||
  suggestion.user_decision === 'defer';

export const buildApprovalState = (session: ImportReviewSession): ApprovalState => {
  const resolved = session.suggestions.every(isSuggestionResolved);
  const approved_actions = session.suggestions
    .map(actionForDecision)
    .filter((action): action is SuggestedAction => Boolean(action))
    .filter((action) => action.action_type !== 'skip');
  const rejected_actions = session.suggestions
    .filter((suggestion) => suggestion.user_decision === 'reject')
    .map((suggestion) =>
      createAction(
        `rejected_${suggestion.id}`,
        'skip',
        suggestion.entity_type,
        `Reject ${suggestion.entity_type}`,
        suggestion.confidence_score,
        'The user explicitly rejected this suggestion.',
      ),
    );
  const deferred_actions = session.suggestions
    .filter((suggestion) => suggestion.user_decision === 'defer' || suggestion.user_decision === 'skip')
    .map((suggestion) =>
      createAction(
        `deferred_${suggestion.id}`,
        'skip',
        suggestion.entity_type,
        `Defer ${suggestion.entity_type}`,
        suggestion.confidence_score,
        'The user chose to resolve this suggestion later.',
      ),
    );

  return {
    step: session.approval_state.step,
    processing_stage: session.approval_state.processing_stage,
    confirm_enabled: resolved,
    review_complete: resolved,
    approved_actions,
    rejected_actions,
    deferred_actions,
  };
};

export const applyDecision = (
  session: ImportReviewSession,
  suggestionId: string,
  decision: ReviewDecisionType,
  options?: { selectedExistingMatchId?: string; editedValue?: string },
): ImportReviewSession => {
  const now = new Date().toISOString();
  const nextSuggestions = session.suggestions.map((suggestion) =>
    suggestion.id !== suggestionId
      ? suggestion
      : {
          ...suggestion,
          approved: decision === 'approve_creation' || decision === 'link_existing' || decision === 'edit_then_approve',
          user_decision: decision,
          selected_existing_match_id: options?.selectedExistingMatchId,
          edited_value: options?.editedValue,
        },
  );

  const updatedSuggestion = nextSuggestions.find((suggestion) => suggestion.id === suggestionId);
  const nextDecisions = [
    ...session.decisions.filter((decisionItem) => decisionItem.suggestion_id !== suggestionId),
    {
      id: `decision_${suggestionId}`,
      suggestion_id: suggestionId,
      document_id: session.document.id,
      entity_type: updatedSuggestion?.entity_type ?? 'client',
      decision,
      selected_existing_match_id: options?.selectedExistingMatchId,
      edited_value: options?.editedValue,
      approved: decision === 'approve_creation' || decision === 'link_existing' || decision === 'edit_then_approve',
      created_at: now,
    } satisfies ReviewDecision,
  ];

  const nextSession: ImportReviewSession = {
    ...session,
    suggestions: nextSuggestions,
    decisions: nextDecisions,
  };

  return { ...nextSession, approval_state: buildApprovalState(nextSession) };
};

export const buildConfirmationActions = (session: ImportReviewSession) =>
  session.suggestions.map((suggestion) => {
    if (suggestion.user_decision === 'link_existing') {
      const selectedMatch = suggestion.existing_match_candidates.find(
        (candidate) => candidate.id === suggestion.selected_existing_match_id,
      );
      return {
        id: suggestion.id,
        kind: 'link' as const,
        label: `Link ${suggestion.entity_type}: ${selectedMatch?.name || suggestion.suggested_name}`,
        explanation: suggestion.reason_summary,
      };
    }

    if (suggestion.user_decision === 'approve_creation' || suggestion.user_decision === 'edit_then_approve') {
      return {
        id: suggestion.id,
        kind: 'create' as const,
        label: `Create ${suggestion.entity_type}: ${suggestion.edited_value || suggestion.suggested_name}`,
        explanation: suggestion.reason_summary,
      };
    }

    if (suggestion.user_decision === 'defer' || suggestion.user_decision === 'skip') {
      return {
        id: suggestion.id,
        kind: 'defer' as const,
        label: `Defer ${suggestion.entity_type}: ${suggestion.suggested_name}`,
        explanation: 'This suggestion will stay unresolved for later review.',
      };
    }

    return {
      id: suggestion.id,
      kind: 'ignore' as const,
      label: `Ignore ${suggestion.entity_type}: ${suggestion.suggested_name}`,
      explanation: 'This suggestion will not be executed.',
    };
  });

export const executeDecisionSummary = (session: ImportReviewSession): ImportReviewResult =>
  session.suggestions.reduce<ImportReviewResult>(
    (result, suggestion) => {
      if (suggestion.user_decision === 'approve_creation' || suggestion.user_decision === 'edit_then_approve') {
        result.created_entities.push({
          entity_type: suggestion.entity_type,
          label: suggestion.edited_value || suggestion.suggested_name,
        });
      } else if (suggestion.user_decision === 'link_existing') {
        const selected = suggestion.existing_match_candidates.find(
          (candidate) => candidate.id === suggestion.selected_existing_match_id,
        );
        result.linked_entities.push({
          entity_type: suggestion.entity_type,
          label: selected?.name || suggestion.suggested_name,
        });
      } else if (suggestion.user_decision === 'defer' || suggestion.user_decision === 'skip') {
        result.deferred_entities.push({
          entity_type: suggestion.entity_type,
          label: suggestion.suggested_name,
        });
      } else {
        result.ignored_entities.push({
          entity_type: suggestion.entity_type,
          label: suggestion.suggested_name,
        });
      }
      return result;
    },
    {
      created_entities: [],
      linked_entities: [],
      ignored_entities: [],
      deferred_entities: [],
    },
  );
