import Image from 'next/image';
import { notFound } from 'next/navigation';
import { PublicDocumentFrame } from '@/components/public/public-document-frame';
import { PublicPaymentLinkPanel } from '@/components/public/public-payment-link-panel';
import { PublicResultCard } from '@/components/public/public-result-card';
import { fetchPublicDocument } from '@/lib/api/public-documents';
import { getExplorerUrl, getSolanaExplorerUrl, resolvePublicSettlementChain, type PublicPaymentToken } from '@/lib/payments/public-constants';

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amount || 0);
}

export default async function PublicPaymentLinkPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const document = await fetchPublicDocument(id);

  if (!document || String(document.type).toUpperCase() !== 'PAYMENT_LINK') {
    notFound();
  }

  const merchantName = [document.user?.first_name, document.user?.last_name].filter(Boolean).join(' ') || document.user?.email || 'Merchant';
  const evmWalletAddress = document.user?.ethereum_wallet_address || null;
  const solanaWalletAddress = document.user?.solana_wallet_address || null;
  const paymentToken: PublicPaymentToken = String(document.currency || 'USDC').toUpperCase() === 'ETH' ? 'ETH' : 'USDC';
  const paymentCurrency = String(document.currency || 'USDC').toUpperCase();
  const settlementChain = resolvePublicSettlementChain(document.chain, document.content?.blockradar_url);
  const chainIcon = settlementChain === 'solana' ? '/icons/networks/solana.png' : '/icons/networks/base.png';
  const chainLabel = settlementChain === 'solana' ? 'Solana' : 'Base';
  const tokenIcon = paymentToken === 'ETH' ? '/icons/tokens/eth.png' : '/icons/tokens/usdc.png';
  const usdAccount = document.user?.usd_account;
  const hasUsdBankDetails = Boolean(usdAccount?.account_number && usdAccount?.routing_number);
  const isPaid = String(document.status).toLowerCase() === 'paid';
  const txHash = String((document.content as any)?.tx_hash || '');
  const explorerUrl = txHash
    ? settlementChain === 'solana'
      ? getSolanaExplorerUrl('mainnet', txHash)
      : getExplorerUrl('base', txHash)
    : null;

  if (isPaid) {
    return (
      <PublicDocumentFrame title="Payment received">
        <PublicResultCard
          kind="success"
          title="Payment successful"
          message={`Your payment has already been sent to ${merchantName}.`}
          amountLabel={`${formatCurrency(Number(document.amount || 0))} · ${paymentCurrency}`}
          txHash={txHash || null}
          explorerUrl={explorerUrl}
        />
      </PublicDocumentFrame>
    );
  }

  return (
    <PublicDocumentFrame title="Payment link">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">

        {/* ── Left: payment detail card ── */}
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">

          {/* Header */}
          <div className="border-b border-[#e9eaeb] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Payment link</p>
                <h1 className="mt-1 truncate text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{document.title}</h1>
                <p className="mt-1 text-[12px] text-[#a4a7ae]">from {merchantName}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#eff4ff] px-2.5 py-1 text-[11px] font-semibold text-[#1d4ed8]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2563eb]" />
                Active
              </span>
            </div>
          </div>

          {/* Amount hero */}
          <div className="border-b border-[#e9eaeb] bg-[#f8f9fc] px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Amount</p>
            <p className="mt-1.5 text-[34px] font-bold tracking-[-0.04em] leading-none text-[#181d27]">
              {formatCurrency(Number(document.amount || 0))}
            </p>
          </div>

          {/* Token + chain pills */}
          <div className="flex items-center gap-2 px-6 py-4">
            <div className="flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-[#fafafa] px-3 py-1.5 text-[12px] font-medium text-[#414651]">
              <Image src={tokenIcon} alt={paymentToken} width={14} height={14} className="rounded-full" />
              {paymentCurrency}
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-[#fafafa] px-3 py-1.5 text-[12px] font-medium text-[#414651]">
              <Image src={chainIcon} alt={chainLabel} width={14} height={14} className="rounded-full" />
              {chainLabel}
            </div>
          </div>

          {/* Instructions */}
          <div className="px-6 pb-6">
            <div className="rounded-2xl border border-[#e9eaeb] bg-[#fafafa] px-4 py-4">
              <p className="mb-2 text-[12px] font-semibold text-[#414651]">How to pay</p>
              <ol className="space-y-1.5 text-[12px] leading-relaxed text-[#717680]">
                <li>1. Select your preferred network in the checkout panel.</li>
                <li>2. Connect a wallet that holds {paymentCurrency} on {chainLabel}.</li>
                <li>3. Confirm the amount and approve the transaction.</li>
                <li>4. Wait for the confirmation screen before closing this page.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* ── Right: checkout + bank transfer ── */}
        <div className="space-y-4">
          <PublicPaymentLinkPanel
            documentId={document.id}
            title={document.title}
            amount={Number(document.amount || 0)}
            currencyLabel={paymentCurrency}
            preferredChain={settlementChain}
            token={paymentToken}
            evmMerchantAddress={evmWalletAddress}
            solanaMerchantAddress={solanaWalletAddress}
          />

          {hasUsdBankDetails ? (
            <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
              <div className="border-b border-[#e9eaeb] px-5 py-4">
                <p className="text-[13px] font-semibold text-[#181d27]">Or pay via bank transfer</p>
                <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Wire / ACH directly to the merchant's USD account</p>
              </div>
              <div className="divide-y divide-[#f2f4f7] px-5">
                <BankDetailRow label="Bank" value={usdAccount?.bank_name || 'Bridge USD account'} />
                <BankDetailRow label="Account #" value={usdAccount?.account_number ?? ''} mono />
                <BankDetailRow label="Routing #" value={usdAccount?.routing_number ?? ''} mono />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </PublicDocumentFrame>
  );
}

function BankDetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-[12px] text-[#717680]">{label}</span>
      <span className={`text-[13px] font-semibold text-[#181d27] ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</span>
    </div>
  );
}
