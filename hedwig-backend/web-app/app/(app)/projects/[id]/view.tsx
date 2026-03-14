'use client';

import { useState } from 'react';
import { FileText, Info, NotePencil, Target, Wallet } from '@phosphor-icons/react/dist/ssr';
import { ListCard } from '@/components/data/list-card';
import { MetricCard } from '@/components/data/metric-card';
import { PageHeader } from '@/components/data/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { hedwigApi } from '@/lib/api/client';
import type { Contract, Invoice, Milestone, Project } from '@/lib/models/entities';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';

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
  const [project, setProject] = useState(initialProject);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: initialProject.name,
    budget: `${initialProject.budgetUsd || ''}`,
    deadline: initialProject.nextDeadlineAt.slice(0, 10),
    status: initialProject.status
  });

  const highlightedMilestone = milestones.find((milestone) => milestone.id === highlightedMilestoneId) ?? null;

  const updateField = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const resetForm = () => {
    setForm({
      title: project.name,
      budget: `${project.budgetUsd || ''}`,
      deadline: project.nextDeadlineAt.slice(0, 10),
      status: project.status
    });
    setIsEditing(false);
    setFeedback(null);
  };

  const saveProject = async () => {
    if (!accessToken) {
      setFeedback('Missing session token. Please sign in again.');
      return;
    }

    setIsSaving(true);
    setFeedback(null);

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
          ? {
              id: contract.id,
              title: contract.title,
              status: contract.status
            }
          : project.contract ?? null
      });
      setIsEditing(false);
      setFeedback('Project updated.');
    } catch (error: any) {
      setFeedback(error?.message || 'Failed to update project.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project detail"
        title={project.name}
        description="Scope, milestones, contracts, and invoice readiness live together so delivery and money stay in sync."
        actions={
          <Button size="sm" type="button" variant={isEditing ? 'secondary' : 'default'} onClick={() => (isEditing ? resetForm() : setIsEditing(true))}>
            <NotePencil className="h-4 w-4" weight="bold" />
            {isEditing ? 'Cancel edit' : 'Edit project'}
          </Button>
        }
      />

      {highlightedMilestone ? (
        <div className="flex items-start gap-3 rounded-[15px] border border-[#d5d7da] bg-[#fcfcfd] px-4 py-3 text-[#414651] shadow-soft">
          <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[#72706b]" weight="bold" />
          <div>
            <p className="text-sm font-semibold text-foreground">Opened from calendar</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Milestone <span className="font-medium text-foreground">{highlightedMilestone.name}</span> is currently{' '}
              <span className="font-medium text-foreground">{highlightedMilestone.status}</span> and due on{' '}
              <span className="font-medium text-foreground">{formatShortDate(highlightedMilestone.dueAt)}</span>.
            </p>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <div className="rounded-[15px] border border-[#d5d7da] bg-[#fcfcfd] px-4 py-3 text-sm text-[#414651] shadow-soft">
          {feedback}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard icon={<Target className="h-5 w-5 text-[#72706b]" weight="bold" />} label="Progress" value={`${project.progress}%`} />
        <MetricCard icon={<Wallet className="h-5 w-5 text-[#72706b]" weight="bold" />} label="Budget" value={formatCompactCurrency(project.budgetUsd)} />
        <MetricCard icon={<FileText className="h-5 w-5 text-[#72706b]" weight="bold" />} label="Next deadline" value={formatShortDate(project.nextDeadlineAt)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="grid gap-6 xl:grid-cols-2">
          <ListCard
            title="Milestones"
            items={milestones.map((milestone) => ({
              id: milestone.id,
              title: highlightedMilestone?.id === milestone.id ? `${milestone.name} · Focused` : milestone.name,
              subtitle: milestone.status,
              meta: formatShortDate(milestone.dueAt)
            }))}
            highlightedId={highlightedMilestone?.id ?? null}
          />
          <div className="space-y-6">
            <ListCard
              title="Related invoices"
              items={invoices.map((invoice) => ({
                id: invoice.id,
                title: invoice.number,
                subtitle: invoice.status,
                meta: formatCompactCurrency(invoice.amountUsd),
                href: `/payments?invoice=${invoice.id}`
              }))}
            />
            <ListCard
              title="Linked contract"
              items={
                contract
                  ? [
                      {
                        id: contract.id,
                        title: contract.title,
                        subtitle: contract.status,
                        href: `/contracts?contract=${contract.id}`
                      }
                    ]
                  : []
              }
              emptyText="No contract is linked to this project yet."
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Project settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <Input disabled={!isEditing || isSaving} onChange={(event) => updateField('title', event.target.value)} value={form.title} />
              <Input disabled={!isEditing || isSaving} onChange={(event) => updateField('budget', event.target.value)} placeholder="Budget" type="number" value={form.budget} />
              <Input disabled={!isEditing || isSaving} onChange={(event) => updateField('deadline', event.target.value)} type="date" value={form.deadline} />
              <div className="rounded-lg border border-[#d5d7da] bg-white px-3.5 py-2 shadow-xs">
                <select
                  className="w-full bg-transparent text-[14px] text-[#181d27] outline-none"
                  disabled={!isEditing || isSaving}
                  onChange={(event) => updateField('status', event.target.value)}
                  value={form.status}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            {isEditing ? (
              <div className="flex flex-wrap gap-3">
                <Button disabled={isSaving} size="sm" type="button" onClick={saveProject}>
                  {isSaving ? 'Saving...' : 'Save changes'}
                </Button>
                <Button disabled={isSaving} size="sm" type="button" variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            ) : null}
            {!isEditing ? (
              <p className="text-sm text-muted-foreground">
                This project is now tied to its real backend contract and related invoices, not a mock placeholder flow.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
