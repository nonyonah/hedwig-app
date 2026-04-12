import { notFound } from 'next/navigation';
import { CalendarBlank, Repeat, User } from '@/components/ui/lucide-icons';
import { PublicDocumentFrame } from '@/components/public/public-document-frame';
import { PublicResultCard } from '@/components/public/public-result-card';
import { PublicInvoiceRightPanel } from '@/components/public/public-invoice-right-panel';
import { DocumentViewTracker } from '@/components/public/document-view-tracker';
import { fetchPublicDocument } from '@/lib/api/public-documents';
import { getSolanaExplorerUrl, getExplorerUrl, resolvePublicSettlementChain } from '@/lib/payments/public-constants';

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amount || 0);
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

const STATUS_STYLE: Record<string, { bg: string; dot: string; text: string; label: string }> = {
  draft:   { bg: 'bg-[#f2f4f7]', dot: 'bg-[#a4a7ae]', text: 'text-[#535862]', label: 'Draft' },
  sent:    { bg: 'bg-[#eff4ff]', dot: 'bg-[#2563eb]', text: 'text-[#717680]', label: 'Sent' },
  viewed:  { bg: 'bg-[#eff4ff]', dot: 'bg-[#2563eb]', text: 'text-[#717680]', label: 'Viewed' },
  paid:    { bg: 'bg-[#ecfdf3]', dot: 'bg-[#12b76a]', text: 'text-[#717680]', label: 'Paid' },
  overdue: { bg: 'bg-[#fef3f2]', dot: 'bg-[#f04438]', text: 'text-[#717680]', label: 'Overdue' }
};

export default async function PublicInvoicePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const document = await fetchPublicDocument(id);

  if (!document || String(document.type).toUpperCase() !== 'INVOICE') {
    notFound();
  }

  const invoiceItems = document.content?.items || [];
  const issuerName = [document.user?.first_name, document.user?.last_name].filter(Boolean).join(' ') || document.user?.email || 'Hedwig user';
  const clientName = document.content?.client_name || document.content?.recipient_email || 'Client';
  const dueDate = document.content?.due_date || null;
  const evmWalletAddress = document.user?.ethereum_wallet_address || null;
  const solanaWalletAddress = document.user?.solana_wallet_address || null;
  const settlementChain = resolvePublicSettlementChain(document.chain, document.content?.blockradar_url);
  const isPaid = String(document.status).toLowerCase() === 'paid';
  const txHash = String((document.content as any)?.tx_hash || '');
  const explorerUrl = txHash
    ? settlementChain === 'solana'
      ? getSolanaExplorerUrl('mainnet', txHash)
      : getExplorerUrl('base', txHash)
    : null;

  const statusKey = String(document.status || 'draft').toLowerCase();
  const statusStyle = STATUS_STYLE[statusKey] ?? STATUS_STYLE.draft;

  const isRecurring = !!(document.content as any)?.recurring_invoice_id;

  const subtotal = invoiceItems.length > 0
    ? invoiceItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0) * Number(item.quantity || 1), 0)
    : Number(document.amount || 0);

  if (isPaid) {
    return (
      <PublicDocumentFrame title="Invoice paid">
        <PublicResultCard
          kind="success"
          title="Payment received"
          message={`Your payment of ${formatCurrency(Number(document.amount || 0))} has been received for this invoice.`}
          amountLabel={formatCurrency(Number(document.amount || 0))}
          txHash={txHash || null}
          explorerUrl={explorerUrl}
        />
      </PublicDocumentFrame>
    );
  }

  return (
    <PublicDocumentFrame title="Invoice">
      <DocumentViewTracker documentId={document.id} />
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">

        {/* ── Left: invoice document ── */}
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">

          {/* Header */}
          <div className="border-b border-[#e9eaeb] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Invoice</p>
                  {isRecurring && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fdf4ff] px-2 py-0.5 text-[10px] font-semibold text-[#717680]">
                      <Repeat className="h-2.5 w-2.5" /> Recurring
                    </span>
                  )}
                </div>
                <h1 className="truncate text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{document.title}</h1>
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
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">From</p>
              </div>
              <p className="text-[13px] font-semibold text-[#181d27]">{issuerName}</p>
            </div>
            <div className="bg-[#fafafa] px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1">
                <User className="h-3 w-3 text-[#a4a7ae]" weight="bold" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">To</p>
              </div>
              <p className="text-[13px] font-semibold text-[#181d27]">{clientName}</p>
            </div>
            <div className="bg-[#fafafa] px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarBlank className="h-3 w-3 text-[#a4a7ae]" weight="bold" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Due</p>
              </div>
              <p className="text-[13px] font-semibold text-[#181d27]">{formatDate(dueDate)}</p>
            </div>
          </div>

          {/* Line items table */}
          <div className="px-6 py-5">
            <div className="overflow-hidden rounded-2xl border border-[#e9eaeb]">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_60px_100px] gap-3 border-b border-[#f2f4f7] bg-[#fafafa] px-4 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Description</span>
                <span className="text-center text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Qty</span>
                <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Amount</span>
              </div>
              <div className="divide-y divide-[#f9fafb]">
                {invoiceItems.length > 0 ? (
                  invoiceItems.map((item: any, index: number) => (
                    <div key={`${item.description || 'item'}-${index}`} className="grid grid-cols-[1fr_60px_100px] gap-3 px-4 py-3.5">
                      <p className="text-[13px] text-[#414651]">{item.description || `Line item ${index + 1}`}</p>
                      <p className="text-center text-[13px] text-[#717680]">{item.quantity || 1}</p>
                      <p className="text-right text-[13px] font-semibold text-[#181d27]">{formatCurrency(Number(item.amount || 0))}</p>
                    </div>
                  ))
                ) : (
                  <div className="grid grid-cols-[1fr_60px_100px] gap-3 px-4 py-3.5">
                    <p className="text-[13px] text-[#414651]">{document.description || document.title}</p>
                    <p className="text-center text-[13px] text-[#717680]">1</p>
                    <p className="text-right text-[13px] font-semibold text-[#181d27]">{formatCurrency(subtotal)}</p>
                  </div>
                )}
              </div>
              {/* Total row */}
              <div className="flex items-center justify-between border-t border-[#e9eaeb] bg-[#fafafa] px-4 py-3.5">
                <span className="text-[13px] font-semibold text-[#535862]">Total</span>
                <span className="text-[16px] font-bold tracking-[-0.02em] text-[#181d27]">{formatCurrency(Number(document.amount || subtotal))}</span>
              </div>
            </div>

            {document.content?.notes ? (
              <div className="mt-4 rounded-2xl border border-[#e9eaeb] bg-[#fafafa] px-4 py-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Notes</p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#535862]">{document.content.notes}</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* ── Right: payment panel ── */}
        <PublicInvoiceRightPanel
          documentId={document.id}
          amount={Number(document.amount || 0)}
          title={document.title}
          preferredChain={settlementChain}
          token="USDC"
          evmMerchantAddress={evmWalletAddress}
          solanaMerchantAddress={solanaWalletAddress}
          isRecurring={isRecurring}
          usdAccount={document.user?.usd_account ?? null}
        />
      </div>
    </PublicDocumentFrame>
  );
}
