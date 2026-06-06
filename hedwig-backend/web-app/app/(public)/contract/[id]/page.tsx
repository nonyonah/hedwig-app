import { CalendarBlank, CheckCircle, Signature, User } from '@/components/ui/lucide-icons';
import { notFound } from 'next/navigation';
import { PublicDocumentFrame } from '@/components/public/public-document-frame';
import { PrintTrigger } from '@/components/public/print-trigger';
import { fetchPublicDocument } from '@/lib/api/public-documents';
import { ApproveContractButton } from './approve-button';

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

const STATUS_STYLE: Record<string, { bg: string; dot: string; text: string; label: string }> = {
  draft:     { bg: 'bg-[var(--color-surface-tertiary)]', dot: 'bg-[var(--color-text-muted)]', text: 'text-[var(--color-text-secondary)]', label: 'Draft' },
  review:    { bg: 'bg-[var(--color-warning-soft)]', dot: 'bg-[var(--color-warning)]', text: 'text-[var(--color-text-tertiary)]', label: 'In review' },
  sent:      { bg: 'bg-[var(--color-accent-soft)]', dot: 'bg-[var(--color-primary)]', text: 'text-[var(--color-text-tertiary)]', label: 'Sent' },
  approved:  { bg: 'bg-[var(--color-success-soft)]', dot: 'bg-[var(--color-success)]', text: 'text-[var(--color-text-tertiary)]', label: 'Approved' },
  signed:    { bg: 'bg-[var(--color-success-soft)]', dot: 'bg-[var(--color-success)]', text: 'text-[var(--color-text-tertiary)]', label: 'Signed' },
  completed: { bg: 'bg-[var(--color-success-soft)]', dot: 'bg-[var(--color-success)]', text: 'text-[var(--color-text-tertiary)]', label: 'Completed' },
};

export default async function PublicContractPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ approved?: string; token?: string; print?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const shouldPrint = query.print === '1';
  const document = await fetchPublicDocument(id);

  if (!document || String(document.type).toUpperCase() !== 'CONTRACT') {
    notFound();
  }

  const issuerName = [document.user?.first_name, document.user?.last_name].filter(Boolean).join(' ') || document.user?.email || 'Hedwig user';
  const clientName = document.content?.client_name || document.content?.client_email || 'Client';
  const generatedContent = document.content?.generated_content || document.description || '';
  const isApproved = ['approved', 'signed', 'paid', 'completed'].includes(String(document.status).toLowerCase());
  const canApprove = !isApproved && Boolean(query.token || document.content?.approval_token);

  const statusKey = String(document.status || 'draft').toLowerCase();
  const statusStyle = STATUS_STYLE[statusKey] ?? STATUS_STYLE.draft;

  return (
    <PublicDocumentFrame title="Contract">
      <PrintTrigger enabled={shouldPrint} />
      <div className="mx-auto max-w-3xl space-y-4">

        {/* Success banner */}
        {query.approved === 'true' ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] px-5 py-4">
            <CheckCircle className="h-5 w-5 shrink-0 text-[var(--color-text-tertiary)]" weight="fill" />
            <p className="text-[14px] font-semibold text-[var(--color-text-tertiary)]">Contract approved successfully.</p>
          </div>
        ) : null}

        {/* Contract document */}
        <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">

          {/* Header */}
          <div className="border-b border-[var(--color-border)] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Contract</p>
                <h1 className="mt-1 truncate text-[22px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{document.title}</h1>
                <p className="mt-1 font-mono text-[11px] text-[var(--color-text-muted)]"># {document.id}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                {statusStyle.label}
              </span>
            </div>
          </div>

          {/* Meta row */}
          <div className="grid grid-cols-3 gap-px bg-[var(--color-border)]">
            <div className="bg-[var(--color-background)] px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1">
                <User className="h-3 w-3 text-[var(--color-text-muted)]" weight="bold" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Freelancer</p>
              </div>
              <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{issuerName}</p>
            </div>
            <div className="bg-[var(--color-background)] px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1">
                <User className="h-3 w-3 text-[var(--color-text-muted)]" weight="bold" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Client</p>
              </div>
              <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{clientName}</p>
            </div>
            <div className="bg-[var(--color-background)] px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarBlank className="h-3 w-3 text-[var(--color-text-muted)]" weight="bold" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Created</p>
              </div>
              <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{formatDate(document.created_at)}</p>
            </div>
          </div>

          {/* Contract body */}
          <div className="px-6 py-6">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-5">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                {generatedContent}
              </div>
            </div>
          </div>

          {/* Approval section */}
          {canApprove ? (
            <div className="border-t border-[var(--color-border)] px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)]">
                  <Signature className="h-5 w-5 text-[var(--color-text-tertiary)]" weight="bold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[var(--color-foreground)]">Your signature is required</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-text-tertiary)]">
                    By approving this contract, you confirm your acceptance of all terms stated above. This action is legally binding.
                  </p>
                  <div className="mt-4">
                    <ApproveContractButton contractId={document.id} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isApproved ? (
            <div className="border-t border-[var(--color-border)] px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-success-soft)]">
                  <CheckCircle className="h-5 w-5 text-[var(--color-text-tertiary)]" weight="fill" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[var(--color-text-tertiary)]">Contract approved</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-text-tertiary)]/80 text-[var(--color-text-tertiary)]">
                    This contract has already been approved. No further action is needed.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </PublicDocumentFrame>
  );
}
