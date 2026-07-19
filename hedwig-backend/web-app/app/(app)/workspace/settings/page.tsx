'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, X, PencilSimple, ArrowsClockwise,
  Bank, Bell, BellRinging, Buildings, CalendarBlank, CalendarDots,
  ChartBar, CheckCircle, ClockCountdown, Coins, Copy, CreditCard,
  CurrencyCircleDollar, CurrencyDollar, DownloadSimple, Envelope,
  FileText, FlagPennant, FolderSimple, Globe, House, IdentificationCard,
  Link as LinkIcon, Lock, MagicWand, MapPin, NotePencil, PaperPlaneRight,
  Printer, Receipt, ShareNetwork, Shield,
  ShieldCheck, Sparkle, Target, UploadSimple, User, UserPlus, UsersThree, Wallet,
} from '@/components/ui/lucide-icons';
import { ExternalRecipientsPanel } from '@/components/workspace/external-recipients-panel';
import { Button } from '@/components/ui/button';
import { IconEmojiPicker, type PickerResult } from '@/components/ui/icon-emoji-picker';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { backendConfig } from '@/lib/auth/config';
import { cn } from '@/lib/utils';

const ICON_MAP_WS: Record<string, React.ComponentType<any>> = {
  Bank, Bell, BellRinging, Buildings, CalendarBlank, CalendarDots,
  ChartBar, CheckCircle, ClockCountdown, Coins, Copy, CreditCard,
  CurrencyCircleDollar, CurrencyDollar, DownloadSimple, Envelope,
  FileText, FlagPennant, FolderSimple, Globe, House, IdentificationCard,
  Link: LinkIcon, Lock, MagicWand, MapPin, NotePencil, PaperPlaneRight,
  Printer, Receipt, ShareNetwork, Shield, ShieldCheck,
  Sparkle, Target, UploadSimple, User, UserPlus, UsersThree, Wallet,
};

function WorkspaceIconIcon({ name, color, size = 18 }: { name: string; color: string; size?: number }) {
  const Icon = ICON_MAP_WS[name];
  if (!Icon) return null;
  return <Icon className="h-5 w-5" weight="bold" style={{ color }} />;
}

function parseWorkspaceIcon(icon: string): { type: 'emoji' | 'icon' | null; value: string; color: string } {
  if (!icon) return { type: null, value: '', color: '#0d47a1' };
  const parts = icon.split(':');
  if (parts[0] === 'emoji') return { type: 'emoji', value: parts.slice(1).join(':'), color: '#0d47a1' };
  if (parts[0] === 'icon') return { type: 'icon', value: parts[1], color: parts[2] || '#0d47a1' };
  return { type: 'emoji', value: icon, color: '#0d47a1' };
}

interface Member {
  id: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  email?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  joinedAt?: string;
}

interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'member';
  status: string;
  createdAt: string;
  expiresAt: string;
}

