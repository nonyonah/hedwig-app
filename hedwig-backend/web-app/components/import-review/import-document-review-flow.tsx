'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  Sparkle,
  UploadSimple,
  WarningCircle,
  X,
} from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';
import type { ExternalDocument } from '@/lib/types/email-intelligence';
import type {
  ImportReviewResult,
  ImportReviewSession,
  ReviewDecisionType,
  SuggestedEntity,
} from '@/lib/types/import-review';
import {
  applyDecision,
  buildApprovalState,
  buildConfirmationActions,
  buildReviewSession,
  executeDecisionSummary,
  isSuggestionResolved,
  type ParsedAnalysisDocument,
  type WorkspaceImportContext,
} from '@/lib/import-review/suggestion-engine';
import { ApprovalActionBar } from './approval-action-bar';
import { ConfirmationSheet } from './confirmation-sheet';
import { DocumentImportSummary } from './document-import-summary';
import { ReviewDecisionModal } from './review-decision-modal';
import { SuggestionCard } from './suggestion-card';

type LayoutMode = 'modal' | 'page';

const PROCESSING_STAGES = [
  { id: 'extracting_fields', label: 'Extracting fields' },
  { id: 'checking_existing_matches', label: 'Checking existing matches' },
  { id: 'preparing_suggestions', label: 'Preparing suggestions' },
] as const;

