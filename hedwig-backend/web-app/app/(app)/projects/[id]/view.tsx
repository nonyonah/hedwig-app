'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, CalendarBlank, CurrencyDollar, FileText, Info, NotePencil, Target } from '@phosphor-icons/react/dist/ssr';
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

/* ── Helpers ────────────────────────────────────────────────────── */
const PROJ_STATUS_STYLES: Record<Project['status'], string> = {
  active:    'bg-[#dbeafe] text-[#1d4ed8]',
  paused:    'bg-[#fef9c3] text-[#854d0e]',
  completed: 'bg-[#dcfce7] text-[#15803d]'
};

const MILESTONE_STATUS_STYLES: Record<Milestone['status'], string> = {
  upcoming: 'bg-[#f4f4f5] text-[#71717a]',
  due_soon: 'bg-[#fef9c3] text-[#854d0e]',
  done:     'bg-[#dcfce7] text-[#15803d]',
  late:     'bg-[#fee2e2] text-[#dc2626]'
};
const MILESTONE_STATUS_LABEL: Record<Milestone['status'], string> = {
  upcoming: 'Upcoming', due_soon: 'Due soon', done: 'Done', late: 'Late'
};

const INV_STATUS_STYLES: Record<Invoice['status'], string> = {
  draft:   'bg-[#f4f4f5] text-[#71717a]',
  sent:    'bg-[#dbeafe] text-[#1d4ed8]',
  paid:    'bg-[#dcfce7] text-[#15803d]',
  overdue: 'bg-[#fee2e2] text-[#dc2626]'
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize', className)}>
      {label}
    </span>
  );
}

function DetailRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-[#f2f4f7] last:border-0">
      <div className="flex items-center gap-2 min-w-[130px]">
        {icon && <span className="text-[#a4a7ae]">{icon}</span>}
        <span className="text-[13px] text-[#717680]">{label}</span>
      </div>
      <span className="text-[13px] font-medium text-[#181d27] text-right">{value || <span className="text-[#d0d5dd]">—</span>}</span>
    </div>
  );
}

