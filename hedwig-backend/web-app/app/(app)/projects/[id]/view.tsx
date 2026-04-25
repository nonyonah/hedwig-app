'use client';

import Link from 'next/link';
import { useState } from 'react';
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
import { cn, formatCompactCurrency, formatShortDate } from '@/lib/utils';
import { useToast } from '@/components/providers/toast-provider';

const PROJ_STATUS = {
  active:    { label: 'Active',    bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]', dot: 'bg-[#12b76a]' },
  paused:    { label: 'Paused',    bg: 'bg-[#fffaeb]', text: 'text-[#92400e]', dot: 'bg-[#f59e0b]' },
  completed: { label: 'Completed', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]', dot: 'bg-[#a4a7ae]' },
} as const;

const MILESTONE_STATUS = {
  upcoming: { label: 'Upcoming', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
  due_soon: { label: 'Due soon', bg: 'bg-[#fffaeb]', text: 'text-[#92400e]' },
  done:     { label: 'Done',     bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  late:     { label: 'Late',     bg: 'bg-[#fff1f0]', text: 'text-[#b42318]' },
} as const;

const INV_STATUS = {
  draft:   { label: 'Draft',   bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
  sent:    { label: 'Sent',    bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  viewed:  { label: 'Viewed',  bg: 'bg-[#f0f9ff]', text: 'text-[#0e7490]' },
  paid:    { label: 'Paid',    bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  overdue: { label: 'Overdue', bg: 'bg-[#fff1f0]', text: 'text-[#b42318]' },
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
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#f2f4f7]">
      <div className="flex items-center justify-between border-b border-[#f2f4f7] px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[#181d27]">{title}</h2>
          {typeof count === 'number' && (
            <span className="text-[12px] text-[#c1c5cd]">{count}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">{children}</th>;
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-[13px] text-[#a4a7ae]">{text}</div>;
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
  const [project, setProject] = useState(initialProject);
  const [milestoneList, setMilestoneList] = useState(milestones);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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

  const completedMilestones = milestoneList.filter((m) => m.status === 'done').length;
  const highlightedMilestone = milestoneList.find((m) => m.id === highlightedMilestoneId) ?? null;
  const s = PROJ_STATUS[project.status] ?? PROJ_STATUS.active;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px]">
        <Link href="/projects" className="flex items-center gap-1.5 text-[#a4a7ae] transition-colors hover:text-[#525866]">
          <ArrowLeft className="h-3 w-3" weight="bold" />
          Projects
        </Link>
        <span className="text-[#e9eaeb]">/</span>
        <span className="text-[#525866]">{project.name}</span>
      </div>

      {/* Calendar context banner */}
      {highlightedMilestone && (
        <div className="flex items-start gap-3 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" weight="fill" />
          <p className="text-[13px] text-[#1d4ed8]">
            Milestone <span className="font-semibold">{highlightedMilestone.name}</span> is{' '}
            <span className="font-semibold">{MILESTONE_STATUS[highlightedMilestone.status]?.label ?? highlightedMilestone.status}</span>{' '}
            — due {formatShortDate(highlightedMilestone.dueAt)}.
          </p>
        </div>
      )}

      {/* Record header */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#f2f4f7]">
        <div className="flex items-center justify-between border-b border-[#f2f4f7] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f5]">
              <FolderSimple className="h-4 w-4 text-[#8d9096]" weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold text-[#181d27]">{project.name}</h1>
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', s.bg, s.text)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
                  {s.label}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[#a4a7ae]">
                {project.ownerName} · {completedMilestones}/{milestoneList.length} milestones · {formatCompactCurrency(project.budgetUsd)} budget
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={openEdit}>
            <NotePencil className="h-3.5 w-3.5" weight="bold" />
            Edit
          </Button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 border-b border-[#f9fafb] px-5 py-3">
          <span className="w-[120px] shrink-0 text-[12px] text-[#a4a7ae]">Progress</span>
          <div className="flex flex-1 items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f2f4f7]">
              <div className="h-full rounded-full bg-[#2563eb] transition-all" style={{ width: `${project.progress}%` }} />
            </div>
            <span className="w-8 text-right text-[12px] tabular-nums text-[#8d9096]">{project.progress}%</span>
          </div>
        </div>

        {/* Details rows */}
        <div className="divide-y divide-[#f9fafb] px-5">
          {[
            { label: 'Deadline', value: formatShortDate(project.nextDeadlineAt), icon: <CalendarBlank className="h-3.5 w-3.5" /> },
            { label: 'Budget',   value: formatCompactCurrency(project.budgetUsd), icon: <CurrencyDollar className="h-3.5 w-3.5" /> },
            { label: 'Owner',    value: project.ownerName, icon: <Target className="h-3.5 w-3.5" /> },
            { label: 'Contract', value: project.contract?.title ?? null, icon: <Info className="h-3.5 w-3.5" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-3 py-2.5">
              <div className="flex w-[120px] shrink-0 items-center gap-2 text-[#c1c5cd]">
                {icon}
                <span className="text-[12px] text-[#a4a7ae]">{label}</span>
              </div>
              <span className="text-[13px] text-[#414651]">
                {value || <span className="text-[#d0d5dd]">—</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

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
                  <tr className="border-b border-[#f2f4f7]">
                    <ColHead>Milestone</ColHead>
                    <ColHead>Status</ColHead>
                    <ColHead>Due</ColHead>
                    <ColHead>Amount</ColHead>
                    <ColHead><span className="sr-only">Actions</span></ColHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f9fafb]">
                  {milestoneList.map((m) => {
                    const ms = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.upcoming;
                    const canComplete = m.status !== 'done' && !m.invoiceId;
                    const isCompleting = completingIds.has(m.id);
                    return (
                      <tr
                        key={m.id}
                        className={cn('transition-colors', m.id === highlightedMilestoneId ? 'bg-[#f0f7ff]' : 'hover:bg-[#fafafa]')}
                      >
                        <td className="px-5 py-2.5">
                          <p className="text-[13px] font-medium text-[#252b37]">{m.name}</p>
                          {m.id === highlightedMilestoneId && (
                            <span className="text-[11px] font-medium text-[#2563eb]">From calendar</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5"><Pill bg={ms.bg} text={ms.text} label={ms.label} /></td>
                        <td className="px-5 py-2.5 text-[12px] text-[#a4a7ae]">{formatShortDate(m.dueAt)}</td>
                        <td className="px-5 py-2.5 text-[13px] tabular-nums text-[#8d9096]">{m.amountUsd ? formatCompactCurrency(m.amountUsd) : '—'}</td>
                        <td className="px-5 py-2.5 text-right">
                          {canComplete && (
                            <button
                              onClick={() => completeMilestone(m.id)}
                              disabled={isCompleting}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1 text-[11px] font-semibold text-[#414651] transition-colors hover:bg-[#f9fafb] disabled:opacity-50"
                            >
                              <CheckCircle className={cn('h-3.5 w-3.5', isCompleting ? 'text-[#c1c5cd]' : 'text-[#12b76a]')} weight="fill" />
                              {isCompleting ? 'Sending…' : 'Mark complete'}
                            </button>
                          )}
                          {m.status === 'done' && m.invoiceId && (
                            <Link
                              href={`/invoices/${m.invoiceId}`}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2563eb] hover:underline"
                            >
                              View invoice
                            </Link>
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
          {/* Contract */}
          <SectionCard title="Contract">
            {!contract ? (
              <EmptyRow text="No contract linked." />
            ) : (
              <Link href={`/contracts?contract=${contract.id}`} className="block px-5 py-3 transition-colors hover:bg-[#fafafa]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-[#252b37]">{contract.title}</p>
                    {contract.signedAt && (
                      <p className="mt-0.5 text-[11px] text-[#a4a7ae]">Signed {formatShortDate(contract.signedAt)}</p>
                    )}
                  </div>
                  {(() => {
                    const cs = contract.status === 'signed'
                      ? { bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' }
                      : contract.status === 'review'
                      ? { bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' }
                      : { bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' };
                    return <Pill bg={cs.bg} text={cs.text} label={contract.status} />;
                  })()}
                </div>
              </Link>
            )}
          </SectionCard>

          {/* Invoices */}
          <SectionCard
            title="Invoices"
            count={invoices.length}
            action={
              invoices.length > 5 ? (
                <Link href={`/payments?project=${project.id}`} className="text-[12px] font-medium text-[#a4a7ae] transition-colors hover:text-[#525866]">
                  See all
                </Link>
              ) : undefined
            }
          >
            {invoices.length === 0 ? (
              <EmptyRow text="No invoices for this project." />
            ) : (
              <div className="divide-y divide-[#f9fafb]">
                {invoices.slice(0, 5).map((inv) => {
                  const is = INV_STATUS[inv.status] ?? INV_STATUS.draft;
                  return (
                    <Link key={inv.id} href={`/payments?invoice=${inv.id}`} className="flex items-center justify-between px-5 py-2.5 transition-colors hover:bg-[#fafafa]">
                      <div>
                        <p className="text-[13px] font-medium text-[#252b37]">{inv.number}</p>
                        <p className="text-[11px] text-[#a4a7ae]">Due {formatShortDate(inv.dueAt)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[13px] font-semibold tabular-nums text-[#252b37]">{formatCompactCurrency(inv.amountUsd)}</span>
                        <Pill bg={is.bg} text={is.text} label={is.label} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </SectionCard>
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
              <label className="mb-1.5 block text-[12px] font-semibold text-[#525866]">Title <span className="text-[#f04438]">*</span></label>
              <Input value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="Project title" disabled={isSaving} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#525866]">Budget (USD)</label>
              <Input type="number" value={form.budget} onChange={(e) => updateField('budget', e.target.value)} placeholder="0" disabled={isSaving} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#525866]">Deadline</label>
              <Input type="date" value={form.deadline} onChange={(e) => updateField('deadline', e.target.value)} disabled={isSaving} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#525866]">Status</label>
              <div className="flex h-9 w-full items-center rounded-lg border border-[#d5d7da] bg-white px-3 shadow-xs">
                <select
                  className="w-full bg-transparent text-[13px] text-[#181d27] outline-none"
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  disabled={isSaving}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
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
