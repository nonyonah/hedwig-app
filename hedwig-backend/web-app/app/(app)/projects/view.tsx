'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, DownloadSimple, Plus, Trash } from '@/components/ui/lucide-icons';
import type { Client, Project } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { Button } from '@/components/ui/button';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { formatShortDate } from '@/lib/utils';

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

export function ProjectsClient({
  initialProjects,
  availableClients: _availableClients,
  accessToken
}: {
  initialProjects: Project[];
  availableClients: Client[];
  accessToken: string | null;
}) {
  const { formatAmount } = useCurrency();
  const { toast } = useToast();

  const [projects, setProjects] = useState(initialProjects);
  const [filter, setFilter] = useState('all');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeCount = useMemo(() => projects.filter((p) => p.status === 'active').length, [projects]);
  const completedCount = useMemo(() => projects.filter((p) => p.status === 'completed').length, [projects]);
  const totalBudget = useMemo(() => projects.reduce((s, p) => s + p.budgetUsd, 0), [projects]);

  const downloadCsv = () => {
    const rows = filtered.map((p) => [
      p.id,
      p.name,
      p.ownerName,
      p.status,
      p.budgetUsd.toFixed(2),
      `${p.progress}%`,
      p.nextDeadlineAt ? new Date(p.nextDeadlineAt).toISOString().slice(0, 10) : '',
      p.contract?.status ?? '',
    ]);
    const header = ['project_id', 'name', 'owner', 'status', 'budget_usd', 'progress', 'deadline', 'contract_status'];
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    triggerDownload(csv, `hedwig-projects-${today()}.csv`, 'text/csv');
  };

  const downloadPdf = () => {
    const html = buildProjectPdfHtml(filtered);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  };

  const filtered = useMemo(
    () => (filter === 'all' ? projects : projects.filter((p) => p.status === filter)),
    [projects, filter]
  );

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
    <div className="space-y-4">
      <div>
        <h1 className="text-[15px] font-semibold text-[#181d27]">Projects</h1>
        <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Track deliverables, milestones, and project progress.</p>
      </div>

      <AttachedStatGrid
        items={[
          { id: 'active', title: 'Active', value: String(activeCount), helper: 'In progress' },
          { id: 'completed', title: 'Completed', value: String(completedCount), helper: 'Delivered' },
          { id: 'total-budget', title: 'Total budget', value: formatAmount(totalBudget, { compact: true }), helper: 'Across all projects' },
        ]}
        className="grid-cols-1 md:grid-cols-3"
      />

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        {/* Unified header */}
        <div className="flex items-center gap-3 border-b border-[#f2f4f7] px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="text-[12px] font-medium text-[#717680]">{projects.length} projects</span>
            {activeCount > 0 && (
              <>
                <span className="h-3 w-px shrink-0 bg-[#f2f4f7]" />
                <span className="truncate text-[12px] text-[#a4a7ae]">
                  {activeCount} active · {formatAmount(totalBudget, { compact: true })} total budget
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  filter === s
                    ? 'bg-[#f5f5f5] text-[#181d27]'
                    : 'text-[#8d9096] hover:bg-[#f9fafb] hover:text-[#414651]'
                }`}
              >
                {s === 'all' ? 'All' : PROJECT_STATUS[s as keyof typeof PROJECT_STATUS]?.label ?? s}
              </button>
            ))}
            <div className="mx-1 h-4 w-px bg-[#f2f4f7]" />
            <ExportMenu onCsv={downloadCsv} onPdf={downloadPdf} />
            <Button
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent('hedwig:open-create-menu', { detail: { flow: 'project' } }))}
            >
              <Plus className="h-3.5 w-3.5" weight="bold" />
              New project
            </Button>
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
          <EmptyState text={filter === 'all' ? 'No projects yet.' : 'No projects match this filter.'} />
        ) : (
          <div className="divide-y divide-[#f9fafb]">
            {filtered.map((project) => {
              const s = PROJECT_STATUS[project.status] ?? PROJECT_STATUS.active;
              const cs = project.contract
                ? CONTRACT_STATUS[project.contract.status] ?? CONTRACT_STATUS.draft
                : null;
              return (
                <div
                  key={project.id}
                  className="group grid grid-cols-[1fr_100px_90px_140px_100px_90px_44px] items-center gap-3 px-5 py-3 transition-colors hover:bg-[#fafafa]"
                >
                  <Link href={`/projects/${project.id}`} className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#252b37] transition-colors hover:text-[#2563eb]">
                      {project.name}
                    </p>
                    <p className="text-[11px] text-[#a4a7ae]">{project.ownerName}</p>
                  </Link>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                  {project.contract && cs ? (
                    <Link href={`/contracts?contract=${project.contract.id}`}>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cs.bg} ${cs.text}`}>
                        {project.contract.status}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-[11px] text-[#d0d5dd]">—</span>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#f2f4f7]">
                      <div
                        className="h-full rounded-full bg-[#2563eb] transition-all"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-[11px] tabular-nums text-[#8d9096]">
                      {project.progress}%
                    </span>
                  </div>
                  <p className="text-right text-[13px] tabular-nums text-[#8d9096]">
                    {formatAmount(project.budgetUsd, { compact: true })}
                  </p>
                  <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(project.nextDeadlineAt)}</p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setProjectToDelete(project)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#d0d5dd] opacity-0 transition-all hover:bg-[#fff1f0] hover:text-[#f04438] group-hover:opacity-100"
                    >
                      <Trash className="h-3.5 w-3.5" weight="regular" />
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
    </div>
  );
}

function ColHead({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <span className={`text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd] ${right ? 'text-right' : ''}`}>
      {children}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="text-[13px] text-[#a4a7ae]">{text}</p>
    </div>
  );
}

function ExportMenu({ onCsv, onPdf }: { onCsv: () => void; onPdf: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px] font-medium text-[#414651] shadow-xs transition hover:bg-[#f9fafb]"
      >
        <DownloadSimple className="h-3.5 w-3.5" weight="bold" />
        Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-[#e9eaeb] bg-white shadow-lg">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-[13px] text-[#252b37] hover:bg-[#f9fafb]"
              onClick={() => { onCsv(); setOpen(false); }}
            >
              Download CSV
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-[13px] text-[#252b37] hover:bg-[#f9fafb]"
              onClick={() => { onPdf(); setOpen(false); }}
            >
              Download PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function csvCell(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildProjectPdfHtml(projects: Project[]): string {
  const rows = projects.map((p) => `
    <tr>
      <td>${p.name}</td>
      <td>${p.ownerName}</td>
      <td>${p.status}</td>
      <td>$${p.budgetUsd.toLocaleString()}</td>
      <td>${p.progress}%</td>
      <td>${p.nextDeadlineAt ? new Date(p.nextDeadlineAt).toLocaleDateString() : '—'}</td>
      <td>${p.contract?.status ?? '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Hedwig Projects Export</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #181d27; margin: 32px; }
  h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  p { color: #717680; margin: 0 0 20px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #a4a7ae; padding: 8px 10px; border-bottom: 2px solid #e9eaeb; }
  td { padding: 8px 10px; border-bottom: 1px solid #f2f4f7; }
  tr:hover td { background: #fafafa; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>Projects</h1>
<p>Exported ${new Date().toLocaleDateString()} · ${projects.length} project${projects.length !== 1 ? 's' : ''}</p>
<table>
<thead><tr>
  <th>Project</th><th>Owner</th><th>Status</th><th>Budget</th><th>Progress</th><th>Deadline</th><th>Contract</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;
}
