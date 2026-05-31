'use client';

import { useCallback, useEffect, useState } from 'react';
import { CaretDown, Check, X } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { backendConfig } from '@/lib/auth/config';
import { cn } from '@/lib/utils';

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
  const { activeWorkspace, accessToken } = useWorkspaceContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleRemoveMember = async (userId: string) => {
    if (!activeWorkspace) return;
    const res = await fetch(`${backendConfig.apiBaseUrl}/api/workspaces/${activeWorkspace.id}/members/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json();
      alert(body?.error?.message || 'Failed to remove member');
      return;
    }
    fetchData();
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    if (!activeWorkspace) return;
    const res = await fetch(`${backendConfig.apiBaseUrl}/api/workspaces/${activeWorkspace.id}/members/${userId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const body = await res.json();
      alert(body?.error?.message || 'Failed to update role');
      return;
    }
    fetchData();
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!activeWorkspace) return;
    const res = await fetch(`${backendConfig.apiBaseUrl}/api/workspaces/${activeWorkspace.id}/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json();
      alert(body?.error?.message || 'Failed to cancel invitation');
      return;
    }
    fetchData();
  };

  if (!activeWorkspace) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-[13px] text-[#8d9096]">Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#181d27]">Workspace settings</h1>
        <p className="mt-1 text-[13px] text-[#8d9096]">Manage your workspace, members, and invitations.</p>
      </div>

      {/* Workspace info */}
      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-semibold text-[#181d27]">Workspace</h2>
        <div className="rounded-xl border border-[#f3f4f6] bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f4f5f7] text-sm font-bold text-[#414651]">
              {activeWorkspace.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="text-[14px] font-medium text-[#181d27]">{activeWorkspace.name}</p>
              <p className="text-[12px] text-[#8d9096]">
                {members.length} member{members.length !== 1 ? 's' : ''}
                {activeWorkspace.role === 'owner' && ' · You are the owner'}
                {activeWorkspace.role === 'admin' && ' · You are an admin'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Members */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#181d27]">Members</h2>
          {(activeWorkspace.role === 'owner' || activeWorkspace.role === 'admin') && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('hedwig:open-invite-member'))}
              className="rounded-lg bg-[#2563eb] px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Invite member
            </button>
          )}
        </div>

        {loadingMembers ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-[13px] text-[#8d9096]">Loading members...</p>
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-xl border border-[#f3f4f6] bg-white p-8 text-center">
            <p className="text-[13px] text-[#8d9096]">No members yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#f3f4f6] bg-white">
            {members.map((member, i) => (
              <div
                key={member.id}
                className={cn(
                  'flex items-center gap-3 px-5 py-3',
                  i < members.length - 1 && 'border-b border-[#f3f4f6]'
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4f5f7] text-[12px] font-bold text-[#414651]">
                  {(member.firstName?.[0] ?? member.email?.[0] ?? '?').toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#181d27]">
                    {member.firstName || member.lastName
                      ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim()
                      : member.email || 'Unknown user'}
                  </p>
                  {member.email && (
                    <p className="truncate text-[12px] text-[#8d9096]">{member.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {member.role === 'owner' ? (
                    <span className="rounded-md bg-[#f4f5f7] px-2 py-0.5 text-[11px] font-semibold text-[#525866]">
                      Owner
                    </span>
                  ) : (activeWorkspace.role === 'owner') ? (
                    <RoleDropdown
                      currentRole={member.role}
                      onChange={(role) => handleUpdateRole(member.userId, role)}
                    />
                  ) : (
                    <span className="rounded-md bg-[#f4f5f7] px-2 py-0.5 text-[11px] font-semibold text-[#525866]">
                      {member.role === 'admin' ? 'Admin' : 'Member'}
                    </span>
                  )}
                  {member.role !== 'owner' && (activeWorkspace.role === 'owner' || activeWorkspace.role === 'admin') && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.userId)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#c1c5cd] transition hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" weight="bold" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[15px] font-semibold text-[#181d27]">Pending invitations</h2>
          <div className="rounded-xl border border-[#f3f4f6] bg-white">
            {invitations.filter((inv) => inv.status === 'pending').map((inv, i) => (
              <div
                key={inv.id}
                className={cn(
                  'flex items-center gap-3 px-5 py-3',
                  i < invitations.filter((iv) => iv.status === 'pending').length - 1 && 'border-b border-[#f3f4f6]'
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fef3c7] text-[12px] font-bold text-[#d97706]">
                  {inv.email.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#181d27]">{inv.email}</p>
                  <p className="text-[12px] text-[#8d9096]">
                    {inv.role === 'admin' ? 'Admin' : 'Member'} · Pending
                  </p>
                </div>
                {(activeWorkspace.role === 'owner' || activeWorkspace.role === 'admin') && (
                  <button
                    type="button"
                    onClick={() => handleCancelInvitation(inv.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[#c1c5cd] transition hover:bg-red-50 hover:text-red-500"
                    title="Cancel invitation"
                  >
                    <X className="h-3.5 w-3.5" weight="bold" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RoleDropdown({ currentRole, onChange }: { currentRole: string; onChange: (role: string) => void }) {
  const [open, setOpen] = useState(false);
  const roles = [
    { value: 'admin', label: 'Admin' },
    { value: 'member', label: 'Member' },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 rounded-md bg-[#f4f5f7] px-2 py-0.5 text-[11px] font-semibold text-[#525866] transition hover:bg-[#eef0f3]"
      >
        {currentRole === 'admin' ? 'Admin' : 'Member'}
        <CaretDown className="h-3 w-3" weight="bold" />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 w-32 overflow-hidden rounded-lg border border-[#f3f4f6] bg-white py-1 shadow-lg shadow-black/5">
          {roles.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => { onChange(r.value); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-medium text-[#414651] transition hover:bg-[#f8f9fb]"
            >
              <span className="flex-1">{r.label}</span>
              {r.value === currentRole && (
                <Check className="h-3.5 w-3.5 text-[#2563eb]" weight="bold" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