function SectionCard({
  title,
  action,
  children,
  className
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl bg-white ring-1 ring-[#e9eaeb]', className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#f2f4f7]">
        <h2 className="text-[14px] font-semibold text-[#181d27]">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-5 py-8 text-center text-[13px] text-[#a4a7ae]">{text}</div>;
}

/* ── Main component ─────────────────────────────────────────────── */
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
    setForm({
      title: project.name,
      budget: `${project.budgetUsd || ''}`,
      deadline: project.nextDeadlineAt.slice(0, 10),
      status: project.status
    });
    setEditOpen(true);
  };

  const saveProject = async () => {
    if (!accessToken) {
      toast({ type: 'error', title: 'Session expired', message: 'Please sign in again.' });
      return;
    }
    setIsSaving(true);
    try {
      const updated = await hedwigApi.updateProject(
        project.id,
        {
          title: form.title.trim(),
          budget: form.budget ? Number(form.budget) : undefined,
          deadline: form.deadline,
          status: form.status as Project['status']
        },
        { accessToken, disableMockFallback: true }
      );
      setProject({
        ...project,
        ...updated,
        contract: contract
          ? { id: contract.id, title: contract.title, status: contract.status }
          : project.contract ?? null
      });
      setEditOpen(false);
      toast({ type: 'success', title: 'Project updated' });
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed to update', message: err?.message });
    } finally {
      setIsSaving(false);
    }
  };

  const highlightedMilestone = milestones.find((m) => m.id === highlightedMilestoneId) ?? null;
  const completedMilestones = milestones.filter((m) => m.status === 'done').length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link href="/projects" className="flex items-center gap-1.5 text-[#717680] hover:text-[#414651] transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" weight="bold" />
          Projects
        </Link>
        <span className="text-[#d0d5dd]">/</span>
        <span className="font-medium text-[#181d27]">{project.name}</span>
      </div>

      {/* Calendar context banner */}
      {highlightedMilestone && (
        <div className="flex items-start gap-3 rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" weight="fill" />
          <div>
            <p className="text-[13px] font-semibold text-[#1d4ed8]">Opened from calendar</p>
            <p className="mt-0.5 text-[13px] text-[#3b82f6]">
              Milestone <span className="font-semibold">{highlightedMilestone.name}</span> is{' '}
              <span className="font-semibold">{MILESTONE_STATUS_LABEL[highlightedMilestone.status]}</span> — due{' '}
              {formatShortDate(highlightedMilestone.dueAt)}.
            </p>
          </div>
        </div>
      )}

      {/* Page hero */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#2563eb]/10 text-[#2563eb] shadow-sm ring-1 ring-[#2563eb]/20">
            <Target className="h-6 w-6" weight="bold" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[22px] font-semibold text-[#181d27] leading-tight">{project.name}</h1>
              <Badge label={project.status} className={PROJ_STATUS_STYLES[project.status]} />
            </div>
            <p className="mt-0.5 text-[14px] text-[#717680]">
              {project.ownerName} · {completedMilestones}/{milestones.length} milestones
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openEdit}>
          <NotePencil className="h-4 w-4" weight="bold" />
          Edit
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: 'Progress',
            value: `${project.progress}%`,
            icon: <Target className="h-4 w-4 text-[#2563eb]" weight="fill" />,
            extra: (
              <div className="mt-2 h-1.5 w-full rounded-full bg-[#f2f4f7] overflow-hidden">
                <div className="h-full rounded-full bg-[#2563eb] transition-all" style={{ width: `${project.progress}%` }} />
              </div>
            )
          },
          { label: 'Budget', value: formatCompactCurrency(project.budgetUsd), icon: <CurrencyDollar className="h-4 w-4 text-[#059669]" weight="fill" />, extra: null },
          { label: 'Next deadline', value: formatShortDate(project.nextDeadlineAt), icon: <CalendarBlank className="h-4 w-4 text-[#f59e0b]" weight="fill" />, extra: null },
          { label: 'Milestones done', value: `${completedMilestones} / ${milestones.length}`, icon: <FileText className="h-4 w-4 text-[#717680]" weight="fill" />, extra: null }
        ].map((m) => (
          <div key={m.label} className="rounded-xl bg-white ring-1 ring-[#e9eaeb] px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1">{m.icon}<span className="text-[12px] text-[#717680]">{m.label}</span></div>
            <p className="text-[20px] font-semibold text-[#181d27]">{m.value}</p>
            {m.extra}
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* Details */}
          <SectionCard
            title="Details"
            action={
              <button onClick={openEdit} className="text-[13px] font-medium text-[#2563eb] hover:text-[#1d4ed8] transition-colors">
                Edit
              </button>
            }
          >
            <div className="px-5">
              <DetailRow label="Title" value={project.name} icon={<Target className="h-3.5 w-3.5" weight="regular" />} />
              <DetailRow label="Status" value={project.status.charAt(0).toUpperCase() + project.status.slice(1)} icon={<Info className="h-3.5 w-3.5" weight="regular" />} />
              <DetailRow label="Budget" value={formatCompactCurrency(project.budgetUsd)} icon={<CurrencyDollar className="h-3.5 w-3.5" weight="regular" />} />
              <DetailRow label="Next deadline" value={formatShortDate(project.nextDeadlineAt)} icon={<CalendarBlank className="h-3.5 w-3.5" weight="regular" />} />
              <DetailRow label="Owner" value={project.ownerName} icon={<FileText className="h-3.5 w-3.5" weight="regular" />} />
              <DetailRow label="Contract" value={project.contract?.title ?? null} icon={<FileText className="h-3.5 w-3.5" weight="regular" />} />
            </div>
          </SectionCard>

          {/* Milestones */}
          <SectionCard title={`Milestones (${milestones.length})`}>
            {milestones.length === 0 ? (
              <EmptyRow text="No milestones on this project yet." />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#f2f4f7]">
                    {['Milestone', 'Status', 'Due', 'Amount'].map((h) => (
                      <th key={h} className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#a4a7ae]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f4f7]">
                  {milestones.map((m) => (
                    <tr
                      key={m.id}
                      className={cn(
                        'transition-colors',
                        m.id === highlightedMilestoneId ? 'bg-[#eff6ff]' : 'hover:bg-[#fafafa]'
                      )}
                    >
                      <td className="px-5 py-3">
                        <p className="text-[13px] font-medium text-[#181d27]">{m.name}</p>
                        {m.id === highlightedMilestoneId && (
                          <span className="text-[11px] text-[#2563eb] font-semibold">Opened from calendar</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge label={MILESTONE_STATUS_LABEL[m.status]} className={MILESTONE_STATUS_STYLES[m.status]} />
                      </td>
                      <td className="px-5 py-3 text-[13px] text-[#414651]">{formatShortDate(m.dueAt)}</td>
                      <td className="px-5 py-3 text-[13px] text-[#414651]">{m.amountUsd ? formatCompactCurrency(m.amountUsd) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          {/* Contract */}
          <SectionCard title="Contract">
            {!contract ? (
              <EmptyRow text="No contract linked to this project." />
            ) : (
              <Link href={`/contracts?contract=${contract.id}`} className="block px-5 py-4 hover:bg-[#fafafa] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[#181d27]">{contract.title}</p>
                    {contract.signedAt && (
                      <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Signed {formatShortDate(contract.signedAt)}</p>
                    )}
                  </div>
                  <Badge
                    label={contract.status}
                    className={
                      contract.status === 'signed' ? 'bg-[#dcfce7] text-[#15803d]' :
                      contract.status === 'review' ? 'bg-[#dbeafe] text-[#1d4ed8]' :
                      'bg-[#f4f4f5] text-[#71717a]'
                    }
                  />
                </div>
              </Link>
            )}
          </SectionCard>

          {/* Invoices */}
          <SectionCard
            title={`Invoices (${invoices.length})`}
            action={
              invoices.length > 4 ? (
                <Link
                  href={`/payments?project=${project.id}`}
                  className="text-[13px] font-medium text-[#2563eb] hover:text-[#1d4ed8] transition-colors"
                >
                  See all
                </Link>
              ) : undefined
            }
          >
            {invoices.length === 0 ? (
              <EmptyRow text="No invoices for this project yet." />
            ) : (
              <div className="divide-y divide-[#f2f4f7]">
                {invoices.slice(0, 4).map((inv) => (
                  <Link key={inv.id} href={`/payments?invoice=${inv.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-[#fafafa] transition-colors">
                    <div>
                      <p className="text-[13px] font-medium text-[#181d27]">{inv.number}</p>
                      <p className="text-[12px] text-[#a4a7ae]">Due {formatShortDate(inv.dueAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[13px] font-semibold text-[#181d27]">{formatCompactCurrency(inv.amountUsd)}</span>
                      <Badge label={inv.status} className={INV_STATUS_STYLES[inv.status]} />
                    </div>
                  </Link>
                ))}
                {invoices.length > 4 && (
                  <Link
                    href={`/payments?project=${project.id}`}
                    className="flex items-center justify-center px-5 py-3 text-[13px] font-medium text-[#2563eb] hover:bg-[#f5f8ff] transition-colors"
                  >
                    See all {invoices.length} invoices →
                  </Link>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => !isSaving && setEditOpen(v)}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>Update the settings for {project.name}.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">
                Title <span className="text-[#f04438]">*</span>
              </label>
              <Input
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Project title"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Budget (USD)</label>
              <Input
                type="number"
                value={form.budget}
                onChange={(e) => updateField('budget', e.target.value)}
                placeholder="0"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Deadline</label>
              <Input
                type="date"
                value={form.deadline}
                onChange={(e) => updateField('deadline', e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Status</label>
              <div className="flex h-10 w-full items-center rounded-lg border border-[#d5d7da] bg-white px-3.5 shadow-xs">
                <select
                  className="w-full bg-transparent text-[14px] text-[#181d27] outline-none"
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
            <DialogClose asChild>
              <Button variant="secondary" disabled={isSaving}>Cancel</Button>
            </DialogClose>
            <Button onClick={saveProject} disabled={isSaving || !form.title.trim()}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