function UploadZone({
  onFile,
}: {
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-[32px] border-2 border-dashed px-8 py-12 text-center transition ${
          dragging
            ? 'border-[#2563eb] bg-[#eff4ff]'
            : 'border-[#d5d7da] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] hover:border-[#98a2b3]'
        }`}
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
          <UploadSimple className="h-6 w-6 text-[#2563eb]" />
        </span>
        <h3 className="mt-4 text-[20px] font-semibold tracking-[-0.03em] text-[#181d27]">
          Import an external invoice
        </h3>
        <p className="mx-auto mt-2 max-w-xl text-[14px] leading-6 text-[#667085]">
          Upload invoice attachments, manual exports, drag-and-drop files, or documents from external workflows.
          Hedwig will suggest matches and possible invoice-related actions, but nothing is created without your approval.
        </p>
        <div className="mt-5 inline-flex rounded-full border border-[#d5d7da] bg-white px-4 py-2 text-[13px] font-semibold text-[#344054] shadow-xs">
          Browse files
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </div>

      <div className="rounded-[24px] border border-[#e9eaeb] bg-[#fcfcfd] px-4 py-4 text-[12px] leading-6 text-[#667085]">
        Hedwig will use live extraction and live workspace data from your clients, projects, and invoices to generate these suggestions.
      </div>
    </div>
  );
}

function ProcessingState({
  filename,
  stageIndex,
}: {
  filename?: string;
  stageIndex: number;
}) {
  return (
    <div className="rounded-[32px] border border-[#e9eaeb] bg-white p-8 text-center shadow-sm">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#eff4ff]">
        <Sparkle className="h-7 w-7 animate-pulse text-[#2563eb]" />
      </span>
      <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.03em] text-[#181d27]">Preparing import suggestions</h3>
      <p className="mt-2 text-[14px] leading-6 text-[#667085]">
        Hedwig is processing {filename || 'your document'} and preparing transparent, approval-first suggestions.
      </p>

      <div className="mx-auto mt-8 max-w-xl space-y-3">
        {PROCESSING_STAGES.map((stage, index) => {
          const active = index === stageIndex;
          const done = index < stageIndex;
          return (
            <div
              key={stage.id}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                done
                  ? 'border-[#abefc6] bg-[#f6fef9]'
                  : active
                  ? 'border-[#84caff] bg-[#eff8ff]'
                  : 'border-[#e9eaeb] bg-[#fcfcfd]'
              }`}
            >
              <span className="text-[13px] font-semibold text-[#181d27]">{stage.label}</span>
              <span className="text-[12px] text-[#667085]">{done ? 'Done' : active ? 'In progress' : 'Queued'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultState({
  result,
  onClose,
  invoiceId,
}: {
  result: ImportReviewResult;
  onClose?: () => void;
  invoiceId?: string;
}) {
  return (
    <div className="rounded-[32px] border border-[#e9eaeb] bg-white p-8 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-[24px] bg-[#ecfdf3]">
          <CheckCircle className="h-7 w-7 text-[#12b76a]" />
        </span>
        <div>
          <h3 className="text-[24px] font-semibold tracking-[-0.03em] text-[#181d27]">Import complete</h3>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#667085]">
            Approved actions were executed. Redirecting you to Payments…
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ResultBucket title="Created" items={result.created_entities.map((item) => `${item.entity_type}: ${item.label}`)} tone="green" />
        <ResultBucket title="Linked" items={result.linked_entities.map((item) => `${item.entity_type}: ${item.label}`)} tone="blue" />
        <ResultBucket title="Ignored" items={result.ignored_entities.map((item) => `${item.entity_type}: ${item.label}`)} tone="neutral" />
        <ResultBucket title="Deferred" items={result.deferred_entities.map((item) => `${item.entity_type}: ${item.label}`)} tone="amber" />
      </div>

      <div className="mt-6 flex justify-end gap-2">
        {invoiceId ? (
          <Button asChild variant="outline">
            <a href={invoiceId ? `/payments?invoice=${invoiceId}` : '/payments'}>View in Payments</a>
          </Button>
        ) : null}
        {onClose ? <Button onClick={onClose}>Close review</Button> : null}
      </div>
    </div>
  );
}

function ResultBucket({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'green' | 'blue' | 'neutral' | 'amber';
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-[#f6fef9] border-[#abefc6]'
      : tone === 'blue'
      ? 'bg-[#eff8ff] border-[#b2ddff]'
      : tone === 'amber'
      ? 'bg-[#fffaeb] border-[#fedf89]'
      : 'bg-[#fcfcfd] border-[#e9eaeb]';

  return (
    <div className={`rounded-[24px] border p-4 ${toneClass}`}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#98a2b3]">{title}</p>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-[13px] text-[#181d27]">
          {items.map((item) => (
            <li key={item} className="rounded-2xl bg-white/80 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] text-[#667085]">No items in this state.</p>
      )}
    </div>
  );
}

const baseWrapperClass =
  'w-full rounded-[32px] border border-[#e9eaeb] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_32px_80px_rgba(15,23,42,0.14)]';

export function ImportDocumentReviewFlow({
  mode = 'modal',
  accessToken,
  onClose,
  onImported,
}: {
  mode?: LayoutMode;
  accessToken?: string | null;
  onClose?: () => void;
  onImported?: (document: ExternalDocument) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'upload' | 'processing' | 'review' | 'confirm' | 'result' | 'error'>('upload');
  const [fileMeta, setFileMeta] = useState<{ filename: string; mimeType: string; sizeBytes: number } | null>(null);
  const [fileToProcess, setFileToProcess] = useState<File | null>(null);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [session, setSession] = useState<ImportReviewSession | null>(null);
  const [result, setResult] = useState<ImportReviewResult | null>(null);
  const [completedDocument, setCompletedDocument] = useState<ExternalDocument | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<{ suggestion: SuggestedEntity; decision: 'reject' | 'skip' } | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'processing' || !fileMeta || !fileToProcess) return;

    let active = true;

    const run = async () => {
      try {
        setErrorMessage(null);
        setProcessingIndex(0);

        const form = new FormData();
        form.append('file', fileToProcess);
        const analysisResponse = await fetch('/api/integrations/analyze-document', {
          method: 'POST',
          body: form,
        });
        const analysisPayload = await analysisResponse.json().catch(() => ({ success: false })) as {
          success?: boolean;
          error?: string;
          data?: { parsed?: ParsedAnalysisDocument };
        };

        if (!analysisResponse.ok || !analysisPayload.success || !analysisPayload.data?.parsed) {
          throw new Error(analysisPayload.error || 'Could not extract fields from this document.');
        }

        const detectedType = String(analysisPayload.data.parsed.documentType || '').toLowerCase();
        if (detectedType && detectedType !== 'invoice') {
          throw new Error('Only invoice imports are supported right now. Please upload an invoice file.');
        }

        if (!active) return;
        setProcessingIndex(1);

        const workspace: WorkspaceImportContext = {
          clients: [],
          projects: [],
          invoices: [],
        };

        if (accessToken) {
          const [clients, projects, payments] = await Promise.all([
            hedwigApi.clients({ accessToken, disableMockFallback: true }).catch(() => []),
            hedwigApi.projects({ accessToken, disableMockFallback: true }).catch(() => []),
            hedwigApi.payments({ accessToken, disableMockFallback: true }).catch(() => ({
              invoices: [],
              paymentLinks: [],
              invoiceDrafts: [],
              paymentLinkDrafts: [],
            })),
          ]);

          workspace.clients = clients;
          workspace.projects = projects;
          workspace.invoices = payments.invoices;
        }

        if (!active) return;
        setProcessingIndex(2);

        const nextSession = buildReviewSession({
          upload: fileMeta,
          parsed: analysisPayload.data.parsed,
          workspace,
        });

        if (!active) return;
        setSession(nextSession);
        setStep('review');
      } catch (error: any) {
        if (!active) return;
        setErrorMessage(error?.message || 'Unable to process this document right now.');
        setStep('error');
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [step, fileMeta, fileToProcess, accessToken]);

  const startUpload = (file: File) => {
    setFileMeta({
      filename: file.name,
      mimeType: file.type || 'application/pdf',
      sizeBytes: file.size || 0,
    });
    setFileToProcess(file);
    setResult(null);
    setCompletedDocument(null);
    setSession(null);
    setErrorMessage(null);
    setStep('processing');
  };

  const handleDecision = (
    suggestionId: string,
    decision: ReviewDecisionType,
    options?: { selectedExistingMatchId?: string; editedValue?: string },
  ) => {
    if (!session) return;
    const next = applyDecision(session, suggestionId, decision, options);
    setSession(next);
  };

  const approveAll = () => {
    if (!session) return;
    let nextSession = session;
    for (const suggestion of nextSession.suggestions) {
      if (isSuggestionResolved(suggestion)) continue;
      if (suggestion.existing_match_candidates.length && suggestion.existing_match_candidates[0].similarity_score >= 0.74) {
        nextSession = applyDecision(nextSession, suggestion.id, 'link_existing', {
          selectedExistingMatchId: suggestion.existing_match_candidates[0].id,
        });
      } else {
        nextSession = applyDecision(nextSession, suggestion.id, 'approve_creation', {
          editedValue: suggestion.edited_value || suggestion.suggested_name,
        });
      }
    }
    setSession(nextSession);
  };

  const executeReview = async () => {
    if (!session) return;
    setIsSubmitting(true);
    const nextSession = { ...session, approval_state: { ...buildApprovalState(session), step: 'result' as const } };
    const parsedData = {
      invoiceNumber: nextSession.extracted_invoice_data?.invoice_number,
      issuer: nextSession.extracted_invoice_data?.issuer_name,
      recipient: nextSession.extracted_invoice_data?.recipient_name,
      amount: nextSession.extracted_invoice_data?.amount_total,
      currency: nextSession.extracted_invoice_data?.currency,
      issueDate: nextSession.extracted_invoice_data?.issue_date,
      dueDate: nextSession.extracted_invoice_data?.due_date,
      lineItems: nextSession.extracted_invoice_data?.line_items,
      confidence: Math.max(...nextSession.suggestions.map((suggestion) => suggestion.confidence_score), 0.5),
      extractedAt: new Date().toISOString(),
    };

    try {
      let resolvedDocument: ExternalDocument | null = null;
      const importResponse = await fetch('/api/integrations/import-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: 'invoice',
          extractedInvoiceData: nextSession.extracted_invoice_data,
          decisions: nextSession.decisions,
        }),
      });
      const importPayload = await importResponse.json().catch(() => ({ success: false })) as {
        success?: boolean;
        error?: string;
        data?: {
          document?: { id?: string; created_at?: string };
          execution?: ImportReviewResult;
        };
      };

      if (!importResponse.ok || !importPayload.success) {
        throw new Error(importPayload.error || 'Unable to execute approved invoice actions.');
      }

      resolvedDocument = {
        id: String(importPayload.data?.document?.id || nextSession.document.id),
        userId: 'user_self',
        filename: nextSession.document.filename,
        contentType: nextSession.document.mime_type,
        sizeBytes: nextSession.document.size_bytes,
        documentType: 'invoice',
        source: 'manual_upload',
        status: 'imported',
        parsedData,
        createdAt: String(importPayload.data?.document?.created_at || new Date().toISOString()),
        reviewedAt: new Date().toISOString(),
      };

      const executionResult = importPayload.data?.execution || executeDecisionSummary(nextSession);
      const invoiceId = importPayload.data?.document?.id as string | undefined;
      setResult(executionResult);
      setCreatedInvoiceId(invoiceId);
      setSession(nextSession);
      setCompletedDocument(resolvedDocument);
      setConfirmationOpen(false);
      setStep('result');

      if (mode === 'page') {
        setTimeout(() => {
          router.push(invoiceId ? `/payments?invoice=${invoiceId}` : '/payments');
        }, 3000);
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to execute approved actions.');
      setStep('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeAndEmit = () => {
    if (completedDocument) {
      onImported?.(completedDocument);
      setCompletedDocument(null);
    }
    onClose?.();
  };

  const wrapperClass =
    mode === 'modal'
      ? `max-h-[92vh] w-full max-w-7xl overflow-hidden ${baseWrapperClass}`
      : `mx-auto max-w-7xl ${baseWrapperClass}`;

  const body = (
    <div className={wrapperClass}>
      <div className="border-b border-[#f2f4f7] px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#98a2b3]">Import review</p>
            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#181d27]">
              AI suggestions with explicit approval
            </h2>
            <p className="mt-2 max-w-3xl text-[14px] leading-6 text-[#667085]">
              Hedwig can extract invoice entities, suggest existing matches, and prepare create or link actions for imported invoices.
              It will never create a client, project, or invoice record without explicit user approval.
            </p>
          </div>
          {onClose ? (
            <button type="button" onClick={step === 'result' ? closeAndEmit : onClose} className="rounded-full p-2 text-[#98a2b3] hover:bg-[#f2f4f7]">
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="max-h-[calc(92vh-92px)] overflow-y-auto px-6 py-6">
        {step === 'upload' ? (
          <UploadZone onFile={startUpload} />
        ) : null}

        {step === 'processing' ? (
          <ProcessingState filename={fileMeta?.filename} stageIndex={processingIndex} />
        ) : null}

        {step === 'review' && session ? (
          <div className="space-y-6">
            <DocumentImportSummary
              document={session.document}
              extractedInvoice={session.extracted_invoice_data}
            />

            {session.warnings.length ? (
              <div className="rounded-[28px] border border-[#fedf89] bg-[#fffaeb] p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white">
                    <WarningCircle className="h-5 w-5 text-[#f79009]" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-[#7a2e0e]">Warnings and conflict states</p>
                    <ul className="mt-2 space-y-2 text-[13px] leading-6 text-[#9a3412]">
                      {session.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-[28px] border border-[#d5d7da] bg-[#fcfcfd] p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white ring-1 ring-[#e9eaeb]">
                  <Sparkle className="h-5 w-5 text-[#2563eb]" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-[#181d27]">Permission-first review</p>
                  <p className="mt-1 text-[13px] leading-6 text-[#667085]">
                    Each suggestion shows what was detected, why it was suggested, confidence level, and available existing alternatives.
                    You can approve creation, replace with an existing record, edit the suggestion, reject it, or skip it for later.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              {session.suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onDecision={(decision, options) => handleDecision(suggestion.id, decision, options)}
                  onRequestReject={() => setDecisionTarget({ suggestion, decision: 'reject' })}
                  onRequestSkip={() => setDecisionTarget({ suggestion, decision: 'skip' })}
                />
              ))}
            </div>

            <ApprovalActionBar
              total={session.suggestions.length}
              resolved={session.suggestions.filter(isSuggestionResolved).length}
              approved={session.suggestions.filter((suggestion) => suggestion.approved).length}
              deferred={session.suggestions.filter((suggestion) => suggestion.user_decision === 'defer' || suggestion.user_decision === 'skip').length}
              rejected={session.suggestions.filter((suggestion) => suggestion.user_decision === 'reject').length}
              onApproveAll={approveAll}
              onContinue={() => {
                setSession((current) => (current ? { ...current, approval_state: buildApprovalState(current) } : current));
                setConfirmationOpen(true);
              }}
              continueDisabled={!buildApprovalState(session).confirm_enabled}
            />
          </div>
        ) : null}

        {step === 'result' && result ? <ResultState result={result} onClose={closeAndEmit} invoiceId={createdInvoiceId} /> : null}

        {step === 'error' ? (
          <div className="rounded-[32px] border border-[#fecdca] bg-[#fef3f2] p-8">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-[24px] bg-white">
                <WarningCircle className="h-7 w-7 text-[#f04438]" />
              </span>
              <div>
                <h3 className="text-[22px] font-semibold tracking-[-0.03em] text-[#181d27]">Import review failed</h3>
                <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#7a271a]">
                  {errorMessage || 'Something went wrong while preparing live suggestions.'}
                </p>
                <div className="mt-5 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep('upload');
                      setSession(null);
                      setResult(null);
                      setCompletedDocument(null);
                      setFileMeta(null);
                      setFileToProcess(null);
                      setErrorMessage(null);
                    }}
                  >
                    Try another file
                  </Button>
                  {onClose ? <Button onClick={onClose}>Close</Button> : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {session ? (
        <ConfirmationSheet
          open={confirmationOpen}
          actions={buildConfirmationActions(session)}
          onBack={() => setConfirmationOpen(false)}
          onConfirm={executeReview}
          isSubmitting={isSubmitting}
        />
      ) : null}

      <ReviewDecisionModal
        open={Boolean(decisionTarget)}
        title={
          decisionTarget?.decision === 'reject'
            ? `Reject ${decisionTarget?.suggestion.entity_type} suggestion?`
            : `Skip ${decisionTarget?.suggestion.entity_type} for later?`
        }
        description={
          decisionTarget?.decision === 'reject'
            ? 'Rejected suggestions will be ignored and no action will be executed for them.'
            : 'Skipped suggestions stay unresolved so you can revisit them later without losing extracted data.'
        }
        confirmLabel={decisionTarget?.decision === 'reject' ? 'Reject suggestion' : 'Skip for later'}
        onClose={() => setDecisionTarget(null)}
        onConfirm={() => {
          if (decisionTarget && session) {
            const decision = decisionTarget.decision === 'reject' ? 'reject' : 'defer';
            setSession(applyDecision(session, decisionTarget.suggestion.id, decision));
          }
          setDecisionTarget(null);
        }}
      />
    </div>
  );

  if (mode === 'page') return body;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      {body}
    </div>
  );
}
