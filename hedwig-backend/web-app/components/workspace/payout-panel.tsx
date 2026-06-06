'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  UsersThree,
  X,
} from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { backendConfig } from '@/lib/auth/config';
import { PayoutReviewDialog, type PayoutLineItem } from './payout-review-dialog';
import { CHAIN_LABELS, type SendChain } from '@/lib/send/send-helpers';

const SUPPORTED_CHAINS: SendChain[] = ['solana', 'base', 'arbitrum', 'polygon', 'optimism'];

interface Member {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: string;
  solanaWalletAddress?: string;
  ethereumWalletAddress?: string;
}

interface PayoutRecord {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
  items?: Array<{
    id: string;
    user_id: string;
    amount: number;
    reason?: string;
    status: string;
    tx_hash?: string;
  }>;
}

function getAddressForChain(member: Member, chain: SendChain): string | undefined {
  if (chain === 'solana') return member.solanaWalletAddress;
  return member.ethereumWalletAddress;
}

function getDefaultChain(member: Member): SendChain {
  if (member.solanaWalletAddress) return 'solana';
  if (member.ethereumWalletAddress) return 'base';
  return 'solana';
}

export function PayoutPanel({
  gatewayAutoDepositEnabled = false,
}: {
  gatewayAutoDepositEnabled?: boolean;
}) {
  const { activeWorkspace, accessToken } = useWorkspaceContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [payoutItems, setPayoutItems] = useState<PayoutLineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [rawAmounts, setRawAmounts] = useState<Record<string, string>>({});

  const canManage = activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'admin';
  const isOrg = activeWorkspace?.type === 'organization';

  const api = async (url: string, method: string, body?: any) => {
    const res = await fetch(`${backendConfig.apiBaseUrl}${url}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) { const b = await res.json(); throw new Error(b?.error?.message || 'Request failed'); }
    return res.json();
  };

  const fetchData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [mem, pay] = await Promise.all([
        api(`/api/workspaces/${activeWorkspace.id}/members`, 'GET'),
        api(`/api/workspaces/${activeWorkspace.id}/treasury/payouts`, 'GET'),
      ]);
      setMembers(mem.data?.members || []);
      setPayouts(pay.data?.payouts || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [activeWorkspace]);

  useEffect(() => { if (isOrg) fetchData(); }, [fetchData, isOrg]);

  const addItem = (userId: string) => {
    if (payoutItems.some(i => i.userId === userId)) return;
    const m = members.find(m => m.userId === userId);
    const chain = getDefaultChain(m!);
    const address = getAddressForChain(m!, chain);

    if (!address) {
      alert(`${m?.firstName || m?.email || 'This member'} does not have a wallet address on any supported chain.`);
      return;
    }

    setPayoutItems([...payoutItems, {
      userId,
      amount: 0,
      reason: m ? `${m.firstName || m.email} payout` : '',
      chain,
      destinationAddress: address,
    }]);
    setRawAmounts(prev => ({ ...prev, [userId]: '' }));
  };

  const updateItem = (i: number, f: keyof PayoutLineItem, v: any) => {
    setPayoutItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [f]: v };
      if (f === 'chain') {
        const m = members.find(mem => mem.userId === item.userId);
        const addr = getAddressForChain(m!, v as SendChain) || '';
        updated.destinationAddress = addr;
      }
      return updated;
    }));
  };

  const getParsedAmount = (item: PayoutLineItem): number => {
    const raw = rawAmounts[item.userId];
    if (raw !== undefined && raw !== '') {
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }
    return item.amount || 0;
  };

  const computeTotal = (items: PayoutLineItem[]) =>
    items.reduce((s, i) => s + getParsedAmount(i), 0);

  const removeItem = (i: number) => {
    setPayoutItems(prev => {
      const removed = prev[i];
      if (removed) {
        setRawAmounts(r => { const n = { ...r }; delete n[removed.userId]; return n; });
      }
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const handleReview = () => {
    const total = computeTotal(payoutItems);
    if (total <= 0) {
      alert('Please enter a valid amount for at least one member.');
      return;
    }
    setShowReview(true);
  };

  const handlePayoutSuccess = () => {
    setShowForm(false);
    setPayoutItems([]);
    setRawAmounts({});
    setShowReview(false);
    fetchData();
  };

  if (!isOrg) return null;

  const total = computeTotal(payoutItems);
  const availableMembers = members.filter(m => {
    if (payoutItems.some(i => i.userId === m.userId)) return false;
    return !!(m.solanaWalletAddress || m.ethereumWalletAddress);
  });

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
        <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
                <UsersThree className="h-5 w-5 text-[var(--color-primary)]" weight="bold" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-bold text-[var(--color-foreground)]">Team payouts</h3>
                  {gatewayAutoDepositEnabled && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
                      Gateway
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[var(--color-text-muted)]">
                  Send USDC to workspace members
                </p>
              </div>
            </div>
          {canManage && (
            <Button variant="default" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5" weight="bold" /> New payout
            </Button>
          )}
        </div>

        {showForm && (
          <div className="border-t border-[var(--color-border)] px-5 py-4">
            <div className="mb-3">
              <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">
                Add member
              </label>
              <select
                onChange={(e) => {
                  if (e.target.value) { addItem(e.target.value); e.target.value = ''; }
                }}
                className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              >
                <option value="">Select a member…</option>
                {availableMembers.map(m => (
                  <option key={m.userId} value={m.userId}>
                    {m.firstName ? `${m.firstName} ${m.lastName || ''}`.trim() : m.email}
                  </option>
                ))}
              </select>
              {availableMembers.length === 0 && members.length > 0 && (
                <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                  All members with wallets have been added.
                </p>
              )}
              {members.length > 0 &&
                members.filter(m => !m.solanaWalletAddress && !m.ethereumWalletAddress).length > 0 &&
                availableMembers.length === 0 && (
                <p className="mt-1.5 text-[11px] text-[var(--color-danger)]">
                  Some members do not have a wallet address set up yet.
                </p>
              )}
            </div>

            <div className="space-y-2">
              {payoutItems.map((item, i) => {
                const m = members.find(mem => mem.userId === item.userId);
                const initials = (m?.firstName?.[0] ?? m?.email?.[0] ?? '?').toUpperCase();
                return (
                  <div
                    key={item.userId}
                    className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[11px] font-bold text-[var(--color-text-tertiary)]">
                      {initials}
                    </div>
                    <span className="w-[80px] shrink-0 truncate text-[12px] font-medium text-[var(--color-foreground)]">
                      {m?.firstName || m?.email || item.userId.slice(0, 6)}
                    </span>

                    {/* Chain selector */}
                    <select
                      value={item.chain}
                      onChange={e => updateItem(i, 'chain', e.target.value as SendChain)}
                      className="w-[85px] shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[11px] text-[var(--color-foreground)] outline-none"
                    >
                      {SUPPORTED_CHAINS.map(c => (
                        <option key={c} value={c} disabled={!getAddressForChain(m!, c)}>
                          {CHAIN_LABELS[c]}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1">
                      <span className="text-[12px] text-[var(--color-text-tertiary)]">$</span>
                      <input
                        type="number"
                        placeholder="0"
                        min={0}
                        step="any"
                        value={rawAmounts[item.userId] ?? (item.amount > 0 ? String(item.amount) : '')}
                        onChange={e => {
                          const raw = e.target.value;
                          setRawAmounts(prev => ({ ...prev, [item.userId]: raw }));
                          const parsed = parseFloat(raw);
                          if (Number.isFinite(parsed)) {
                            updateItem(i, 'amount', Math.max(0, parsed));
                          }
                        }}
                        className="w-[90px] rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Reason"
                      value={item.reason || ''}
                      onChange={e => updateItem(i, 'reason', e.target.value)}
                      className="flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-danger)]"
                    >
                      <X className="h-3.5 w-3.5" weight="bold" />
                    </button>
                  </div>
                );
              })}
            </div>

            {payoutItems.length > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border-light)] pt-3">
                <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
                  Total: ${total.toLocaleString()} USDC
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowForm(false); setPayoutItems([]); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleReview}
                    disabled={total <= 0}
                  >
                    Review payout
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {payouts.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <h3 className="text-[15px] font-bold text-[var(--color-foreground)]">Payout history</h3>
              <p className="text-[12px] text-[var(--color-text-muted)]">Recent team payouts</p>
            </div>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {payouts.map(p => {
              const statusColor =
                p.status === 'completed' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' :
                p.status === 'partial' ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]' :
                p.status === 'failed' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' :
                'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]';
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-[var(--color-background)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
                      ${Number(p.total_amount).toLocaleString()} USDC
                    </p>
                    <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                      {p.items?.map(i => i.reason || `${i.user_id?.slice(0, 8)}…`).join(', ') || '—'}
                    </p>
                  </div>
                  <div className="ml-3 shrink-0 text-right">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColor}`}>
                      {p.status}
                    </span>
                    <p className="mt-0.5 text-[11px] text-[var(--color-text-placeholder)]">
                      {new Date(p.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showReview && payoutItems.length > 0 && (
        <PayoutReviewDialog
          workspaceId={activeWorkspace?.id || ''}
          items={payoutItems.map(item => ({
            ...item,
            amount: getParsedAmount(item),
          }))}
          members={members}
          accessToken={accessToken}
          gatewayAutoDepositEnabled={gatewayAutoDepositEnabled}
          onClose={() => setShowReview(false)}
          onSuccess={handlePayoutSuccess}
        />
      )}
    </div>
  );
}
