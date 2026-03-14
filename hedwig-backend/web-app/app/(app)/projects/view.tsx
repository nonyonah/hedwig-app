'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, ClockCountdown, FolderSimple, Plus, Trash } from '@phosphor-icons/react/dist/ssr';
import type { Client, Project } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import type { CreateProjectFlowInput } from '@/lib/api/client';
import { EntityTable } from '@/components/data/entity-table';
import { MetricCard } from '@/components/data/metric-card';
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

type MilestoneForm = { id: string; title: string; amount: string; dueDate: string };

const mkMilestone = (label = ''): MilestoneForm => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: label,
  amount: '',
  dueDate: ''
});

const initialForm = {
  title: '',
  description: '',
  budget: '',
  deadline: '',
  clientId: '',
  clientName: '',
  clientEmail: ''
};

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
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [milestones, setMilestones] = useState<MilestoneForm[]>([mkMilestone('Deposit')]);

  const activeProjects = useMemo(() => projects.filter((p) => p.status === 'active').length, [projects]);
  const totalBudget = useMemo(() => projects.reduce((s, p) => s + p.budgetUsd, 0), [projects]);
  const dueSoonCount = useMemo(() => {
    const inThirtyDays = Date.now() + 1000 * 60 * 60 * 24 * 30;
    return projects.filter((p) => new Date(p.nextDeadlineAt).getTime() <= inThirtyDays).length;
  }, [projects]);

  const resetForm = () => {
    setForm(initialForm);
    setMilestones([mkMilestone('Deposit')]);
    setIsCreating(false);
  };

  const updateField = (field: keyof typeof initialForm, value: string) =>
    setForm((cur) => ({ ...cur, [field]: value }));

  const updateMilestone = (id: string, field: keyof Omit<MilestoneForm, 'id'>, value: string) =>
    setMilestones((cur) => cur.map((m) => (m.id === id ? { ...m, [field]: value } : m)));

  const addMilestone = () => setMilestones((cur) => [...cur, mkMilestone()]);
  const removeMilestone = (id: string) =>
    setMilestones((cur) => (cur.length === 1 ? cur : cur.filter((m) => m.id !== id)));

  const handleCreateProject = async () => {
    const filteredMilestones = milestones
      .map((m) => ({ title: m.title.trim(), amount: Number(m.amount), dueDate: m.dueDate || undefined }))
      .filter((m) => m.title && m.amount > 0);

    if (!form.title.trim()) {
      toast({ type: 'error', title: 'Title required', message: 'Project title cannot be empty.' });
      return;
    }
    if (!form.deadline) {
      toast({ type: 'error', title: 'Deadline required', message: 'Please set a project deadline.' });
      return;
    }
    if (!form.clientId && !form.clientName.trim()) {
      toast({ type: 'error', title: 'Client required', message: 'Choose an existing client or enter a new name.' });
      return;
    }
    if (!filteredMilestones.length) {
      toast({ type: 'error', title: 'Milestone required', message: 'Add at least one milestone with an amount.' });
      return;
    }
    if (!accessToken) {
      toast({ type: 'error', title: 'Session expired', message: 'Please sign in again.' });
      return;
    }

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
      toast({
        type: 'success',
        title: 'Project created',
        message: `${created.createdInvoiceCount} milestone invoice${created.createdInvoiceCount === 1 ? '' : 's'} prepared.`
      });
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to create project', message: error?.message || 'Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title="Delivery work linked to payment readiness"
        description="Keep project health, next deadlines, and cash exposure visible without jumping across separate systems."
        actions={
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4" weight="bold" />
            New project
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard
          icon={<FolderSimple className="h-5 w-5 text-[#717680]" weight="regular" />}
          label="Active projects"
          value={`${activeProjects}`}
        />
        <MetricCard
          icon={<CheckCircle className="h-5 w-5 text-[#717680]" weight="regular" />}
          label="Total budget"
          value={formatCompactCurrency(totalBudget, currency)}
        />
        <MetricCard
          icon={<ClockCountdown className="h-5 w-5 text-[#717680]" weight="regular" />}
          label="Deadlines in 30 days"
          value={`${dueSoonCount}`}
        />
      </div>

      <EntityTable
        title="Active project pipeline"
        columns={['Project', 'Status', 'Contract', 'Progress', 'Budget', 'Next deadline']}
        rows={projects.map((project) => [
          { value: project.name, href: `/projects/${project.id}` },
          {
            value: project.status,
            badge: true,
            tone: project.status === 'active' ? 'success' : project.status === 'paused' ? 'warning' : 'neutral'
          },
          project.contract
            ? {
                value: project.contract.status,
                badge: true,
                tone: project.contract.status === 'signed' ? 'success' : project.contract.status === 'review' ? 'warning' : 'neutral',
                href: `/contracts?contract=${project.contract.id}`
              }
            : { value: 'not created' },
          { value: `${project.progress}%` },
          { value: formatCompactCurrency(project.budgetUsd, currency) },
          { value: formatShortDate(project.nextDeadlineAt) }
        ])}
      />

      {/* ── New project dialog ─────────────────────────────── */}
      <Dialog open={isCreating} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Creates a project, generates a linked contract, and prepares milestone invoices.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="max-h-[60vh] space-y-5 overflow-y-auto">
            {/* Basics */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">
                  Project title <span className="text-[#f04438]">*</span>
                </label>
                <Input
                  placeholder="e.g. Brand identity redesign"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Description</label>
                <Input
                  placeholder="Brief project description"
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">
                  Deadline <span className="text-[#f04438]">*</span>
                </label>
                <Input type="date" value={form.deadline} onChange={(e) => updateField('deadline', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Total budget (USD)</label>
                <Input
                  type="number"
                  placeholder="e.g. 5000"
                  value={form.budget}
                  onChange={(e) => updateField('budget', e.target.value)}
                />
              </div>
            </div>

            {/* Client */}
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">
                Client <span className="text-[#f04438]">*</span>
              </label>
              <div className="flex h-10 w-full items-center rounded-lg border border-[#d5d7da] bg-white px-3.5 shadow-xs">
                <select
                  className="w-full bg-transparent text-[14px] text-[#181d27] outline-none"
                  value={form.clientId}
                  onChange={(e) => updateField('clientId', e.target.value)}
                >
                  <option value="">New client / attach later</option>
                  {availableClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {!form.clientId ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">New client name</label>
                  <Input
                    placeholder="e.g. Aisha Bello"
                    value={form.clientName}
                    onChange={(e) => updateField('clientName', e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Client email</label>
                  <Input
                    type="email"
                    placeholder="client@example.com"
                    value={form.clientEmail}
                    onChange={(e) => updateField('clientEmail', e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {/* Milestones */}
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <label className="text-[13px] font-semibold text-[#414651]">
                  Milestones <span className="text-[#f04438]">*</span>
                </label>
                <Button size="sm" variant="secondary" onClick={addMilestone}>
                  <Plus className="h-3.5 w-3.5" weight="bold" />
                  Add
                </Button>
              </div>
              <div className="space-y-2.5">
                {milestones.map((m, i) => (
                  <div
                    key={m.id}
                    className="grid items-center gap-2 rounded-xl border border-[#e9eaeb] bg-[#fafafa] p-3 sm:grid-cols-[1fr_100px_130px_auto]"
                  >
                    <Input
                      placeholder={`Milestone ${i + 1}`}
                      value={m.title}
                      onChange={(e) => updateMilestone(m.id, 'title', e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={m.amount}
                      onChange={(e) => updateMilestone(m.id, 'amount', e.target.value)}
                    />
                    <Input
                      type="date"
                      value={m.dueDate}
                      onChange={(e) => updateMilestone(m.id, 'dueDate', e.target.value)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={milestones.length === 1}
                      onClick={() => removeMilestone(m.id)}
                      className={cn(milestones.length === 1 && 'opacity-30')}
                    >
                      <Trash className="h-4 w-4 text-[#717680]" weight="regular" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={isSubmitting}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleCreateProject} disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
