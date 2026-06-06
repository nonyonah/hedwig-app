'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { backendConfig } from '@/lib/auth/config';
import { cn } from '@/lib/utils';

interface AssignedMember {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  assignedBy: string;
  payoutAmount?: number | null;
}

interface WorkspaceMemberOption {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: string;
}

type ProjectAssignmentPanelProps = {
  projectId: string;
  canManage: boolean;
};

export function ProjectAssignmentPanel({ projectId, canManage }: ProjectAssignmentPanelProps) {
  const { activeWorkspace, accessToken } = useWorkspaceContext();
  const [assigned, setAssigned] = useState<AssignedMember[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payoutInput, setPayoutInput] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showPayoutInput, setShowPayoutInput] = useState(false);
  const payoutRef = useRef<HTMLInputElement | null>(null);

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

  const fetchData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [assignmentsRes, membersRes] = await Promise.all([
        apiCall(`/api/projects/${projectId}/assignments`, 'GET'),
        apiCall(`/api/workspaces/${activeWorkspace.id}/members`, 'GET'),
      ]);
      const assignments = (assignmentsRes.data?.assignments || []);
      const memberList = (membersRes.data?.members || []);
      setMembers(memberList);

      const enriched = assignments.map((a: any) => {
        const uid = a.user_id || a.userId;
        const memberInfo = memberList.find((m: any) => (m.userId || m.user_id) === uid);
        return {
          userId: uid,
          firstName: memberInfo?.firstName || memberInfo?.first_name,
          lastName: memberInfo?.lastName || memberInfo?.last_name,
          email: memberInfo?.email,
          assignedBy: a.assigned_by || a.assignedBy,
          payoutAmount: a.payout_amount ?? null,
        };
      });
      setAssigned(enriched);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [projectId, activeWorkspace]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const beginAssign = (userId: string) => {
    setSelectedUserId(userId);
    setPayoutInput('');
    setPickerOpen(false);
    setShowPayoutInput(true);
    setTimeout(() => payoutRef.current?.focus(), 50);
  };

  const confirmAssign = async () => {
    if (!selectedUserId) return;
    try {
      await apiCall(`/api/projects/${projectId}/assign`, 'POST', {
        userId: selectedUserId,
        payoutAmount: payoutInput ? parseFloat(payoutInput) : null,
      });
      setShowPayoutInput(false);
      setSelectedUserId(null);
      setPickerOpen(false);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to assign member');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await apiCall(`/api/projects/${projectId}/assign/${userId}`, 'DELETE');
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const assignedIds = new Set(assigned.map((a) => a.userId));
  const unassignedMembers = members.filter((m) => !assignedIds.has(m.userId));

  return (
    <div className="rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between px-5 py-3">
        <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">
          Assigned members
          <span className="ml-1.5 text-[12px] font-normal text-[var(--color-text-tertiary)]">
            {assigned.length}
          </span>
        </h3>
        {canManage && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPickerOpen((p) => !p)}
              className="flex items-center gap-1 text-[12px]"
            >
              <Plus className="h-3.5 w-3.5" weight="bold" />
              Assign
            </Button>
            {pickerOpen && (
              <div className="absolute right-0 top-8 z-50 w-56 overflow-hidden rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] py-1 shadow-lg shadow-[var(--color-foreground)]/5">
                {unassignedMembers.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-[var(--color-text-tertiary)]">
                    All members assigned
                  </p>
                ) : (
                  unassignedMembers.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => beginAssign(m.userId)}
                      className="flex w-full items-center gap-2 rounded-none px-3 py-1.5 text-left text-[13px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)]"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[10px] font-bold text-[var(--color-text-tertiary)]">
                        {(m.firstName?.[0] ?? m.email?.[0] ?? '?').toUpperCase()}
                      </span>
                      <span className="flex-1 truncate">
                        {m.firstName ? `${m.firstName} ${m.lastName ?? ''}`.trim() : m.email}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showPayoutInput && (
        <div className="border-t border-[var(--color-border-light)] px-5 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-[var(--color-text-secondary)] shrink-0">Payout</span>
            <span className="text-[11px] text-[var(--color-text-tertiary)]">$</span>
            <input
              ref={payoutRef}
              type="number"
              min="0"
              step="0.01"
              value={payoutInput}
              onChange={(e) => setPayoutInput(e.target.value)}
              placeholder="0"
              className="w-[70px] rounded-md border border-[var(--color-border)] px-1.5 py-1 text-[13px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20"
            />
            <Button variant="default" size="sm" onClick={confirmAssign}>Add</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPayoutInput(false)} className="text-[11px] text-[var(--color-text-tertiary)]">Cancel</Button>
          </div>
        </div>
      )}

      {assigned.length === 0 ? (
        <div className="border-t border-[var(--color-border-light)] px-5 py-4 text-center">
          <p className="text-[13px] text-[var(--color-text-tertiary)]">
            No members assigned yet.
          </p>
        </div>
      ) : (
        <div className="border-t border-[var(--color-border-light)]">
          {assigned.map((member, i) => (
            <div
              key={member.userId || `assignment-${i}`}
              className={cn(
                'flex items-center gap-3 px-5 py-3',
                i < assigned.length - 1 && 'border-b border-[var(--color-border-light)]'
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[11px] font-bold text-[var(--color-text-secondary)]">
                {(member.firstName?.[0] ?? member.email?.[0] ?? '?').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--color-foreground)]">
                  {member.firstName ? `${member.firstName} ${member.lastName ?? ''}`.trim() : member.email}
                </p>
              </div>
              {member.payoutAmount != null && (
                <span className="rounded-md bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-primary-dark)]">
                  ${Number(member.payoutAmount).toLocaleString()}
                </span>
              )}
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(member.userId)}
                  className="h-7 w-7 rounded-md text-[var(--color-text-placeholder)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                  aria-label="Remove member"
                >
                  <X className="h-3.5 w-3.5" weight="bold" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