export default function WorkspaceSettingsPage() {
  const { activeWorkspace, accessToken, refresh, updateWorkspaceIcon } = useWorkspaceContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit name state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Icon picker state
  const [showIconPicker, setShowIconPicker] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement | null>(null);

  const wsIcon = activeWorkspace?.icon ?? '';
  const resolvedIcon = parseWorkspaceIcon(wsIcon);

  const handleIconSelect = (result: PickerResult) => {
    const iconStr = result.type === 'emoji'
      ? `emoji:${result.value}`
      : `icon:${result.value}:${result.color}`;
    updateWorkspaceIcon(activeWorkspace!.id, iconStr);
    setShowIconPicker(false);
  };

  // Close picker on outside click
  useEffect(() => {
    if (!showIconPicker) return;
    const handler = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setShowIconPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showIconPicker]);

  // Transfer ownership state
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const fetchData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoadingMembers(true);
    setError(null);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch(`${backendConfig.apiBaseUrl}/api/workspaces/${activeWorkspace.id}/members`, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        }),
        fetch(`${backendConfig.apiBaseUrl}/api/workspaces/${activeWorkspace.id}/invitations`, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        }),
      ]);
      if (!membersRes.ok) throw new Error('Failed to load members');
      const membersBody = await membersRes.json();
      setMembers(membersBody.data?.members ?? []);

      if (invitesRes.ok) {
        const invitesBody = await invitesRes.json();
        setInvitations(invitesBody.data?.invitations ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workspace data');
    } finally {
      setLoadingMembers(false);
    }
  }, [activeWorkspace]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const apiCall = async (url: string, method: string, body?: Record<string, unknown>) => {
    const res = await fetch(`${backendConfig.apiBaseUrl}${url}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const b = await res.json();
      throw new Error(b?.error?.message || 'Request failed');
    }
    return res.json();
  };

  const handleUpdateName = async () => {
    if (!activeWorkspace || !nameValue.trim()) return;
    setSavingName(true);
    try {
      await apiCall(`/api/workspaces/${activeWorkspace.id}`, 'PATCH', { name: nameValue.trim() });
      setEditingName(false);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleDelete = async () => {
    if (!activeWorkspace) return;
    setDeleting(true);
    try {
      await apiCall(`/api/workspaces/${activeWorkspace.id}`, 'DELETE');
      setShowDeleteConfirm(false);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete workspace');
    } finally {
      setDeleting(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!activeWorkspace || !transferTarget) return;
    setTransferring(true);
    try {
      await apiCall(`/api/workspaces/${activeWorkspace.id}/members/${transferTarget}`, 'PATCH', { role: 'owner' });
      setTransferTarget(null);
      setShowTransferConfirm(false);
      await refresh();
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to transfer ownership');
    } finally {
      setTransferring(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!activeWorkspace) return;
    try {
      await apiCall(`/api/workspaces/${activeWorkspace.id}/invitations/${invitationId}`, 'DELETE');
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel invitation');
    }
  };

  const isOwner = activeWorkspace?.role === 'owner';
  const isAdmin = activeWorkspace?.role === 'admin';
  const isOrg = activeWorkspace?.type === 'organization';
  const canManage = isOwner || isAdmin;

  if (!activeWorkspace) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-[13px] text-[var(--color-text-tertiary)]">Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Workspace settings</h1>
            <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Manage your workspace, members, and invitations.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            disabled={loadingMembers}
            className="text-[var(--color-text-placeholder)] hover:text-[var(--color-text-secondary)]"
          >
            <ArrowsClockwise className={cn('h-4 w-4', loadingMembers && 'animate-spin')} weight="bold" />
          </Button>
        </div>
      </div>

      <div className="space-y-8">
      {/* Workspace info */}
      <section className="space-y-2">
        <div className="px-0.5">
          <h2 className="text-[13px] font-semibold text-[var(--color-foreground)]">Workspace</h2>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-3">
            <div className="relative" ref={iconPickerRef}>
              <button
                type="button"
                onClick={() => setShowIconPicker(!showIconPicker)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-sm font-bold text-[var(--color-text-secondary)] transition hover:ring-2 hover:ring-[var(--color-accent)] hover:ring-offset-2 hover:ring-offset-[var(--color-surface)]"
              >
                {resolvedIcon.type === 'emoji' ? (
                  <span className="text-[20px]">{resolvedIcon.value}</span>
                ) : resolvedIcon.type === 'icon' ? (
                  <WorkspaceIconIcon name={resolvedIcon.value} color={resolvedIcon.color} />
                ) : (
                  activeWorkspace.name.charAt(0).toUpperCase()
                )}
              </button>
              {showIconPicker && (
                <div className="absolute left-0 top-12 z-50">
                  <IconEmojiPicker
                    initialColor={resolvedIcon.type === 'icon' ? resolvedIcon.color : '#0d47a1'}
                    onSelect={handleIconSelect}
                    onClose={() => setShowIconPicker(false)}
                  />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="w-full max-w-[200px] rounded-md border border-[var(--color-border)] px-2 py-1 text-[14px] font-medium text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20"
                    maxLength={100}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateName();
                      if (e.key === 'Escape') { setEditingName(false); setNameValue(activeWorkspace.name); }
                    }}
                  />
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleUpdateName}
                    disabled={!nameValue.trim() || savingName}
                  >
                    {savingName ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditingName(false); setNameValue(activeWorkspace.name); }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-medium text-[var(--color-foreground)]">{activeWorkspace.name}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setNameValue(activeWorkspace.name); setEditingName(true); setTimeout(() => nameInputRef.current?.focus(), 0); }}
                    className="h-6 w-6 rounded-md text-[var(--color-text-placeholder)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]"
                    aria-label="Rename workspace"
                  >
                    <PencilSimple className="h-3.5 w-3.5" weight="bold" />
                  </Button>
                </div>
              )}
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                {isOrg ? 'Organization workspace' : 'Personal workspace'} · {members.length} member{members.length !== 1 ? 's' : ''}
                {isOwner && ' · You are the owner'}
                {isAdmin && ' · You are an admin'}
              </p>
            </div>
          </div>

          {/* Transfer ownership (owner only, org workspace with other members) */}
          {isOwner && isOrg && members.length > 1 && (
            <div className="mt-4 border-t border-[var(--color-border-light)] pt-4">
              <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-text-secondary)]">Transfer ownership</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                <select
                  value={transferTarget ?? ''}
                  onChange={(e) => setTransferTarget(e.target.value || null)}
                  className="w-full appearance-none rounded-full border border-[var(--color-border-light)] px-3 py-2 pr-8 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20"
                >
                  <option value="">Select a member...</option>
                  {members.filter((m) => m.role !== 'owner').map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.firstName || m.lastName ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() : m.email} ({m.role})
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-muted)]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4.5L6 7.5L9 4.5" />
                </svg>
              </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTransferConfirm(true)}
                  disabled={!transferTarget}
                >
                  Transfer
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--color-text-placeholder)]">You will become an admin after transferring ownership.</p>
            </div>
          )}
        </div>
      </section>

      {/* Team */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-[13px] font-semibold text-[var(--color-foreground)]">Team</h2>
          {canManage && (
            <Button
              variant="default"
              size="sm"
              className="create-btn"
              onClick={() => window.dispatchEvent(new CustomEvent('hedwig:open-invite-member'))}
            >
              Invite member
            </Button>
          )}
        </div>

        {loadingMembers ? (
          <div className="flex items-center justify-center py-6">
            <p className="text-[13px] text-[var(--color-text-tertiary)]">Loading members...</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-medium text-[var(--color-foreground)]">
                  {members.length} member{members.length !== 1 ? 's' : ''}
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">
                  {isOrg ? `${members.filter((m) => m.role !== 'owner').length} team members · ` : ''}Manage roles and payouts
                </p>
              </div>
              <Link
                href="/workspace/members"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" weight="bold" />
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <section className="space-y-2">
          <div className="px-0.5">
            <h2 className="text-[13px] font-semibold text-[var(--color-foreground)]">Pending invitations</h2>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
            {invitations.filter((inv) => inv.status === 'pending').map((inv, i) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 px-5 py-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-warning-soft)] text-[12px] font-bold text-[var(--color-warning)]">
                  {inv.email.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[var(--color-foreground)]">{inv.email}</p>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">
                    {inv.role === 'admin' ? 'Admin' : 'Member'} · Pending
                  </p>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelInvitation(inv.id)}
                    className="h-7 w-7 rounded-md text-[var(--color-text-placeholder)] hover:bg-red-50 hover:text-red-500"
                    aria-label="Cancel invitation"
                  >
                    <X className="h-3.5 w-3.5" weight="bold" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* External recipients */}
      <section className="space-y-2">
        <div className="px-0.5">
          <h2 className="text-[13px] font-semibold text-[var(--color-foreground)]">External recipients</h2>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <ExternalRecipientsPanel workspaceId={activeWorkspace?.id || ''} accessToken={accessToken} />
        </div>
      </section>

      {/* Danger zone — delete workspace (org only) */}
      {isOwner && isOrg && (
        <section className="space-y-2">
          <div className="px-0.5">
            <h2 className="text-[13px] font-semibold text-red-600">Danger zone</h2>
          </div>
          <div className="rounded-xl border border-red-300 bg-red-50/50 p-5">
            <p className="mb-1 text-[14px] font-medium text-red-800">Delete this workspace</p>
            <p className="mb-4 text-[13px] text-red-700">
              This permanently deletes the workspace and all associated data. Members will lose access. This cannot be undone.
            </p>
            {!showDeleteConfirm ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete workspace
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Confirm delete'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </section>
      )}
      </div>

      {/* Transfer ownership confirmation modal */}
      {showTransferConfirm && transferTarget && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]">
          <div className="fixed inset-0 bg-[var(--color-foreground)]/30" onClick={() => setShowTransferConfirm(false)} />
          <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-surface)] p-6 shadow-2xl shadow-[var(--color-foreground)]/10">
            <h2 className="mb-2 text-[15px] font-semibold text-[var(--color-foreground)]">Transfer ownership?</h2>
            <p className="mb-1 text-[13px] text-[var(--color-text-secondary)]">
              You will lose owner privileges and become an <strong>admin</strong>. This transfer is permanent and cannot be undone by you.
            </p>
            <p className="mb-4 text-[13px] text-[var(--color-text-tertiary)]">
              The new owner will have full control over the workspace, including the ability to remove members and delete the workspace.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowTransferConfirm(false); setTransferTarget(null); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleTransferOwnership}
                disabled={transferring}
              >
                {transferring ? 'Transferring...' : 'Yes, transfer ownership'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
