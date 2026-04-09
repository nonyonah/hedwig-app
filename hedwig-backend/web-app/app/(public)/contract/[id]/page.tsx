import { CalendarBlank, CheckCircle, Signature, User } from '@/components/ui/lucide-icons';
import { notFound } from 'next/navigation';
import { PublicDocumentFrame } from '@/components/public/public-document-frame';
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
  draft:     { bg: 'bg-[#f2f4f7]', dot: 'bg-[#a4a7ae]', text: 'text-[#535862]', label: 'Draft' },
  review:    { bg: 'bg-[#fffaeb]', dot: 'bg-[#f59e0b]', text: 'text-[#717680]', label: 'In review' },
  sent:      { bg: 'bg-[#eff4ff]', dot: 'bg-[#2563eb]', text: 'text-[#717680]', label: 'Sent' },
  approved:  { bg: 'bg-[#ecfdf3]', dot: 'bg-[#12b76a]', text: 'text-[#717680]', label: 'Approved' },
  signed:    { bg: 'bg-[#ecfdf3]', dot: 'bg-[#12b76a]', text: 'text-[#717680]', label: 'Signed' },
  completed: { bg: 'bg-[#ecfdf3]', dot: 'bg-[#12b76a]', text: 'text-[#717680]', label: 'Completed' },
};

export default async function PublicContractPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ approved?: string; token?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
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
      <div className="mx-auto max-w-3xl space-y-4">

        {/* Success banner */}
        {query.approved === 'true' ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[#abefc6] bg-[#ecfdf3] px-5 py-4">
            <CheckCircle className="h-5 w-5 shrink-0 text-[#717680]" weight="fill" />
            <p className="text-[14px] font-semibold text-[#717680]">Contract approved successfully.</p>
          </div>
        ) : null}

        {/* Contract document */}
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">

          {/* Header */}
          <div className="border-b border-[#e9eaeb] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Contract</p>
                <h1 className="mt-1 truncate text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{document.title}</h1>
                <p className="mt-1 font-mono text-[11px] text-[#a4a7ae]"># {document.id}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                {statusStyle.label}
              </span>
            </div>
          </div>

          {/* Meta row */}
          <div className="grid grid-cols-3 gap-px bg-[#e9eaeb]">
            <div className="bg-[#fafafa] px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1">
                <User className="h-3 w-3 text-[#a4a7ae]" weight="bold" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Freelancer</p>
              </div>
              <p className="text-[13px] font-semibold text-[#181d27]">{issuerName}</p>
            </div>
            <div className="bg-[#fafafa] px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1">
                <User className="h-3 w-3 text-[#a4a7ae]" weight="bold" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Client</p>
              </div>
              <p className="text-[13px] font-semibold text-[#181d27]">{clientName}</p>
            </div>
            <div className="bg-[#fafafa] px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarBlank className="h-3 w-3 text-[#a4a7ae]" weight="bold" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Created</p>
              </div>
              <p className="text-[13px] font-semibold text-[#181d27]">{formatDate(document.created_at)}</p>
            </div>
          </div>

          {/* Contract body */}
          <div className="px-6 py-6">
            <div className="rounded-2xl border border-[#e9eaeb] bg-[#fafafa] px-5 py-5">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-[13px] leading-relaxed text-[#414651]">
                {generatedContent}
              </div>
            </div>
          </div>

          {/* Approval section */}
          {canApprove ? (
            <div className="border-t border-[#e9eaeb] px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eff4ff]">
                  <Signature className="h-5 w-5 text-[#717680]" weight="bold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#181d27]">Your signature is required</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#717680]">
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
            <div className="border-t border-[#e9eaeb] px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#ecfdf3]">
                  <CheckCircle className="h-5 w-5 text-[#717680]" weight="fill" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#717680]">Contract approved</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#717680]/80 text-[#717680]">
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
