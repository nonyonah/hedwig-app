'use client';

import { useState, useEffect } from 'react';
import {
  Check,
  PaperPlaneRight,
  ShieldCheck,
  SpinnerGap,
  UsersThree,
  Warning,
  X,
} from '@/components/ui/lucide-icons';
import { ClientPortal } from '@/components/ui/client-portal';
import { Button } from '@/components/ui/button';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import {
  sendSolanaUsdc,
  sendEvmUsdc,
  sendUsdcViaGateway,
  CHAIN_LABELS,
  type SendChain,
} from '@/lib/send/send-helpers';
import { backendConfig } from '@/lib/auth/config';

type SendStep = 'review' | 'signing' | 'done' | 'error';

export interface PayoutLineItem {
  userId: string;
  amount: number;
  reason?: string;
  chain: SendChain;
  destinationAddress: string;
}

interface Member {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  solanaWalletAddress?: string;
  ethereumWalletAddress?: string;
}

interface PayoutResult {
  userId: string;
  amount: number;
  reason?: string;
  chain: SendChain;
  txHash?: string;
  error?: string;
}

interface GatewayDomainBalance {
  domain: number;
  balance: string;
  pending?: string;
  depositor?: string;
}

export function PayoutReviewDialog({
  workspaceId,
  items,
  members,
  accessToken,
  gatewayAutoDepositEnabled,
  onClose,
  onSuccess,
}: {
  workspaceId: string;
  items: PayoutLineItem[];
  members: Member[];
  accessToken: string | null;
  gatewayAutoDepositEnabled?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { ready } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();

  const [step, setStep] = useState<SendStep>('review');
  const [results, setResults] = useState<PayoutResult[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [payoutId, setPayoutId] = useState<string | null>(null);
  const [gatewayBalances, setGatewayBalances] = useState<GatewayDomainBalance[]>([]);

  const evmWallet = evmWallets.find((w: any) => w.walletClientType === 'privy') ?? evmWallets[0];
  const solanaWallet = solanaWallets[0];
  const totalAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  const useGateway = gatewayAutoDepositEnabled === true;

  const evmWalletList = evmWallets.length > 0 ? evmWallets : (evmWallet ? [evmWallet] : []);
  const solanaWalletList = solanaWallets.length > 0 ? solanaWallets : (solanaWallet ? [solanaWallet] : []);

  useEffect(() => {
    if (useGateway && accessToken) {
      fetch(`${backendConfig.apiBaseUrl}/api/gateway/balance`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then(r => r.json())
        .then(json => {
          const list = json?.data?.perDomain;
          if (Array.isArray(list)) setGatewayBalances(list);
        })
        .catch(() => {});
    }
  }, [useGateway, accessToken]);

  const api = async (url: string, method: string, body?: any) => {
    const res = await fetch(`${backendConfig.apiBaseUrl}${url}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error?.message || 'Request failed'); }
    return res.json();
  };

  async function updatePayoutItem(pid: string, itemId: string, status: string, txHash?: string) {
    await api(`/api/workspaces/${workspaceId}/treasury/payouts/${pid}/items/${itemId}`, 'PATCH', { status, tx_hash: txHash || null });
  }

  async function handleSend() {
    setStep('signing');
    setResults([]);
    setFatalError(null);
    setCurrentIndex(0);

    try {
      const apiItems = items.map(i => ({ userId: i.userId, amount: i.amount, reason: i.reason }));
      const createRes = await api(`/api/workspaces/${workspaceId}/treasury/payout`, 'POST', { items: apiItems });
      const createdPayoutId = createRes.data?.payout?.id;
      if (!createdPayoutId) throw new Error('Failed to create payout record');
      setPayoutId(createdPayoutId);

      const allResults: PayoutResult[] = [];
      const payoutItems: Array<{ id: string; user_id: string }> = createRes.data?.payout?.items || [];

      for (let i = 0; i < items.length; i++) {
        setCurrentIndex(i);
        const item = items[i];

        try {
          let txHash: string;

          if (useGateway && gatewayBalances.length > 0) {
            txHash = await sendUsdcViaGateway({
              evmWallets: evmWalletList,
              solanaWallets: solanaWalletList,
              amountUsdc: item.amount,
              recipientAddress: item.destinationAddress,
              destChain: item.chain,
              perDomainBalances: gatewayBalances,
              accessToken,
              onStatus: (msg) => console.log(`[Gateway] ${msg}`),
            });
          } else if (item.chain === 'solana') {
            txHash = await sendSolanaUsdc({ solanaWallet, recipient: item.destinationAddress, amountUsdc: item.amount });
          } else {
            txHash = await sendEvmUsdc({ evmWallet, recipient: item.destinationAddress, amountUsdc: item.amount, chain: item.chain });
          }

          allResults.push({ userId: item.userId, amount: item.amount, reason: item.reason, chain: item.chain, txHash });
          const backendItem = payoutItems.find(pi => pi.user_id === item.userId);
          if (backendItem) await updatePayoutItem(createdPayoutId, backendItem.id, 'completed', txHash);
        } catch (err: unknown) {
          const msg = typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err ?? 'Transaction failed');
          allResults.push({ userId: item.userId, amount: item.amount, reason: item.reason, chain: item.chain, error: msg });
          const backendItem = payoutItems.find(pi => pi.user_id === item.userId);
          if (backendItem) await updatePayoutItem(createdPayoutId, backendItem.id, 'failed');
        }
      }

      setResults(allResults);
      setStep('done');
      onSuccess();
    } catch (err: unknown) {
      const msg = typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err ?? 'Payout failed');
      setFatalError(msg);
      setStep('error');
    }
  }

  const successCount = results.filter(r => r.txHash).length;
  const failCount = results.filter(r => r.error).length;

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={step === 'signing' ? undefined : onClose} />

      <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-[480px] flex-col bg-[var(--color-surface)] shadow-2xl animate-in slide-in-from-right-full duration-300 ease-out">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-[15px] font-bold text-[var(--color-foreground)]">Team payout</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
              {step === 'review' ? 'Review your payout before signing' : step === 'signing' ? 'Waiting for wallet confirmation…' : step === 'done' ? 'Payout processed' : 'Payout failed'}
            </p>
          </div>
          {step !== 'signing' && (
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)]">
              <X className="h-4 w-4" weight="bold" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {step === 'review' && (
            <>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 text-center">
                <div className="relative mx-auto mb-3 w-fit">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
                    {useGateway ? (
                      <ShieldCheck className="h-6 w-6 text-[var(--color-primary)]" weight="bold" />
                    ) : (
                      <UsersThree className="h-6 w-6 text-[var(--color-primary)]" weight="bold" />
                    )}
                  </div>
                </div>
                <p className="text-[28px] font-bold tracking-[-0.04em] text-[var(--color-foreground)]">
                  ${totalAmount.toLocaleString()} USDC
                </p>
                <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
                  {items.length} member{items.length !== 1 ? 's' : ''}
                  {useGateway && ' · Gateway'}
                </p>
              </div>

              <div className="space-y-2">
                {items.map((item) => {
                  const member = members.find(m => m.userId === item.userId);
                  const initials = (member?.firstName?.[0] ?? member?.email?.[0] ?? '?').toUpperCase();
                  return (
                    <div key={item.userId} className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[12px] font-bold text-[var(--color-text-tertiary)]">{initials}</div>
                        <div>
                          <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
                            {member?.firstName ? `${member.firstName} ${member.lastName || ''}`.trim() : member?.email || 'Unknown'}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            {CHAIN_LABELS[item.chain] || item.chain} · {item.reason || 'Team payout'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[13px] font-semibold text-[var(--color-foreground)]">${item.amount.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>

              {useGateway && (
                <div className="rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] px-4 py-3.5">
                  <p className="text-[12px] leading-[1.6] text-[var(--color-text-tertiary)]">
                    Using Circle Gateway. USDC will be sent from your unified balance —
                    no native gas tokens needed. Fees are deducted in USDC.
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] px-4 py-3.5">
                <p className="text-[12px] leading-[1.6] text-[var(--color-text-tertiary)]">
                  Your Privy wallet will ask you to confirm each transaction.
                  Double-check the recipient addresses — crypto transfers cannot be reversed.
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="ghost" size="md" onClick={onClose} className="flex-1">Back</Button>
                <Button variant="default" size="md" onClick={handleSend} disabled={!ready} className="flex flex-1 items-center justify-center gap-2">
                  <PaperPlaneRight className="h-4 w-4" weight="bold" /> Sign & send
                </Button>
              </div>
            </>
          )}

          {step === 'signing' && (
            <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
                <SpinnerGap className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" weight="bold" />
              </div>
              <div>
                <p className="text-[16px] font-bold text-[var(--color-foreground)]">Sending payouts…</p>
                <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-text-tertiary)]">
                  Transaction {Math.min(currentIndex + 1, items.length)} of {items.length}
                  {useGateway && ' · Gateway'}
                </p>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-5 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success-soft)]">
                <Check className="h-8 w-8 text-[var(--color-text-tertiary)]" weight="bold" />
              </div>
              <div>
                <p className="text-[16px] font-bold text-[var(--color-foreground)]">
                  {successCount === items.length ? 'All payouts sent!' : `${successCount} of ${items.length} payouts sent`}
                </p>
                <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-text-tertiary)]">
                  {failCount > 0 ? `${failCount} payout(s) failed. Check the details below.` : 'Transactions have been submitted to the network.'}
                </p>
              </div>
              <div className="w-full space-y-2 text-left">
                {results.map(result => {
                  const member = members.find(m => m.userId === result.userId);
                  return (
                    <div key={result.userId} className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{member?.firstName || member?.email || 'Unknown'}</p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">${result.amount.toLocaleString()} · {CHAIN_LABELS[result.chain] || result.chain}</p>
                      </div>
                      {result.txHash ? (
                        <a href={`https://solscan.io/tx/${result.txHash}`} target="_blank" rel="noreferrer" className="ml-3 shrink-0 text-[11px] font-semibold text-[var(--color-primary)] hover:underline">View tx</a>
                      ) : (
                        <span className="ml-3 shrink-0 rounded-full bg-[var(--color-danger-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">Failed</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <Button variant="default" size="md" onClick={onClose} className="w-full">Done</Button>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center gap-5 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-danger-soft)]">
                <Warning className="h-8 w-8 text-[var(--color-text-tertiary)]" weight="bold" />
              </div>
              <div><p className="text-[16px] font-bold text-[var(--color-foreground)]">Payout failed</p>
                <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-text-tertiary)]">{fatalError}</p>
              </div>
              <Button variant="ghost" size="md" onClick={onClose} className="w-full">Close</Button>
            </div>
          )}
        </div>
      </div>
    </ClientPortal>
  );
}
