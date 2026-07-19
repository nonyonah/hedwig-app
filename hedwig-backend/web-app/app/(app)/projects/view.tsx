'use client';

import Link from 'next/link';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { ArrowRight, DownloadSimple, Plus, Trash } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import type { Client, Project } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { Button } from '@/components/ui/button';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { formatShortDate } from '@/lib/utils';

const PROJECT_STATUS = {
 active: { dot: 'bg-[var(--color-success)]', label: 'Active', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
 paused: { dot: 'bg-[var(--color-warning)]', label: 'Paused', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
 completed: { dot: 'bg-[var(--color-text-muted)]', label: 'Completed', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
} as const;

const CONTRACT_STATUS = {
 draft: { bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
 review: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
 signed: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
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

 useAssistantPageContext('Projects', {
 totalProjects: initialProjects.length,
 });

 const [projects, setProjects] = useState(initialProjects);
 const [filter, setFilter] = useState('all');
 const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const [linearSyncingProject, setLinearSyncingProject] = useState<string | null>(null);
 const [linkedProjects, setLinkedProjects] = useState<Record<string, { linearProjectId: string; linearUrl: string; syncedAt: string }>>({});
 const { activeWorkspace } = useWorkspaceContext();
 const canCreate = !activeWorkspace || activeWorkspace.role !== 'member';
 const isMember = activeWorkspace?.role === 'member';

 useEffect(() => {
 fetch('/api/integrations/composio/linear/links')
 .then((r) => r.json())
 .then((p) => { if (p.success && p.data?.projects) setLinkedProjects(p.data.projects); })
 .catch(() => {});
 }, []);

 const activeCount = useMemo(() => projects.filter((p) => p.status === 'active').length, [projects]);
 const completedCount = useMemo(() => projects.filter((p) => p.status === 'completed').length, [projects]);
 const totalPayout = useMemo(() => projects.reduce((s, p) => s + (p.memberPayout ?? 0), 0), [projects]);
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

 const handleCreateLinear = useCallback(async (project: Project) => {
 setLinearSyncingProject(project.id);
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
 const ms = payload.data.milestonesSynced;
 const msg = ms && ms > 0 ? `Project created in Linear with ${ms} milestone${ms !== 1 ? 's' : ''}.` : 'Project created in Linear.';
 toast({ type: 'success', title: 'Synced to Linear', message: msg });
 setLinkedProjects((prev) => ({
 ...prev,
 [project.id]: {
 linearProjectId: payload.data.externalId || '',
 linearUrl: payload.data.url || '',
 syncedAt: new Date().toISOString(),
 },
 }));
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
 setLinearSyncingProject(null);
 }
 }, [toast]);

 const handleSyncLinearStatus = useCallback(async (project: Project) => {
 setLinearSyncingProject(project.id);
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
 } else if (err.includes('not linked')) {
 toast({ type: 'info', title: 'Not linked to Linear', message: 'Create the project in Linear first.' });
 } else {
 toast({ type: 'error', title: 'Linear sync failed', message: err || 'Please try again.' });
 }
 }
 } catch {
 toast({ type: 'error', title: 'Linear sync failed', message: 'Could not reach the server.' });
 } finally {
 setLinearSyncingProject(null);
 }
 }, [toast]);

 return (
 <div className="space-y-6">
 <div>
 <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Projects</h1>
 <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Track deliverables, milestones, and project progress.</p>
 </div>

 <AttachedStatGrid
 items={[
 { id: 'active', title: 'Active', value: String(activeCount), helper: 'In progress' },
 { id: 'completed', title: 'Completed', value: String(completedCount), helper: 'Delivered' },
 { id: 'total-budget', title: isMember ? 'Your pay' : 'Total budget', value: formatAmount(isMember ? totalPayout : totalBudget, { compact: true }), helper: isMember ? 'Assigned to you' : 'Across all projects' },
 ]}
 className="grid-cols-1 md:grid-cols-3"
 />

 {/* Toolbar */}
 <div className="flex items-center justify-between gap-3 px-0.5">
 <div className="flex items-center gap-2.5">
 <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
 {projects.length} project{projects.length !== 1 ? 's' : ''}
 </span>
 {activeCount > 0 && (
 <span className="text-[12px] text-[var(--color-text-muted)]">
 · {activeCount} active · {formatAmount(isMember ? totalPayout : totalBudget, { compact: true })} {isMember ? 'assigned pay' : 'total budget'}
 </span>
 )}
 </div>
 <div className="flex items-center gap-1">
 {STATUS_FILTERS.map((s) => (
 <Button
 key={s}
 variant="ghost"
 size="sm"
 onClick={() => setFilter(s)}
 className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
 filter === s
 ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]'
 : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
 }`}
 >
 {s === 'all' ? 'All' : PROJECT_STATUS[s as keyof typeof PROJECT_STATUS]?.label ?? s}
 </Button>
 ))}
 <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />
 <ExportMenu onCsv={downloadCsv} onPdf={downloadPdf} />
 {canCreate && (
 <Button
 variant="default"
 size="sm"
 className="create-btn"
 onClick={() => window.dispatchEvent(new CustomEvent('hedwig:open-create-menu', { detail: { flow: 'project' } }))}
 >
 <Plus className="h-3.5 w-3.5" weight="bold" />
 New project
 </Button>
 )}
 </div>
 </div>

 {/* Table */}
 <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
 {/* Column headers */}
 <div className="grid grid-cols-[1fr_100px_90px_140px_100px_90px_44px_44px] gap-3 border-b border-[var(--color-border)] px-5 py-2.5">
 <ColHead>Project</ColHead>
 <ColHead>Status</ColHead>
 <ColHead>Contract</ColHead>
 <ColHead>Progress</ColHead>
 <ColHead right>Budget</ColHead>
 <ColHead right>Deadline</ColHead>
 <span />
 <span className="flex justify-end" />
 </div>

 {/* Rows */}
 {filtered.length === 0 ? (
 <EmptyState text={filter === 'all' ? 'No projects yet.' : 'No projects match this filter.'} />
 ) : (
 <div className="divide-y divide-[var(--color-border)]">
 {filtered.map((project) => {
 const s = PROJECT_STATUS[project.status] ?? PROJECT_STATUS.active;
 const cs = project.contract
 ? CONTRACT_STATUS[project.contract.status] ?? CONTRACT_STATUS.draft
 : null;
 return (
 <div
 key={project.id}
 className="group grid grid-cols-[1fr_100px_90px_140px_100px_90px_44px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-background)]"
 >
 <Link href={`/projects/${project.id}`} className="min-w-0">
 <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)] transition-colors hover:text-[var(--color-accent)]">
 {project.name}
 </p>
 <p className="text-[11px] text-[var(--color-text-muted)]">{project.ownerName}</p>
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
 <span className="text-[11px] text-[var(--color-border-input)]">—</span>
 )}
 <div className="flex items-center gap-2">
 <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
 <div
 className="h-full rounded-full bg-[var(--color-accent)] transition-all"
 style={{ width: `${project.progress}%` }}
 />
 </div>
 <span className="w-8 text-right text-[11px] tabular-nums text-[var(--color-text-tertiary)]">
 {project.progress}%
 </span>
 </div>
 <p className="text-right text-[13px] tabular-nums text-[var(--color-text-tertiary)]">
 {isMember
 ? (project.memberPayout != null ? formatAmount(project.memberPayout, { compact: true }) : null)
 : formatAmount(project.budgetUsd, { compact: true })}
 </p>
 <p className="text-right text-[12px] text-[var(--color-text-muted)]">{formatShortDate(project.nextDeadlineAt)}</p>
 <div className="flex justify-end gap-1">
 {project.id in linkedProjects ? (
 <button
 type="button"
 onClick={() => handleSyncLinearStatus(project)}
 disabled={linearSyncingProject === project.id}
 className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-success)] transition hover:bg-[var(--color-success-soft)] disabled:opacity-30"
 title="Re-sync project status with Linear"
 >
 {linearSyncingProject === project.id ? (
 <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
 ) : (
 <svg viewBox="0 0 100 100" className="h-3.5 w-3.5" fill="currentColor">
 <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228ZM.00189135 46.8891c-.01764375.2833.08887215.5599.28957165.7606L52.3503 99.7085c.2007.2007.4773.3075.7606.2896 2.3692-.1476 4.6938-.46 6.9624-.9259.7645-.157 1.0301-1.0963.4782-1.6481L2.57595 39.4485c-.55186-.5519-1.49117-.2863-1.648174.4782-.465915 2.2686-.77832 4.5932-.92588465 6.9624ZM4.21093 29.7054c-.16649.3738-.08169.8106.20765 1.1l64.77602 64.776c.2894.2894.7262.3742 1.1.2077 1.7861-.7956 3.5171-1.6927 5.1855-2.684.5521-.328.6373-1.0867.1832-1.5407L8.43566 24.3367c-.45409-.4541-1.21271-.3689-1.54074.1832-.99132 1.6684-1.88843 3.3994-2.68399 5.1855ZM12.6587 18.074c-.3701-.3701-.393-.9637-.0443-1.3541C21.7795 6.45931 35.1114 0 49.9519 0 77.5927 0 100 22.4073 100 50.0481c0 14.8405-6.4593 28.1724-16.7199 37.3375-.3903.3487-.984.3258-1.3542-.0443L12.6587 18.074Z" />
 </svg>
 )}
 </button>
 ) : (
 <button
 type="button"
 onClick={() => handleCreateLinear(project)}
 disabled={linearSyncingProject === project.id}
 className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] transition hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] disabled:opacity-30"
 title="Sync with Linear"
 >
 {linearSyncingProject === project.id ? (
 <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
 ) : (
 <svg viewBox="0 0 100 100" className="h-3.5 w-3.5" fill="currentColor">
 <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5964C20.0515 94.4522 5.54779 79.9485 1.22541 61.5228ZM.00189135 46.8891c-.01764375.2833.08887215.5599.28957165.7606L52.3503 99.7085c.2007.2007.4773.3075.7606.2896 2.3692-.1476 4.6938-.46 6.9624-.9259.7645-.157 1.0301-1.0963.4782-1.6481L2.57595 39.4485c-.55186-.5519-1.49117-.2863-1.648174.4782-.465915 2.2686-.77832 4.5932-.92588465 6.9624ZM4.21093 29.7054c-.16649.3738-.08169.8106.20765 1.1l64.77602 64.776c.2894.2894.7262.3742 1.1.2077 1.7861-.7956 3.5171-1.6927 5.1855-2.684.5521-.328.6373-1.0867.1832-1.5407L8.43566 24.3367c-.45409-.4541-1.21271-.3689-1.54074.1832-.99132 1.6684-1.88843 3.3994-2.68399 5.1855ZM12.6587 18.074c-.3701-.3701-.393-.9637-.0443-1.3541C21.7795 6.45931 35.1114 0 49.9519 0 77.5927 0 100 22.4073 100 50.0481c0 14.8405-6.4593 28.1724-16.7199 37.3375-.3903.3487-.984.3258-1.3542-.0443L12.6587 18.074Z" />
 </svg>
 )}
 </button>
 )}
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setProjectToDelete(project)}
 className="h-7 w-7 rounded-md text-[var(--color-border-input)] opacity-0 hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] group-hover:opacity-100"
 >
 <Trash className="h-3.5 w-3.5" weight="regular" />
 </Button>
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
 <span className={`text-[11px] font-medium text-[var(--color-text-tertiary)] ${right ? 'text-right' : ''}`}>
 {children}
 </span>
 );
}

function EmptyState({ text }: { text: string }) {
 return (
 <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
 <p className="text-[13px] text-[var(--color-text-muted)]">{text}</p>
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
 className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50"
 >
 <DownloadSimple className="h-3.5 w-3.5" weight="bold" />
 Export
 </button>
 {open && (
 <>
 <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
 <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
 <Button
 variant="ghost"
 size="sm"
 className="w-full justify-start rounded-none px-3.5 py-2.5 text-[13px] text-[var(--color-foreground)] hover:bg-[var(--color-surface-secondary)]"
 onClick={() => { onCsv(); setOpen(false); }}
 >
 Download CSV
 </Button>
 <Button
 variant="ghost"
 size="sm"
 className="w-full justify-start rounded-none px-3.5 py-2.5 text-[13px] text-[var(--color-foreground)] hover:bg-[var(--color-surface-secondary)]"
 onClick={() => { onPdf(); setOpen(false); }}
 >
 Download PDF
 </Button>
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
 body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: var(--color-text-primary); margin: 32px; }
 h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
 p { color: var(--color-text-tertiary); margin: 0 0 20px; font-size: 11px; }
 table { width: 100%; border-collapse: collapse; }
 th { text-align: left; font-size: 10px; color: var(--color-text-muted); padding: 8px 10px; border-bottom: 2px solid var(--color-border); }
 td { padding: 8px 10px; border-bottom: 1px solid var(--color-surface-tertiary); }
 tr:hover td { background: var(--color-background); }
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
