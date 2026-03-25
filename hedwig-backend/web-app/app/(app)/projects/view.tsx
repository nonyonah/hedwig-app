'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle, ClockCountdown, FolderSimple, Plus, Trash } from '@/components/ui/lucide-icons';
import type { Client, Project } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import type { CreateProjectFlowInput } from '@/lib/api/client';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { PageHeader } from '@/components/data/page-header';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { cn, formatCompactCurrency, formatShortDate } from '@/lib/utils';

const PROJECT_STATUS = {
  active:    { dot: 'bg-[#12b76a]', label: 'Active',    bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  paused:    { dot: 'bg-[#f59e0b]', label: 'Paused',    bg: 'bg-[#fffaeb]', text: 'text-[#92400e]' },
  completed: { dot: 'bg-[#a4a7ae]', label: 'Completed', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
} as const;

const CONTRACT_STATUS = {
  draft:  { bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
  review: { bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  signed: { bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
} as const;

const STATUS_FILTERS = ['all', 'active', 'paused', 'completed'] as const;

type MilestoneForm = { id: string; title: string; amount: string; dueDate: string };

const mkMilestone = (label = ''): MilestoneForm => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: label, amount: '', dueDate: ''
});

const initialForm = { title: '', description: '', budget: '', deadline: '', clientId: '', clientName: '', clientEmail: '' };

export function ProjectsClient({
  initialProjects,
  availableClients,
  accessToken
}: {
  initialProjects: Project[];
  availableClients: Client[];
  accessToken: string | null;
}) {
  const { currency } = useCurrency();
  const { toast } = useToast();

  const [projects, setProjects] = useState(initialProjects);
  const [filter, setFilter] = useState('all');
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [milestones, setMilestones] = useState<MilestoneForm[]>([mkMilestone('Deposit')]);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeCount = useMemo(() => projects.filter((p) => p.status === 'active').length, [projects]);
  const totalBudget = useMemo(() => projects.reduce((s, p) => s + p.budgetUsd, 0), [projects]);
  const dueSoonCount = useMemo(() => {
    const inThirtyDays = Date.now() + 1000 * 60 * 60 * 24 * 30;
    return projects.filter((p) => new Date(p.nextDeadlineAt).getTime() <= inThirtyDays).length;
  }, [projects]);

  const filtered = useMemo(
    () => (filter === 'all' ? projects : projects.filter((p) => p.status === filter)),
    [projects, filter]
  );

  const resetForm = () => { setForm(initialForm); setMilestones([mkMilestone('Deposit')]); setIsCreating(false); };
  const updateField = (field: keyof typeof initialForm, value: string) => setForm((cur) => ({ ...cur, [field]: value }));
  const updateMilestone = (id: string, field: keyof Omit<MilestoneForm, 'id'>, value: string) =>
    setMilestones((cur) => cur.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  const addMilestone = () => setMilestones((cur) => [...cur, mkMilestone()]);
  const removeMilestone = (id: string) => setMilestones((cur) => (cur.length === 1 ? cur : cur.filter((m) => m.id !== id)));

  const handleCreate = async () => {
    const filteredMilestones = milestones
      .map((m) => ({ title: m.title.trim(), amount: Number(m.amount), dueDate: m.dueDate || undefined }))
      .filter((m) => m.title && m.amount > 0);

    if (!form.title.trim()) { toast({ type: 'error', title: 'Title required', message: 'Project title cannot be empty.' }); return; }
    if (!form.deadline) { toast({ type: 'error', title: 'Deadline required', message: 'Please set a project deadline.' }); return; }
    if (!form.clientId && !form.clientName.trim()) { toast({ type: 'error', title: 'Client required', message: 'Choose an existing client or enter a new name.' }); return; }
    if (!filteredMilestones.length) { toast({ type: 'error', title: 'Milestone required', message: 'Add at least one milestone with an amount.' }); return; }
    if (!accessToken) { toast({ type: 'error', title: 'Session expired', message: 'Please sign in again.' }); return; }

    setIsSubmitting(true);
    try {
      const selectedClient = availableClients.find((c) => c.id === form.clientId);
      const payload: CreateProjectFlowInput = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        budget: form.budget ? Number(form.budget) : undefined,
        deadline: form.deadline,
        startDate: new Date().toISOString().split('T')[0],
        currency: 'USD',
        clientId: form.clientId || undefined,
        clientName: form.clientId ? selectedClient?.name : form.clientName.trim(),
        clientEmail: form.clientId ? selectedClient?.email : form.clientEmail.trim() || undefined,
        milestones: filteredMilestones
      };
      const created = await hedwigApi.createProjectFlow(payload, { accessToken, disableMockFallback: true });
      setProjects((cur) => [created.project, ...cur]);
      resetForm();
      const invoiceText = `${created.createdInvoiceCount} milestone invoice${created.createdInvoiceCount === 1 ? '' : 's'} prepared.`;
      toast({
        type: 'success',
        title: created.contractId ? 'Project created' : 'Project created',
        message: created.contractId && created.contractEmailSent
          ? `${invoiceText} Contract emailed to client.`
          : `${invoiceText}`
      });
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to create project', message: error?.message || 'Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!projectToDelete || !accessToken) return;
    setIsDeleting(true);
    try {
      await hedwigApi.deleteProject(projectToDelete.id, { accessToken, disableMockFallback: true });
      setProjects((cur) => cur.filter((p) => p.id !== projectToDelete.id));
      toast({ type: 'success', title: 'Project deleted', message: `${projectToDelete.name} was removed.` });
      setProjectToDelete(null);
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to delete project', message: error?.message || 'Please try again.' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title="Project pipeline"
        description="Keep project health, deadlines, and cash exposure visible without jumping across systems."
        actions={
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4" weight="bold" />
            New project
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
        <StatItem icon={<FolderSimple className="h-4 w-4 text-[#2563eb]" weight="bold" />} label="Active projects" value={`${activeCount}`} sub="currently in progress" accent="text-[#181d27]" />
        <StatItem icon={<CheckCircle className="h-4 w-4 text-[#12b76a]" weight="bold" />} label="Total budget" value={formatCompactCurrency(totalBudget, currency)} sub="across all projects" accent="text-[#12b76a]" />
        <StatItem icon={<ClockCountdown className="h-4 w-4 text-[#f59e0b]" weight="bold" />} label="Due in 30 days" value={`${dueSoonCount}`} sub="upcoming deadlines" accent={dueSoonCount > 0 ? 'text-[#f59e0b]' : 'text-[#181d27]'} />
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e9eaeb] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[#181d27]">Active project pipeline</p>
            <p className="text-[12px] text-[#a4a7ae] mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {STATUS_FILTERS.map((s) => (
              <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
                {s === 'all' ? 'All' : PROJECT_STATUS[s as keyof typeof PROJECT_STATUS]?.label ?? s}
              </FilterChip>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_100px_90px_140px_100px_90px_44px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
          <ColHead>Project</ColHead>
          <ColHead>Status</ColHead>
          <ColHead>Contract</ColHead>
          <ColHead>Progress</ColHead>
          <ColHead right>Budget</ColHead>
          <ColHead right>Deadline</ColHead>
          <span />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <EmptyState text="No projects match this filter." />
        ) : (
          <div className="divide-y divide-[#f9fafb]">
            {filtered.map((project) => {
              const s = PROJECT_STATUS[project.status] ?? PROJECT_STATUS.active;
              const cs = project.contract ? CONTRACT_STATUS[project.contract.status] ?? CONTRACT_STATUS.draft : null;
              return (
                <div key={project.id} className="group grid grid-cols-[1fr_100px_90px_140px_100px_90px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafafa]">
                  <Link href={`/projects/${project.id}`} className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#181d27] hover:text-[#2563eb] transition-colors">{project.name}</p>
                    <p className="text-[11px] text-[#a4a7ae] mt-0.5">{project.ownerName}</p>
                  </Link>
                  <StatusPill dot={s.dot} label={s.label} bg={s.bg} text={s.text} />
                  {project.contract && cs ? (
                    <Link href={`/contracts?contract=${project.contract.id}`}>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${cs.bg} ${cs.text}`}>
                        {project.contract.status}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-[11px] text-[#d0d5dd]">—</span>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f2f4f7]">
                      <div className="h-full rounded-full bg-[#2563eb] transition-all" style={{ width: `${project.progress}%` }} />
                    </div>
                    <span className="w-9 text-right text-[11px] tabular-nums text-[#717680]">{project.progress}%</span>
                  </div>
                  <p className="text-right text-[13px] tabular-nums text-[#717680]">{formatCompactCurrency(project.budgetUsd, currency)}</p>
                  <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(project.nextDeadlineAt)}</p>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setProjectToDelete(project)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[#a4a7ae] opacity-0 transition-all hover:bg-[#fff1f0] hover:text-[#f04438] group-hover:opacity-100"
                    >
                      <Trash className="h-4 w-4" weight="regular" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DeleteDialog
        open={!!projectToDelete}
        title="Delete project"
        description="This removes the project from your workspace."
        itemLabel={projectToDelete?.name}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onOpenChange={(open) => { if (!open && !isDeleting) setProjectToDelete(null); }}
      />

      {/* New project dialog */}
      <Dialog open={isCreating} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Creates a project, generates a linked contract, and prepares milestone invoices.</DialogDescription>
          </DialogHeader>
          <DialogBody className="max-h-[60vh] space-y-5 overflow-y-auto">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Project title <span className="text-[#f04438]">*</span></label>
                <Input placeholder="e.g. Brand identity redesign" value={form.title} onChange={(e) => updateField('title', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Description</label>
                <Input placeholder="Brief project description" value={form.description} onChange={(e) => updateField('description', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Deadline <span className="text-[#f04438]">*</span></label>
                <Input type="date" value={form.deadline} onChange={(e) => updateField('deadline', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Total budget (USD)</label>
                <Input type="number" placeholder="e.g. 5000" value={form.budget} onChange={(e) => updateField('budget', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Client <span className="text-[#f04438]">*</span></label>
              <div className="flex h-10 w-full items-center rounded-lg border border-[#d5d7da] bg-white px-3.5 shadow-xs">
                <select className="w-full bg-transparent text-[14px] text-[#181d27] outline-none" value={form.clientId} onChange={(e) => updateField('clientId', e.target.value)}>
                  <option value="">New client / attach later</option>
                  {availableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {!form.clientId && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">New client name</label>
                  <Input placeholder="e.g. Aisha Bello" value={form.clientName} onChange={(e) => updateField('clientName', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Client email</label>
                  <Input type="email" placeholder="client@example.com" value={form.clientEmail} onChange={(e) => updateField('clientEmail', e.target.value)} />
                </div>
              </div>
            )}
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <label className="text-[13px] font-semibold text-[#414651]">Milestones <span className="text-[#f04438]">*</span></label>
                <Button size="sm" variant="secondary" onClick={addMilestone}><Plus className="h-3.5 w-3.5" weight="bold" />Add</Button>
              </div>
              <div className="space-y-2.5">
                {milestones.map((m, i) => (
                  <div key={m.id} className="grid items-center gap-2 rounded-xl border border-[#e9eaeb] bg-[#fafafa] p-3 sm:grid-cols-[1fr_100px_130px_auto]">
                    <Input placeholder={`Milestone ${i + 1}`} value={m.title} onChange={(e) => updateMilestone(m.id, 'title', e.target.value)} />
                    <Input type="number" placeholder="Amount" value={m.amount} onChange={(e) => updateMilestone(m.id, 'amount', e.target.value)} />
                    <Input type="date" value={m.dueDate} onChange={(e) => updateMilestone(m.id, 'dueDate', e.target.value)} />
                    <Button size="icon" variant="ghost" disabled={milestones.length === 1} onClick={() => removeMilestone(m.id)} className={cn(milestones.length === 1 && 'opacity-30')}>
                      <Trash className="h-4 w-4 text-[#717680]" weight="regular" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary" disabled={isSubmitting}>Cancel</Button></DialogClose>
            <Button onClick={handleCreate} disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create project'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── shared sub-components ── */
function StatusPill({ dot, label, bg, text }: { dot: string; label: string; bg: string; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bg} ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function StatItem({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-[12px] font-medium text-[#717680]">{label}</span></div>
      <p className={`text-[22px] font-bold tracking-[-0.03em] ${accent}`}>{value}</p>
      <p className="mt-1 text-[11px] text-[#a4a7ae]">{sub}</p>
    </div>
  );
}

function ColHead({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <span className={`text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae] ${right ? 'text-right' : ''}`}>{children}</span>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${active ? 'bg-[#eff4ff] text-[#2563eb]' : 'text-[#717680] hover:bg-[#f2f4f7] hover:text-[#344054]'}`}>
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <FolderSimple className="h-8 w-8 text-[#d0d5dd]" weight="duotone" />
      <p className="text-[13px] text-[#a4a7ae]">{text}</p>
    </div>
  );
}
