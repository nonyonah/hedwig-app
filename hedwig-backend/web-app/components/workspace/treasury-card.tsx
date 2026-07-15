'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { backendConfig } from '@/lib/auth/config';

interface TreasuryBalance {
  solanaAddress: string | null;
  baseAddress: string | null;
  solBalance: number;
  usdcSolBalance: number;
  usdcBaseBalance: number;
  totalUsdc: number;
}

interface PayoutItem {
  userId: string;
  amount: number;
  reason?: string;
  projectId?: string;
}

interface PayoutRecord {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
  initiated_by: string;
  items?: Array<{ user_id: string; amount: number; reason?: string; status: string }>;
}

export function TreasuryCard() {
  const { activeWorkspace, accessToken } = useWorkspaceContext();
  const [balance, setBalance] = useState<TreasuryBalance | null>(null);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutItems, setPayoutItems] = useState<PayoutItem[]>([]);
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<Array<{ userId: string; firstName?: string; lastName?: string; email?: string }>>([]);

  const canManage = activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'admin';

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
      const [bal, hist, mem] = await Promise.all([
        api(`/api/workspaces/${activeWorkspace.id}/treasury`, 'GET'),
        api(`/api/workspaces/${activeWorkspace.id}/treasury/payouts`, 'GET'),
        api(`/api/workspaces/${activeWorkspace.id}/members`, 'GET'),
      ]);
      setBalance(bal.data);
      setPayouts(hist.data?.payouts || []);
      setMembers(mem.data?.members || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [activeWorkspace]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const initiatePayout = async () => {
    if (!activeWorkspace || payoutItems.length === 0) return;
    setSending(true);
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/treasury/payout`, 'POST', { items: payoutItems });
      setShowPayoutForm(false);
      setPayoutItems([]);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Payout failed');
    } finally {
      setSending(false);
    }
  };

  const addPayoutItem = (userId: string) => {
    if (payoutItems.some(i => i.userId === userId)) return;
    const member = members.find(m => m.userId === userId);
    setPayoutItems([...payoutItems, {
      userId,
      amount: 0,
      reason: member ? `${member.firstName || member.email} payout` : '',
    }]);
  };

  const updatePayoutItem = (index: number, field: keyof PayoutItem, value: any) => {
    setPayoutItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removePayoutItem = (index: number) => {
    setPayoutItems(prev => prev.filter((_, i) => i !== index));
  };

  if (!activeWorkspace || activeWorkspace.type === 'personal') return null;

  const totalPayout = payoutItems.reduce((sum, i) => sum + (i.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Balance card */}
      <div className="rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5">
        <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">Treasury</h3>
        {loading ? (
          <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">Loading...</p>
        ) : balance ? (
          <div className="mt-3">
            <p className="text-[28px] font-bold text-[var(--color-foreground)]">
              ${balance.totalUsdc.toLocaleString()}
              <span className="ml-1 text-[14px] font-medium text-[var(--color-text-tertiary)]">USDC</span>
            </p>
            <div className="mt-2 flex gap-3">
              {balance.solanaAddress && (
                <span className="rounded-md bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                  Solana: ${balance.usdcSolBalance.toLocaleString()}
                </span>
              )}
              {balance.baseAddress && (
                <span className="rounded-md bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                  Base: ${balance.usdcBaseBalance.toLocaleString()}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-text-placeholder)]">
              {balance.solBalance.toFixed(4)} SOL
            </p>
            {canManage && (
              <Button variant="default" size="sm" onClick={() => setShowPayoutForm(true)} className="mt-3">
                <Plus className="h-3.5 w-3.5" weight="bold" /> Payout
              </Button>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">No treasury wallet set up</p>
        )}
      </div>

      {/* Payout form */}
      {showPayoutForm && (
        <div className="rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5">
          <h3 className="mb-3 text-[14px] font-semibold text-[var(--color-foreground)]">New payout</h3>

          {/* Add member */}
          <div className="mb-3">
            <select
              onChange={(e) => { if (e.target.value) addPayoutItem(e.target.value); e.target.value = ''; }}
              className="w-full rounded-full border border-[var(--color-border)] px-3 py-2 text-[13px]"
            >
              <option value="">Add member...</option>
              {members.filter(m => !payoutItems.some(i => i.userId === m.userId)).map(m => (
                <option key={m.userId} value={m.userId}>
                  {m.firstName ? `${m.firstName} ${m.lastName || ''}`.trim() : m.email}
                </option>
              ))}
            </select>
          </div>

          {/* Payout items */}
          {payoutItems.map((item, i) => (
            <div key={item.userId} className="mb-2 flex items-center gap-2">
              <span className="w-[100px] shrink-0 truncate text-[13px] font-medium text-[var(--color-foreground)]">
                {members.find(m => m.userId === item.userId)?.firstName || item.userId.slice(0, 8)}
              </span>
              <input
                type="number"
                placeholder="Amount"
                value={item.amount || ''}
                onChange={e => updatePayoutItem(i, 'amount', parseFloat(e.target.value) || 0)}
                className="w-[100px] rounded-full border border-[var(--color-border)] px-2 py-1.5 text-[13px]"
              />
              <input
                type="text"
                placeholder="Reason"
                value={item.reason || ''}
                onChange={e => updatePayoutItem(i, 'reason', e.target.value)}
                className="flex-1 rounded-full border border-[var(--color-border)] px-2 py-1.5 text-[13px]"
              />
              <Button variant="ghost" size="sm" onClick={() => removePayoutItem(i)} className="text-[var(--color-text-tertiary)]">
                ✕
              </Button>
            </div>
          ))}

          {payoutItems.length > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border-light)] pt-3">
              <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
                Total: ${totalPayout.toLocaleString()} USDC
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setShowPayoutForm(false); setPayoutItems([]); }}>
                  Cancel
                </Button>
                <Button variant="default" size="sm" onClick={initiatePayout} disabled={sending || totalPayout <= 0}>
                  {sending ? 'Sending...' : `Send payout`}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payout history */}
      {payouts.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] p-5">
          <h3 className="mb-3 text-[14px] font-semibold text-[var(--color-foreground)]">Payout history</h3>
          <div className="space-y-2">
            {payouts.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-full bg-[var(--color-surface-secondary)] px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-[var(--color-foreground)]">
                    ${Number(p.total_amount).toLocaleString()} USDC
                  </p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">
                    {p.items?.map(i => i.reason || i.user_id?.slice(0,8)).join(', ') || '—'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-md bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">
                    {p.status}
                  </span>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-placeholder)]">
                    {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
