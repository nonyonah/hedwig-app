'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from '@/components/ui/lucide-icons';
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
      <div className="fixed inset-0 bg-[#181d27]/30" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-[#f3f4f6] bg-white shadow-2xl shadow-black/10">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[#181d27]">Invite member</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#c1c5cd] transition hover:bg-[#f5f5f5] hover:text-[#717680]"
          >
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 pb-5">
          <div className="mb-3">
            <label className="mb-1.5 block text-[13px] font-medium text-[#414651]">Email address</label>
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              className="w-full rounded-lg border border-[#eef0f3] px-3 py-2 text-[14px] text-[#181d27] outline-none transition placeholder:text-[#c1c5cd] focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-[13px] font-medium text-[#414651]">Role</label>
            <div className="flex gap-2">
              {(['member', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium transition ${
                    role === r
                      ? 'border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]'
                      : 'border-[#eef0f3] text-[#525866] hover:border-[#d0d5dd]'
                  }`}
                >
                  {r === 'admin' ? 'Admin' : 'Member'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-[#8d9096]">
              {role === 'admin' ? 'Can manage members, projects, and settings.' : 'Can view and interact with workspace content.'}
            </p>
          </div>
          {error && <p className="mb-3 text-[12px] text-red-500">{error}</p>}
          {success && <p className="mb-3 text-[12px] text-green-600">{success}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#414651] transition hover:bg-[#f4f5f7]"
            >
              {success ? 'Close' : 'Cancel'}
            </button>
            {!success && (
              <button
                type="submit"
                disabled={!email.trim() || saving}
                className="rounded-lg bg-[#2563eb] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
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
