'use client';

import Link from 'next/link';
import { useState, useCallback, useEffect } from 'react';
import { ArrowLeft, CalendarBlank, CheckCircle, CurrencyDollar, FolderSimple, Info, NotePencil, Target } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { hedwigApi } from '@/lib/api/client';
import type { Contract, Invoice, Milestone, Project } from '@/lib/models/entities';
import { cn, formatShortDate } from '@/lib/utils';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { ProjectAssignmentPanel } from '@/components/workspace/project-assignment-panel';
import { ProjectStatusActions } from '@/components/workspace/project-status-actions';
import { useToast } from '@/components/providers/toast-provider';
import { ContextualSuggestions } from '@/components/assistant/contextual-suggestions';
import { useCurrency } from '@/components/providers/currency-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { openPaymentDetail } from '@/lib/payments/open-detail';

const PROJ_STATUS = {
  active:    { label: 'Active',    bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', dot: 'bg-[var(--color-success)]' },
  paused:    { label: 'Paused',    bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]', dot: 'bg-[var(--color-warning)]' },
  completed: { label: 'Completed', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]', dot: 'bg-[var(--color-text-muted)]' },
} as const;

const MILESTONE_STATUS = {
  pending:  { label: 'Pending',  bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
  upcoming: { label: 'Pending',  bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
  due_soon: { label: 'Due soon', bg: 'bg-[var(--color-warning-soft)]',     text: 'text-[var(--color-warning)]' },
  done:     { label: 'Done',     bg: 'bg-[var(--color-success-soft)]',     text: 'text-[var(--color-success)]' },
  invoiced: { label: 'Invoiced', bg: 'bg-[var(--color-accent-soft)]',      text: 'text-[var(--color-accent)]' },
  paid:     { label: 'Paid',     bg: 'bg-[var(--color-success-soft)]',     text: 'text-[var(--color-success)]' },
  late:     { label: 'Late',     bg: 'bg-[var(--color-danger-soft)]',      text: 'text-[var(--color-danger)]' },
} as const;

const INV_STATUS = {
  draft:   { label: 'Draft',   bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
  sent:    { label: 'Sent',    bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  viewed:  { label: 'Viewed',  bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  paid:    { label: 'Paid',    bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  overdue: { label: 'Overdue', bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' },
} as const;

function Pill({ bg, text, label }: { bg: string; text: string; label: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', bg, text)}>
      {label}
    </span>
  );
}

function SectionCard({ title, count, action, children }: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-surface-tertiary)]">
      <div className="flex items-center justify-between border-b border-[var(--color-surface-tertiary)] px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">{title}</h2>
          {typeof count === 'number' && (
            <span className="text-[12px] text-[var(--color-text-muted)]">{count}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">{children}</th>;
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-[13px] text-[var(--color-text-muted)]">{text}</div>;
}

export function ProjectDetailClient({
  initialProject,
  milestones,
  invoices,
  contract,
  highlightedMilestoneId,
  accessToken
}: {
  initialProject: Project;
  milestones: Milestone[];
  invoices: Invoice[];
  contract: Contract | null;
  highlightedMilestoneId?: string | null;
  accessToken: string | null;
}) {
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const { activeWorkspace } = useWorkspaceContext();
  const canManage = activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'admin';
  const isMember = activeWorkspace?.role === 'member';

  useAssistantPageContext('Project Detail', {
    projectName: initialProject.name,
    projectStatus: initialProject.status,
    milestonesCount: milestones.length,
    invoicesCount: invoices.length,
  });

  const [project, setProject] = useState(initialProject);
  const [milestoneList, setMilestoneList] = useState(milestones);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingLinear, setIsCreatingLinear] = useState(false);
  const [linearLinked, setLinearLinked] = useState(false);

  useEffect(() => {
    fetch(`/api/integrations/composio/linear/link/${project.id}`)
      .then((r) => r.json())
      .then((p) => { if (p.success) setLinearLinked(p.data?.linked ?? false); })
      .catch(() => {});
  }, [project.id]);
  const [form, setForm] = useState({
    title: initialProject.name,
    budget: `${initialProject.budgetUsd || ''}`,
    deadline: initialProject.nextDeadlineAt.slice(0, 10),
    status: initialProject.status
  });

  const updateField = (field: keyof typeof form, value: string) =>
    setForm((cur) => ({ ...cur, [field]: value }));

  const openEdit = () => {
    setForm({ title: project.name, budget: `${project.budgetUsd || ''}`, deadline: project.nextDeadlineAt.slice(0, 10), status: project.status });
    setEditOpen(true);
  };

  const saveProject = async () => {
    if (!accessToken) { toast({ type: 'error', title: 'Session expired' }); return; }
    setIsSaving(true);
    try {
      const updated = await hedwigApi.updateProject(
        project.id,
        { title: form.title.trim(), budget: form.budget ? Number(form.budget) : undefined, deadline: form.deadline, status: form.status as Project['status'] },
        { accessToken, disableMockFallback: true }
      );
      setProject({
        ...project,
        ...updated,
        contract: contract ? { id: contract.id, title: contract.title, status: contract.status } : project.contract ?? null
      });
      setEditOpen(false);
      toast({ type: 'success', title: 'Project updated' });
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed to update', message: err?.message });
    } finally {
      setIsSaving(false);
    }
  };

  const completeMilestone = async (milestoneId: string) => {
    if (!accessToken) { toast({ type: 'error', title: 'Session expired' }); return; }
    setCompletingIds((prev) => new Set(prev).add(milestoneId));
    try {
      const resp = await fetch(`/api/backend/api/milestones/${milestoneId}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ skipInvoice: isMember }),
      });
      const data = await resp.json().catch(() => ({ success: false })) as {
        success?: boolean;
        error?: string | { message?: string };
        data?: { invoice?: { id: string }; milestone?: { invoiceId: string } };
      };
      if (!resp.ok || !data.success) {
        const msg = typeof data.error === 'string' ? data.error : (data.error as any)?.message || 'Failed to complete milestone';
        toast({ type: 'error', title: 'Could not complete milestone', message: msg });
        return;
      }
      const invoiceId = data.data?.invoice?.id || data.data?.milestone?.invoiceId;
      setMilestoneList((prev) =>
        prev.map((m) => m.id === milestoneId ? { ...m, status: 'done' as const, invoiceId } : m)
      );
      toast({
        type: 'success',
        title: 'Milestone complete — invoice sent',
        message: invoiceId ? `Invoice created and sent to client.` : 'Invoice created for this milestone.',
      });
    } catch {
      toast({ type: 'error', title: 'Network error', message: 'Could not reach backend.' });
    } finally {
      setCompletingIds((prev) => { const next = new Set(prev); next.delete(milestoneId); return next; });
    }
  };

  const handleCreateLinear = useCallback(async () => {
    setIsCreatingLinear(true);
    try {
      const resp = await fetch('/api/integrations/composio/linear/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          description: '',
          dueDate: project.nextDeadlineAt || '',
          hedwigProjectId: project.id,
        }),
      });
      const payload = await resp.json();
      if (payload.success && payload.data?.success) {
        setLinearLinked(true);
        const ms = payload.data.milestonesSynced;
        const msg = ms && ms > 0 ? `Project created in Linear with ${ms} milestone${ms !== 1 ? 's' : ''}.` : 'Project created in Linear.';
        toast({ type: 'success', title: 'Synced to Linear', message: msg });
      } else {
        const err = payload.data?.error || payload.error || '';
        if (err.includes('not connected')) {
          toast({ type: 'info', title: 'Linear not connected', message: 'Connect Linear in Settings first.' });
        } else {
          toast({ type: 'error', title: 'Linear create failed', message: err || 'Please try again.' });
        }
      }
    } catch {
      toast({ type: 'error', title: 'Linear create failed', message: 'Could not reach the server.' });
    } finally {
      setIsCreatingLinear(false);
    }
  }, [project, toast]);

  const handleSyncLinearStatus = useCallback(async () => {
    setIsCreatingLinear(true);
    try {
      const resp = await fetch('/api/integrations/composio/linear/sync-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hedwigProjectId: project.id }),
      });
      const payload = await resp.json();
      if (payload.success && payload.data?.success) {
        const label = payload.data.linearStatus || 'synced';
        const updated = payload.data.hedwigStatusUpdated;
        toast({ type: 'success', title: 'Synced', message: `Linear: ${label}${updated ? ' · Hedwig status updated' : ''}` });
      } else {
        const err = payload.data?.error || payload.error || '';
        if (err.includes('not connected')) {
          toast({ type: 'info', title: 'Linear not connected', message: 'Connect Linear in Settings first.' });
        } else {
          toast({ type: 'error', title: 'Linear sync failed', message: err || 'Please try again.' });
        }
      }
    } catch {
      toast({ type: 'error', title: 'Linear sync failed', message: 'Could not reach the server.' });
    } finally {
      setIsCreatingLinear(false);
    }
  }, [project.id, toast]);

  const completedMilestones = milestoneList.filter((m) => m.status === 'done' || m.status === 'paid' || m.status === 'invoiced').length;
  const highlightedMilestone = milestoneList.find((m) => m.id === highlightedMilestoneId) ?? null;
  const s = PROJ_STATUS[project.status] ?? PROJ_STATUS.active;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px]">
        <Link href="/projects" className="flex items-center gap-1.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]">
          <ArrowLeft className="h-3 w-3" weight="bold" />
          Projects
        </Link>
        <span className="text-[var(--color-border)]">/</span>
        <span className="text-[var(--color-text-secondary)]">{project.name}</span>
      </div>

      {/* Calendar context banner */}
      {highlightedMilestone && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-primary-light)] bg-[var(--color-accent-soft)] px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" weight="fill" />
          <p className="text-[13px] text-[var(--color-primary-dark)]">
            Milestone <span className="font-semibold">{highlightedMilestone.name}</span> is{' '}
            <span className="font-semibold">{MILESTONE_STATUS[highlightedMilestone.status]?.label ?? highlightedMilestone.status}</span>{' '}
            — due {formatShortDate(highlightedMilestone.dueAt)}.
          </p>
        </div>
      )}

      {/* Record header */}
      <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-surface-tertiary)]">
        <div className="flex items-center justify-between border-b border-[var(--color-surface-tertiary)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-secondary)]">
              <FolderSimple className="h-4 w-4 text-[var(--color-text-tertiary)]" weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold text-[var(--color-text-primary)]">{project.name}</h1>
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', s.bg, s.text)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
                  {s.label}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
                {project.ownerName} · {completedMilestones}/{milestoneList.length} milestones
                {isMember && project.memberPayout != null
                  ? ` · ${formatAmount(project.memberPayout, { compact: true })} your pay`
                  : !isMember && project.budgetUsd > 0 ? ` · ${formatAmount(project.budgetUsd, { compact: true })} budget` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ProjectStatusActions
              status={project.status as any}
              role={activeWorkspace?.role ?? null}
              onStatusChange={async (newStatus) => {
                await hedwigApi.updateProject(project.id, { status: newStatus as any }, { accessToken: accessToken ?? '' });
                setProject({ ...project, status: newStatus as any });
              }}
            />
            <div className="h-5 w-px bg-[var(--color-border-light)]" />
            {linearLinked ? (
              <Button size="sm" variant="secondary" onClick={handleSyncLinearStatus} disabled={isCreatingLinear} title="Re-sync project status with Linear">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
                </svg>
                {isCreatingLinear ? 'Syncing…' : 'Synced'}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={handleCreateLinear} disabled={isCreatingLinear} title="Sync with Linear">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M3 12c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9-9-4.03-9-9zm2.5 0c0 3.59 2.91 6.5 6.5 6.5s6.5-2.91 6.5-6.5-2.91-6.5-6.5-6.5-6.5 2.91-6.5 6.5zM12 7v5l4 2" />
                </svg>
                {isCreatingLinear ? 'Creating…' : 'Sync with Linear'}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={openEdit}>
              <NotePencil className="h-3.5 w-3.5" weight="bold" />
              Edit
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 border-b border-[var(--color-surface-secondary)] px-5 py-3">
          <span className="w-[120px] shrink-0 text-[12px] text-[var(--color-text-muted)]">Progress</span>
          <div className="flex flex-1 items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
              <div className="h-full rounded-full bg-[var(--color-accent)] transition-all" style={{ width: `${project.progress}%` }} />
            </div>
            <span className="w-8 text-right text-[12px] tabular-nums text-[var(--color-text-tertiary)]">{project.progress}%</span>
          </div>
        </div>

        {/* Details rows */}
        <div className="divide-y divide-[var(--color-surface-secondary)] px-5">
          {[
            { label: 'Deadline', value: formatShortDate(project.nextDeadlineAt), icon: <CalendarBlank className="h-3.5 w-3.5" /> },
            { label: isMember && project.memberPayout != null ? 'Your pay' : 'Budget', value: isMember && project.memberPayout != null ? formatAmount(project.memberPayout) : formatAmount(project.budgetUsd), icon: <CurrencyDollar className="h-3.5 w-3.5" /> },
            { label: 'Owner',    value: project.ownerName, icon: <Target className="h-3.5 w-3.5" /> },
            { label: 'Contract', value: project.contract?.title ?? null, icon: <Info className="h-3.5 w-3.5" /> },
          ].filter(row => !isMember || row.label !== 'Contract').map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-3 py-2.5">
              <div className="flex w-[120px] shrink-0 items-center gap-2 text-[var(--color-text-muted)]">
                {icon}
                <span className="text-[12px] text-[var(--color-text-muted)]">{label}</span>
              </div>
              <span className="text-[13px] text-[var(--color-text-secondary)]">
                {value || <span className="text-[var(--color-border-input)]">—</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ContextualSuggestions
        title="Project suggestions"
        description="Hedwig keeps project recommendations tied to this workspace instead of sending them to a queue."
        query={{ projectId: project.id, types: ['project_action', 'calendar_event'], limit: 2 }}
      />

      {/* Two-column: related records */}
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {/* Milestones */}
          <SectionCard title="Milestones" count={milestoneList.length}>
            {milestoneList.length === 0 ? (
              <EmptyRow text="No milestones on this project yet." />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--color-surface-tertiary)]">
                    <ColHead>Milestone</ColHead>
                    <ColHead>Status</ColHead>
                    <ColHead>Due</ColHead>
                    <ColHead>Amount</ColHead>
                    <ColHead><span className="sr-only">Actions</span></ColHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-surface-secondary)]">
                  {milestoneList.map((m) => {
                    const ms = MILESTONE_STATUS[m.status] ?? { label: m.status, bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' };
                    const canComplete = (m.status === 'pending' || m.status === 'done' || m.status === 'upcoming') && !m.invoiceId;
                    const canApprove = m.status === 'done' && !m.invoiceId && canManage;
                    const isCompleting = completingIds.has(m.id);
                    return (
                      <tr
                        key={m.id}
                        className={cn('transition-colors', m.id === highlightedMilestoneId ? 'bg-[var(--color-accent-soft)]' : 'hover:bg-[var(--color-background)]')}
                      >
                        <td className="px-5 py-2.5">
                          <p className="text-[13px] font-medium text-[var(--color-foreground)]">{m.name}</p>
                          {m.id === highlightedMilestoneId && (
                            <span className="text-[11px] font-medium text-[var(--color-accent)]">From calendar</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5"><Pill bg={ms.bg} text={ms.text} label={ms.label} /></td>
                        <td className="px-5 py-2.5 text-[12px] text-[var(--color-text-muted)]">{formatShortDate(m.dueAt)}</td>
                        <td className="px-5 py-2.5 text-[13px] tabular-nums text-[var(--color-text-tertiary)]">{isMember ? '—' : (m.amountUsd ? formatAmount(m.amountUsd, { compact: true }) : '—')}</td>
                        <td className="px-5 py-2.5 text-right">
                          {canComplete && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => completeMilestone(m.id)}
                              disabled={isCompleting}
                              className="rounded-full px-3 py-1 text-[11px] font-semibold"
                            >
                              <CheckCircle className={cn('h-3.5 w-3.5', isCompleting ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-success)]')} weight="fill" />
                              {isCompleting ? 'Sending…' : 'Mark complete'}
                            </Button>
                          )}
                          {canApprove && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => completeMilestone(m.id)}
                              disabled={isCompleting}
                              className="rounded-full bg-[var(--color-success-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--color-success)]"
                            >
                              <CheckCircle className="h-3.5 w-3.5 text-[var(--color-success)]" weight="fill" />
                              {isCompleting ? 'Invoicing…' : 'Approve & invoice'}
                            </Button>
                          )}
                          {m.status === 'done' && m.invoiceId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPaymentDetail('invoice', m.invoiceId!)}
                              className="text-[11px] font-medium text-[var(--color-accent)] hover:underline"
                            >
                              View invoice
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          {/* Assigned members */}
          <ProjectAssignmentPanel projectId={project.id} canManage={canManage} />
          {/* Contract — hidden from members */}
          {!isMember && (
          <SectionCard title="Contract">
            {!contract ? (
              <EmptyRow text="No contract linked." />
            ) : (
              <Link href={`/contracts?contract=${contract.id}`} className="block px-5 py-3 transition-colors hover:bg-[var(--color-background)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--color-foreground)]">{contract.title}</p>
                    {contract.signedAt && (
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Signed {formatShortDate(contract.signedAt)}</p>
                    )}
                  </div>
                  {(() => {
                    const cs = contract.status === 'signed'
                      ? { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }
                      : contract.status === 'review'
                      ? { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' }
                      : { bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' };
                    return <Pill bg={cs.bg} text={cs.text} label={contract.status} />;
                  })()}
                </div>
              </Link>
            )}
          </SectionCard>
          )}

          {/* Invoices — hidden from members */}
          {!isMember && (
          <SectionCard
            title="Invoices"
            count={invoices.length}
            action={
              invoices.length > 5 ? (
                <Link href={`/payments?project=${project.id}`} className="text-[12px] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]">
                  See all
                </Link>
              ) : undefined
            }
          >
            {invoices.length === 0 ? (
              <EmptyRow text="No invoices for this project." />
            ) : (
              <div className="divide-y divide-[var(--color-surface-secondary)]">
                {invoices.slice(0, 5).map((inv) => {
                  const is = INV_STATUS[inv.status] ?? INV_STATUS.draft;
                  return (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => openPaymentDetail('invoice', inv.id)}
                      className="flex w-full items-center justify-between px-5 py-2.5 text-left transition-colors hover:bg-[var(--color-background)]"
                    >
                      <div>
                        <p className="text-[13px] font-medium text-[var(--color-foreground)]">{inv.number}</p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">Due {formatShortDate(inv.dueAt)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">{formatAmount(inv.amountUsd, { compact: true })}</span>
                        <Pill bg={is.bg} text={is.text} label={is.label} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => !isSaving && setEditOpen(v)}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>Update settings for {project.name}.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">Title <span className="text-[var(--color-danger)]">*</span></label>
              <Input value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="Project title" disabled={isSaving} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">Budget (USD)</label>
              <Input type="number" value={form.budget} onChange={(e) => updateField('budget', e.target.value)} placeholder="0" disabled={isSaving} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">Deadline</label>
              <Input type="date" value={form.deadline} onChange={(e) => updateField('deadline', e.target.value)} disabled={isSaving} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">Status</label>
              <div className="flex h-9 w-full items-center rounded-lg border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 shadow-xs">
                <select
                  className="w-full bg-transparent text-[13px] text-[var(--color-text-primary)] outline-none"
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  disabled={isSaving}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="review">In review</option>
                  <option value="approved">Approved</option>
                  <option value="changes_requested">Changes requested</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary" disabled={isSaving}>Cancel</Button></DialogClose>
            <Button onClick={saveProject} disabled={isSaving || !form.title.trim()}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
