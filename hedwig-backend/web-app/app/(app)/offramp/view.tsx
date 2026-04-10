'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ArrowsDownUp, Bank, CaretRight, Check, CheckCircle, ClockCountdown, Copy, SpinnerGap, Warning, X } from '@/components/ui/lucide-icons';
import { ClientPortal } from '@/components/ui/client-portal';
import type { OfframpTransaction } from '@/lib/models/entities';
import { formatCurrency, formatShortDate } from '@/lib/utils';


export function OfframpClient({
  initialTransactions,
  isRegionLocked = false,
  regionLockReason = null,
  countryCode = null,
}: {
  initialTransactions: OfframpTransaction[];
  accessToken: string | null;
  isRegionLocked?: boolean;
  regionLockReason?: string | null;
  countryCode?: string | null;
}) {
  const [transactions] = useState(initialTransactions);
  const [selectedTx, setSelectedTx] = useState<OfframpTransaction | null>(null);

  const pendingCount = transactions.filter((tx) => tx.status !== 'completed' && tx.status !== 'failed').length;
  const completedCount = transactions.filter((tx) => tx.status === 'completed').length;
  const totalVolumeUsd = transactions.reduce((sum, tx) => {
    const asset = String(tx.asset || '').toUpperCase();
    if (asset === 'USDC' || asset === 'USDT') {
      return sum + tx.amount;
    }
    if (String(tx.fiatCurrency || '').toUpperCase() === 'USD') {
      return sum + tx.fiatAmount;
    }
    return sum;
  }, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[15px] font-semibold text-[#181d27]">Offramp</h1>
        <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Convert your crypto balances to local currency.</p>
      </div>
      {isRegionLocked ? (
        <div className="rounded-2xl border border-[#e9eaeb] bg-white px-5 py-5 shadow-xs">
          <p className="text-[14px] font-semibold text-[#181d27]">Offramp is unavailable in your region</p>
          <p className="mt-1 text-[13px] leading-6 text-[#717680]">
            {regionLockReason || 'This feature is not currently available where you are located.'}
            {countryCode ? ` (Detected region: ${countryCode})` : ''}
          </p>
        </div>
      ) : null}
      {!isRegionLocked ? (
        /* Transactions table */
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        <div className="flex items-center gap-2.5 border-b border-[#f2f4f7] px-5 py-3">
          <span className="text-[12px] font-medium text-[#717680]">{transactions.length} transactions</span>
          {(pendingCount > 0 || completedCount > 0) && (
            <>
              <span className="h-3 w-px bg-[#f2f4f7]" />
              <span className="text-[12px] text-[#a4a7ae]">
                {formatCurrency(totalVolumeUsd, 'USD')} total
                {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
              </span>
            </>
          )}
        </div>
        <div className="grid grid-cols-[90px_1fr_110px_120px_90px_20px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">Asset</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">Destination</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">Status</span>
          <span className="text-right text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">Fiat value</span>
          <span className="text-right text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">Date</span>
          <span />
        </div>
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <ArrowsDownUp className="h-8 w-8 text-[#d0d5dd]" weight="duotone" />
            <p className="text-[13px] text-[#a4a7ae]">No offramp transactions yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f9fafb]">
            {transactions.map((tx) => {
              const statusMap = {
                pending:    { dot: 'bg-[#2563eb]', label: 'Pending',    bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
                processing: { dot: 'bg-[#f59e0b]', label: 'Processing', bg: 'bg-[#fffaeb]', text: 'text-[#92400e]' },
                completed:  { dot: 'bg-[#12b76a]', label: 'Completed',  bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
                failed:     { dot: 'bg-[#f04438]', label: 'Failed',     bg: 'bg-[#fff1f0]', text: 'text-[#b42318]' },
              } as const;
              const s = statusMap[tx.status as keyof typeof statusMap] ?? statusMap.pending;
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => setSelectedTx(tx)}
                  className="group grid w-full grid-cols-[90px_1fr_110px_120px_90px_20px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#fafafa]"
                >
                  <p className="text-[13px] font-semibold tabular-nums text-[#181d27]">{tx.amount} <span className="text-[#717680]">{tx.asset}</span></p>
                  <p className="truncate text-[13px] text-[#717680]">{tx.destinationLabel}</p>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                  <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">{formatCurrency(tx.fiatAmount, tx.fiatCurrency)}</p>
                  <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(tx.createdAt)}</p>
                  <CaretRight className="h-4 w-4 shrink-0 text-[#d0d5dd] transition group-hover:text-[#a4a7ae]" weight="bold" />
                </button>
              );
            })}
          </div>
        )}
      </div>
      ) : null}

      {/* ══ Offramp detail panel ════════════════════════════════ */}
      {!isRegionLocked && selectedTx ? <OfframpDetailPanel tx={selectedTx} onClose={() => setSelectedTx(null)} /> : null}
    </div>
  );
}

/* ══ Offramp detail panel ══════════════════════════════════════════════════ */

