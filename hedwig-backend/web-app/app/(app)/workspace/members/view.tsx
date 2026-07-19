'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, User } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { backendConfig } from '@/lib/auth/config';
import { Button } from '@/components/ui/button';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import type { RowActionItem } from '@/components/data/row-actions-menu';
import { useToast } from '@/components/providers/toast-provider';
import { cn, formatShortDate } from '@/lib/utils';

interface Member {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  solanaWalletAddress?: string;
  ethereumWalletAddress?: string;
}

const ROLE_CONFIG: Record<Member['role'], { label: string; bg: string; text: string }> = {
  owner:   { label: 'Owner',  bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning-dark)]' },
  admin:   { label: 'Admin',  bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  member:  { label: 'Member', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-secondary)]' },
};

const ROLE_FILTERS = ['all', 'owner', 'admin', 'member'] as const;

export function MembersClient() {
  const { activeWorkspace, accessToken } = useWorkspaceContext();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  const isOwner = activeWorkspace?.role === 'owner';
  const isOrg = activeWorkspace?.type === 'organization';

  const api = useCallback(async (url: string, method: string, body?: any) => {
    const res = await fetch(`${backendConfig.apiBaseUrl}${url}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) { const b = await res.json(); throw new Error(b?.error?.message || 'Request failed'); }
    return res.json();
  }, [accessToken]);

  const fetchMembers = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const res = await api(`/api/workspaces/${activeWorkspace.id}/members`, 'GET');
      setMembers(res.data?.members || []);
    } catch {
      toast({ type: 'error', title: 'Failed to load members' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, api, toast]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const filtered = useMemo(
    () => (filter === 'all' ? members : members.filter((m) => m.role === filter)),
    [members, filter]
  );

  const activeCount = useMemo(() => members.filter((m) => m.role !== 'owner').length, [members]);

  const handleUpdateRole = async (userId: string, role: string) => {
    if (!activeWorkspace) return;
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/members/${userId}`, 'PATCH', { role });
      setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role: role as Member['role'] } : m)));
      toast({ type: 'success', title: 'Role updated' });
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed to update role', message: err?.message });
    }
  };

  const handleRemoveMember = async () => {
    if (!activeWorkspace || !memberToRemove) return;
    setRemoving(true);
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/members/${memberToRemove.userId}`, 'DELETE');
      setMembers((prev) => prev.filter((m) => m.userId !== memberToRemove.userId));
      toast({ type: 'success', title: 'Member removed', message: `${memberToRemove.firstName || memberToRemove.email} was removed.` });
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed to remove member', message: err?.message });
    } finally {
      setRemoving(false);
      setMemberToRemove(null);
    }
  };

  if (!isOrg || !activeWorkspace) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Members</h1>
          <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
            {!isOrg ? 'Team members are available in organization workspaces.' : 'Loading workspace…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Members</h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Manage team members and roles.</p>
      </div>

      <AttachedStatGrid
        items={[
          { id: 'total', title: 'Total', value: String(members.length), helper: isOwner ? 'Including you' : 'Members' },
          { id: 'team', title: 'Team', value: String(activeCount), helper: 'Admins & members' },
        ]}
        className="grid-cols-1 md:grid-cols-2"
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1">
          {ROLE_FILTERS.map((r) => (
            <Button
              key={r}
              variant="ghost"
              size="sm"
              onClick={() => setFilter(r)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] font-medium',
                filter === r
                  ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
              )}
            >
              {r === 'all' ? 'All' : ROLE_CONFIG[r]?.label ?? r}
            </Button>
          ))}
          <Button
            variant="default"
            size="sm"
            className="create-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('hedwig:open-invite-member'))}
          >
            <Plus className="h-3.5 w-3.5" weight="bold" /> Invite
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_100px_100px_44px] gap-3 border-b border-[var(--color-border)] px-5 py-2.5">
          <ColHead>Member</ColHead>
          <ColHead>Role</ColHead>
          <ColHead right>Joined</ColHead>
          <span />
        </div>

        {/* Rows */}
        {loading ? (
          <EmptyState text="Loading members…" />
        ) : filtered.length === 0 ? (
          <EmptyState text={filter === 'all' ? 'No members yet.' : 'No members match this filter.'} />
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {filtered.map((member) => {
              const roleCfg = ROLE_CONFIG[member.role];

              const actions: RowActionItem[] = [];
              if (member.role !== 'owner' && isOwner) {
                if (member.role === 'admin') {
                  actions.push({ label: 'Change to member', onClick: () => handleUpdateRole(member.userId, 'member') });
                } else {
                  actions.push({ label: 'Change to admin', onClick: () => handleUpdateRole(member.userId, 'admin') });
                }
              }
              if (member.role !== 'owner') {
                actions.push({ label: 'Remove', destructive: true, onClick: () => setMemberToRemove(member) });
              }

              return (
                <div
                  key={member.userId}
                  className="group grid grid-cols-[1fr_100px_100px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-background)]"
                >
                  {/* Member */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[12px] font-bold text-[var(--color-text-secondary)]">
                      {(member.firstName?.[0] ?? member.email?.[0] ?? '?').toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">
                        {member.firstName || member.lastName
                          ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim()
                          : member.email || 'Unknown user'}
                      </p>
                      {member.email && (
                        <p className="truncate text-[11px] text-[var(--color-text-muted)]">{member.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Role */}
                  <span className={cn('inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold', roleCfg.bg, roleCfg.text)}>
                    {roleCfg.label}
                  </span>

                  {/* Joined */}
                  <p className="text-right text-[12px] text-[var(--color-text-muted)]">{formatShortDate(member.joinedAt)}</p>

                  {/* Actions */}
                  <div className="flex justify-end">
                    {actions.length > 0 && <RowActionsMenu items={actions} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DeleteDialog
        open={!!memberToRemove}
        title="Remove member"
        description="This will remove the member from the workspace. They will lose access to all workspace resources."
        itemLabel={memberToRemove ? (memberToRemove.firstName || memberToRemove.email || 'Unknown') : undefined}
        isDeleting={removing}
        onConfirm={handleRemoveMember}
        onOpenChange={(open) => { if (!open && !removing) setMemberToRemove(null); }}
      />
    </div>
  );
}

function ColHead({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <span className={`text-[11px] font-medium text-[var(--color-text-tertiary)] ${right ? 'text-right' : ''}`}>
      {children}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <User className="h-8 w-8 text-[var(--color-border-input)]" weight="thin" />
      <p className="text-[13px] text-[var(--color-text-muted)]">{text}</p>
    </div>
  );
}
