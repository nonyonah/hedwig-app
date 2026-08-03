'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { Button as HeroUIButton, Checkbox, Dropdown, Label, Pagination, Table, type Selection } from '@heroui/react';
import { DownloadSimple, MagnifyingGlass, Plus, X } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import type { Client, Project } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { Button } from '@/components/ui/button';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { formatShortDate } from '@/lib/utils';

const PAGE_SIZE = 25;

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
  const router = useRouter();
  const { toast } = useToast();

 useAssistantPageContext('Projects', {
 totalProjects: initialProjects.length,
 });

  const [projects, setProjects] = useState(initialProjects);
  const [filter, setFilter] = useState('all');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter !== 'all' && p.status !== filter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q)
        || p.ownerName.toLowerCase().includes(q)
        || (p.contract?.title ?? '').toLowerCase().includes(q);
    });
  }, [projects, filter, search]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setPage(1);
  }, [filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);
  const selectedCount = selectedKeys === 'all' ? filtered.length : selectedKeys.size;
  const pageStart = (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, filtered.length);

  const handleBulkDelete = async () => {
    if (selectedCount === 0 || !accessToken) return;
    setIsDeleting(true);
    const ids = selectedKeys === 'all' ? filtered.map((p) => p.id) : Array.from(selectedKeys).map(String);
    try {
      await Promise.all(ids.map((id) => hedwigApi.deleteProject(id, { accessToken, disableMockFallback: true }).catch(() => null)));
      const removed = new Set(ids);
      setProjects((cur) => cur.filter((p) => !removed.has(p.id)));
      setSelectedKeys(new Set());
      toast({ type: 'success', title: `${ids.length} project${ids.length !== 1 ? 's' : ''} deleted` });
    } catch {
      toast({ type: 'error', title: 'Failed to delete projects', message: 'Please try again.' });
    } finally {
      setIsDeleting(false);
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
  <div className="relative mr-1">
  <MagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-placeholder)]" />
  <input
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Search projects"
  aria-label="Search projects"
  className="h-8 w-[180px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-8 pr-7 text-[12px] text-[var(--color-foreground)] placeholder:text-[var(--color-text-placeholder)] transition focus:border-[var(--color-primary)] focus:outline-none sm:w-[200px]"
  />
  {search && (
  <button
  type="button"
  onClick={() => setSearch('')}
  aria-label="Clear search"
  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-text-tertiary)] transition hover:text-[var(--color-foreground)]"
  >
  <X className="h-3 w-3" />
  </button>
  )}
  </div>
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
   <Table>
     <Table.ScrollContainer>
       <Table.Content
         aria-label="Projects"
         className="min-w-[800px]"
         selectionMode="multiple"
         selectedKeys={selectedKeys}
         onSelectionChange={setSelectedKeys}
       >
         <Table.Header>
           <Table.Column className="w-10 pr-0">
             <Checkbox slot="selection" aria-label="Select all projects" className="ml-3">
               <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
             </Checkbox>
           </Table.Column>
           <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Project</Table.Column>
           <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Status</Table.Column>
           <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Contract</Table.Column>
           <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Progress</Table.Column>
           <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Budget</Table.Column>
           <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Deadline</Table.Column>
           <Table.Column />
         </Table.Header>
         <Table.Body
           renderEmptyState={() => (
             <div className="flex h-full w-full flex-col items-center justify-center gap-2 py-16 text-center">
               <p className="text-[13px] text-[var(--color-text-muted)]">
                 {filter === 'all' && !search ? 'No projects yet.' : 'No projects match your filters.'}
               </p>
             </div>
           )}
         >
           {pageItems.map((project) => {
             const s = PROJECT_STATUS[project.status] ?? PROJECT_STATUS.active;
             const cs = project.contract
               ? CONTRACT_STATUS[project.contract.status] ?? CONTRACT_STATUS.draft
               : null;
             return (
               <Table.Row key={project.id} id={project.id} className="group hover:bg-[var(--color-background)]">
                 <Table.Cell className="pr-0">
                   <Checkbox slot="selection" aria-label={`Select ${project.name}`} className="ml-3">
                     <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                   </Checkbox>
                 </Table.Cell>
                 <Table.Cell>
                  <Link href={`/projects/${project.id}`} className="min-w-0 block">
                    <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)] transition-colors hover:text-[var(--color-accent)]">
                      {project.name}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{project.ownerName}</p>
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  {project.contract && cs ? (
                    <Link href={`/contracts?contract=${project.contract.id}`}>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cs.bg} ${cs.text}`}>
                        {project.contract.status}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-[11px] text-[var(--color-border-input)]">—</span>
                  )}
                </Table.Cell>
                <Table.Cell>
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
                </Table.Cell>
                <Table.Cell>
                  <p className="text-right text-[13px] tabular-nums text-[var(--color-text-tertiary)]">
                    {isMember
                      ? (project.memberPayout != null ? formatAmount(project.memberPayout, { compact: true }) : null)
                      : formatAmount(project.budgetUsd, { compact: true })}
                  </p>
                </Table.Cell>
                <Table.Cell>
                  <p className="text-right text-[12px] text-[var(--color-text-muted)]">{formatShortDate(project.nextDeadlineAt)}</p>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center justify-end">
                    <RowActionsMenu
                      items={[
                        ...(project.id in linkedProjects
                          ? [{ label: 'Sync Linear', onClick: () => handleSyncLinearStatus(project) }]
                          : [{ label: 'Sync with Linear', onClick: () => handleCreateLinear(project) }]
                        ),
                        { label: 'Delete', onClick: () => setProjectToDelete(project), destructive: true },
                      ]}
                    />
                  </div>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Content>
    </Table.ScrollContainer>
    {filtered.length > PAGE_SIZE && (
      <Table.Footer>
        <Pagination size="sm">
          <Pagination.Summary>
            {filtered.length === 0 ? '0 projects' : `${pageStart}–${pageEnd} of ${filtered.length} projects`}
          </Pagination.Summary>
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous isDisabled={page === 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
                <Pagination.PreviousIcon />
                Previous
              </Pagination.Previous>
            </Pagination.Item>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const startPage = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - 4));
              const p = startPage + i;
              return (
                <Pagination.Item key={p}>
                  <Pagination.Link isActive={p === page} onPress={() => setPage(p)}>
                    {p}
                  </Pagination.Link>
                </Pagination.Item>
              );
            })}
            <Pagination.Item>
              <Pagination.Next isDisabled={page === totalPages} onPress={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
                <Pagination.NextIcon />
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      </Table.Footer>
    )}
  </Table>

  {selectedCount > 0 && (
  <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
  <p className="text-[12px] font-medium text-[var(--color-text-secondary)]">
  {selectedCount} project{selectedCount !== 1 ? 's' : ''} selected
  </p>
  <div className="flex items-center gap-2">
  <Button variant="ghost" size="sm" onClick={() => setSelectedKeys(new Set())}>Clear</Button>
  <Button variant="destructive" size="sm" disabled={isDeleting} onClick={() => void handleBulkDelete()}>
  {isDeleting ? 'Deleting…' : 'Delete'}
  </Button>
  </div>
  </div>
  )}

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

function ExportMenu({ onCsv, onPdf }: { onCsv: () => void; onPdf: () => void }) {
  return (
  <Dropdown>
  <HeroUIButton variant="secondary" className="rounded-full px-4 py-2 text-[13px] font-semibold inline-flex items-center gap-1.5">
  <DownloadSimple className="h-3.5 w-3.5" weight="bold" />
  Export
  </HeroUIButton>
  <Dropdown.Popover>
  <Dropdown.Menu onAction={(key) => {
  if (key === 'csv') onCsv();
  if (key === 'pdf') onPdf();
  }}>
  <Dropdown.Item id="csv" textValue="Download CSV">
  <Label>Download CSV</Label>
  </Dropdown.Item>
  <Dropdown.Item id="pdf" textValue="Download PDF">
  <Label>Download PDF</Label>
  </Dropdown.Item>
  </Dropdown.Menu>
  </Dropdown.Popover>
  </Dropdown>
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