const OFFRAMP_STATUS = {
  pending:    { label: 'Pending',    bg: 'bg-[#eff4ff]', text: 'text-[#717680]', dot: 'bg-[#2563eb]',  Icon: ClockCountdown  },
  processing: { label: 'Processing', bg: 'bg-[#fffaeb]', text: 'text-[#717680]', dot: 'bg-[#f59e0b]',  Icon: SpinnerGap      },
  completed:  { label: 'Completed',  bg: 'bg-[#ecfdf3]', text: 'text-[#717680]', dot: 'bg-[#12b76a]',  Icon: CheckCircle     },
  failed:     { label: 'Failed',     bg: 'bg-[#fff1f0]', text: 'text-[#717680]', dot: 'bg-[#f04438]',  Icon: Warning         },
} as const;

function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}
      className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#e9eaeb] text-[#a4a7ae] transition hover:text-[#717680]"
    >
      {copied ? <Check className="h-2.5 w-2.5 text-[#717680]" weight="bold" /> : <Copy className="h-2.5 w-2.5" weight="bold" />}
    </button>
  );
}

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 text-[13px]">
      <span className="text-[#717680]">{label}</span>
      <span className="flex items-center font-semibold text-[#181d27]">{children}</span>
    </div>
  );
}

function OfframpDetailPanel({ tx, onClose }: { tx: OfframpTransaction; onClose: () => void }) {
  const s = OFFRAMP_STATUS[tx.status] ?? OFFRAMP_STATUS.pending;
  const { Icon } = s;
  const rate = tx.amount > 0 ? (tx.fiatAmount / tx.amount).toFixed(2) : null;
  const orderId = tx.paycrestOrderId || tx.id;
  const shortOrderId = orderId.length > 14 ? `${orderId.slice(0, 8)}…${orderId.slice(-6)}` : orderId;

  const date = new Date(tx.createdAt);
  const fullDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const fullTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-[440px] flex-col bg-white shadow-2xl animate-in slide-in-from-right-full duration-300 ease-out">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e9eaeb] px-5 py-4">
          <div>
            <p className="text-[15px] font-bold text-[#181d27]">Offramp details</p>
            <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Transaction breakdown</p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e9eaeb] text-[#717680] transition hover:bg-[#f5f5f5]">
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Hero: amount + status */}
          <div className="border-b border-[#f2f4f7] bg-[#fafafa] px-5 py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white ring-1 ring-[#e9eaeb]">
              <Image src="/icons/tokens/usdc.png" alt={tx.asset} width={32} height={32} className="rounded-full" />
            </div>
            <p className="text-[30px] font-bold tracking-[-0.04em] text-[#181d27]">
              {tx.amount} <span className="text-[#717680]">{tx.asset}</span>
            </p>
            <p className="mt-1 text-[15px] font-semibold text-[#414651]">
              ≈ {formatCurrency(tx.fiatAmount, tx.fiatCurrency)}
            </p>
            <div className="mt-3 flex justify-center">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${s.bg} ${s.text}`}>
                <span className={`h-2 w-2 rounded-full ${s.dot} ${tx.status === 'processing' ? 'animate-pulse' : ''}`} />
                {s.label}
              </span>
            </div>
          </div>

          {/* Details rows */}
          <div className="divide-y divide-[#f9fafb] px-5">
            <PanelRow label="Destination">
              <Bank className="mr-1.5 h-3.5 w-3.5 text-[#a4a7ae]" weight="bold" />
              {tx.destinationLabel}
            </PanelRow>
            <PanelRow label="Fiat currency">{tx.fiatCurrency}</PanelRow>
            {rate && <PanelRow label="Exchange rate">1 {tx.asset} ≈ {parseFloat(rate).toLocaleString()} {tx.fiatCurrency}</PanelRow>}
            <PanelRow label="Date">{fullDate}</PanelRow>
            <PanelRow label="Time">{fullTime}</PanelRow>
            <div className="flex items-center justify-between py-3 text-[13px]">
              <span className="text-[#717680]">Order ID</span>
              <span className="flex items-center font-mono text-[12px] font-semibold text-[#181d27]">
                {shortOrderId}
                <CopyInline text={orderId} />
              </span>
            </div>
          </div>

          {/* Status explanation */}
          <div className={`mx-5 mt-4 rounded-2xl border px-4 py-4 ${
            tx.status === 'completed' ? 'border-[#a9efc5] bg-[#ecfdf3]' :
            tx.status === 'failed'    ? 'border-[#fda29b] bg-[#fff1f0]' :
            'border-[#e9eaeb] bg-[#fafafa]'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-4 w-4 ${s.text} ${tx.status === 'processing' ? 'animate-spin' : ''}`} weight={tx.status === 'completed' ? 'fill' : 'bold'} />
              <p className={`text-[13px] font-semibold ${s.text}`}>{s.label}</p>
            </div>
            <p className="text-[12px] leading-[1.6] text-[#717680]">
              {tx.status === 'pending'    && 'Your offramp request has been received and is queued for processing.'}
              {tx.status === 'processing' && 'Your funds are being converted and sent to your bank. This typically takes 1–5 minutes.'}
              {tx.status === 'completed'  && 'The funds have been successfully sent to your bank account.'}
              {tx.status === 'failed'     && 'This offramp transaction failed. Please try again or contact support if the issue persists.'}
            </p>
          </div>

          <div className="h-8" />
        </div>
      </div>
    </ClientPortal>
  );
}
