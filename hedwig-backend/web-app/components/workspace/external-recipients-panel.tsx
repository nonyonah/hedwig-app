'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Wallet, Copy, CheckCircle } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';
import { hedwigApi } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface Recipient {
  id: string;
  display_name: string;
  wallet_address: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
}

export function ExternalRecipientsPanel({ workspaceId, accessToken }: { workspaceId: string; accessToken: string | null }) {
  const { toast: addToast } = useToast();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchRecipients = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await hedwigApi.externalRecipients(workspaceId, { accessToken, disableMockFallback: true });
      setRecipients(res?.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [workspaceId, accessToken]);

  useEffect(() => { fetchRecipients(); }, [fetchRecipients]);

  const handleCreate = useCallback(async () => {
    if (!displayName.trim() || !walletAddress.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res: any = await hedwigApi.createExternalRecipient(workspaceId, {
        displayName: displayName.trim(),
        walletAddress: walletAddress.trim(),
        notes: notes.trim() || undefined,
      }, { accessToken, disableMockFallback: true });
      if (res?.data) {
        setRecipients(prev => [res.data, ...prev]);
        setShowForm(false);
        setDisplayName('');
        setWalletAddress('');
        setNotes('');
        addToast({ title: 'Added', message: 'External recipient added.', type: 'success' });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to add recipient');
    } finally {
      setSaving(false);
    }
  }, [displayName, walletAddress, notes, workspaceId, accessToken, addToast]);

  const handleToggle = useCallback(async (recipient: Recipient) => {
    try {
      const res: any = await hedwigApi.updateExternalRecipient(workspaceId, recipient.id, {
        isActive: !recipient.is_active,
      }, { accessToken, disableMockFallback: true });
      if (res?.data) {
        setRecipients(prev => prev.map(r => r.id === recipient.id ? res.data : r));
      }
    } catch {
      addToast({ title: 'Failed', message: 'Could not update recipient.', type: 'error' });
    }
  }, [workspaceId, accessToken, addToast]);

  const handleDelete = useCallback(async (recipientId: string) => {
    try {
      await hedwigApi.deleteExternalRecipient(workspaceId, recipientId, { accessToken, disableMockFallback: true });
      setRecipients(prev => prev.filter(r => r.id !== recipientId));
      addToast({ title: 'Removed', message: 'Recipient removed.', type: 'success' });
    } catch {
      addToast({ title: 'Failed', message: 'Could not remove recipient.', type: 'error' });
    }
  }, [workspaceId, accessToken, addToast]);

  const handleCopyAddress = useCallback(async (address: string, id: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[15px] font-semibold text-[var(--color-foreground)]">External recipients</p>
          <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">People outside your workspace who receive payroll payments</p>
        </div>
        <Button variant="default" size="sm" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4 mr-1" weight="bold" /> Add
        </Button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Name</span>
            <input
              type="text"
              placeholder="e.g. Jane Contractor"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Wallet address (Base network)</span>
            <input
              type="text"
              placeholder="0x..."
              value={walletAddress}
              onChange={e => setWalletAddress(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] font-mono text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Notes (optional)</span>
            <input
              type="text"
              placeholder="e.g. Freelance designer"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]"
            />
          </div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2.5"><p className="text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p></div>}
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="default" size="sm" disabled={!displayName || !walletAddress || saving} onClick={handleCreate}>
              Add recipient
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--color-surface-secondary)]" />)}
        </div>
      ) : recipients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Wallet className="h-8 w-8 text-[var(--color-border-input)] mb-2" weight="duotone" />
          <p className="text-[13px] text-[var(--color-text-muted)]">No external recipients yet</p>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-1">Add contractors or partners who should receive payroll payments.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recipients.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{r.display_name}</p>
                  {!r.is_active && (
                    <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">Inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <code className="truncate text-[11px] font-mono text-[var(--color-text-muted)]">{r.wallet_address.slice(0, 10)}...{r.wallet_address.slice(-6)}</code>
                  <button
                    onClick={() => handleCopyAddress(r.wallet_address, r.id)}
                    className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-foreground)] transition"
                    aria-label="Copy address"
                  >
                    {copiedId === r.id ? <CheckCircle className="h-3.5 w-3.5 text-[var(--color-success)]" weight="bold" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="sm" className="text-[11px] h-7 px-2" onClick={() => handleToggle(r)}>
                  {r.is_active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button variant="ghost" size="sm" className="text-[11px] h-7 px-2 text-[var(--color-danger)] hover:text-[var(--color-danger)]" onClick={() => handleDelete(r.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
