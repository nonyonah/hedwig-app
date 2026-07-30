'use client';

import { useEffect, useRef, useState } from 'react';
import { X, CaretDown } from '@/components/ui/lucide-icons';
import { Button, Dropdown, Label } from '@heroui/react';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { backendConfig } from '@/lib/auth/config';

export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { activeWorkspace, accessToken } = useWorkspaceContext();

  useEffect(() => {
    const handler = () => { setOpen(true); setEmail(''); setError(null); setSuccess(null); };
    window.addEventListener('hedwig:open-invite-member', handler);
    return () => window.removeEventListener('hedwig:open-invite-member', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !activeWorkspace) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${backendConfig.apiBaseUrl}/api/workspaces/${activeWorkspace.id}/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to invite member');
      }
      setSuccess(`Invitation sent to ${email.trim()}`);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-[var(--color-foreground)]/30" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-surface)] shadow-2xl shadow-[var(--color-foreground)]/10">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[var(--color-foreground)]">Invite member</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-placeholder)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)]"
          >
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 pb-5">
          <div className="mb-3">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-text-secondary)]">Email address</label>
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              className="w-full rounded-full border border-[var(--color-border-light)] px-3 py-2 text-[14px] text-[var(--color-foreground)] outline-none transition placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-text-secondary)]">Role</label>
            <Dropdown>
              <Button
                variant="secondary"
                className="flex h-10 w-full items-center justify-between rounded-full border border-[var(--color-border-light)] bg-[var(--color-surface)] px-3 text-[14px] font-medium text-[var(--color-foreground)]"
                aria-label="Select role"
              >
                <span>{role === 'member' ? 'Member' : 'Admin'}</span>
                <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
              </Button>
              <Dropdown.Popover className="min-w-[200px]">
                <Dropdown.Menu
                  selectedKeys={new Set([role])}
                  selectionMode="single"
                  onSelectionChange={(keys) => {
                    const key = [...keys][0];
                    if (key) setRole(key as 'admin' | 'member');
                  }}
                >
                  <Dropdown.Item key="member" id="member" textValue="Member">
                    <Label>Member</Label>
                  </Dropdown.Item>
                  <Dropdown.Item key="admin" id="admin" textValue="Admin">
                    <Label>Admin</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            <p className="mt-1.5 text-[12px] text-[var(--color-text-tertiary)]">
              {role === 'admin'
                ? 'Can manage members, projects, and settings.'
                : 'Can view and interact with workspace content.'}
            </p>
          </div>
          {error && <p className="mb-3 text-[12px] text-[var(--color-danger)]">{error}</p>}
          {success && <p className="mb-3 text-[12px] text-green-600">{success}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-tertiary)]"
            >
              {success ? 'Close' : 'Cancel'}
            </button>
            {!success && (
              <button
                type="submit"
                disabled={!email.trim() || saving}
                className="rounded-full bg-[var(--color-create)] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--color-create-dark)] disabled:opacity-50"
              >
                {saving ? 'Sending...' : 'Send invitation'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
