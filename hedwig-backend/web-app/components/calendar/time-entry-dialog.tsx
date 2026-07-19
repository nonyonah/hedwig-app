'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { ClientPortal } from '@/components/ui/client-portal';
import { hedwigApi } from '@/lib/api/client';
import type { TimeEntry } from '@/components/time/types';

export function TimeEntryDialog({
  initial,
  selectedDate,
  accessToken,
  workspaceMembers,
  onSave,
  onClose,
}: {
  initial: TimeEntry | null;
  selectedDate: Date | null;
  accessToken: string | null;
  workspaceMembers?: { id: string; name: string; email: string }[];
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const isEditing = !!initial;
  const [projects, setProjects] = useState<{ id: string; name: string; client?: { id: string; name: string } }[]>([]);
  const [projectId, setProjectId] = useState(initial?.projectId || '');
  const [description, setDescription] = useState(initial?.description || '');
  const defaultDate = selectedDate ? selectedDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(initial ? new Date(initial.startTime).toISOString().slice(0, 10) : defaultDate);
  const [startTime, setStartTime] = useState(initial ? new Date(initial.startTime).toISOString().slice(11, 16) : '09:00');
  const [endTime, setEndTime] = useState(initial?.endTime ? new Date(initial.endTime).toISOString().slice(11, 16) : '10:00');
  const [hourlyRate, setHourlyRate] = useState(initial?.hourlyRate ? String(initial.hourlyRate) : '');
  const [durationHours, setDurationHours] = useState('');
  const [durationMins, setDurationMins] = useState('');
  const [durationMode, setDurationMode] = useState<'times' | 'duration'>(initial?.endTime ? 'times' : 'duration');
  const [saving, setSaving] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectClient, setNewProjectClient] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo || '');
  const [errorMsg, setErrorMsg] = useState('');

  const hasMembers = workspaceMembers && workspaceMembers.length > 0;

  useEffect(() => {
    if (!accessToken) return;
    hedwigApi.projects({ accessToken }).then((list) => setProjects(list as any[])).catch(() => {});
  }, [accessToken]);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim() || !accessToken) return;
    setCreatingProject(true);
    try {
      const deadline = new Date();
      deadline.setFullYear(deadline.getFullYear() + 1);
      const res = await hedwigApi.createProjectSimple({
        title: newProjectName.trim(),
        clientName: newProjectClient.trim() || undefined,
        deadline: deadline.toISOString().slice(0, 10),
      }, { accessToken });
      const p = res.project;
      setProjects(prev => [...prev, { id: p.id, name: p.name || p.title, client: p.client ? { id: p.client.id, name: p.client.name } : undefined }]);
      setProjectId(p.id);
      setShowCreateProject(false);
      setNewProjectName('');
      setNewProjectClient('');
    } catch { /* ignore */ } finally {
      setCreatingProject(false);
    }
  }, [newProjectName, newProjectClient, accessToken]);

  const handleSave = async () => {
    setErrorMsg('');
    const h = parseFloat(durationHours || '0') || 0;
    const m = parseFloat(durationMins || '0') || 0;
    const durationSecs = Math.round(h * 3600 + m * 60);

    if (!description.trim() && !projectId && (durationMode !== 'duration' || durationSecs === 0)) {
      setErrorMsg('Add a description, project, or duration to log time.');
      return;
    }

    setSaving(true);
    try {
      let data: any = {
        projectId: projectId || undefined,
        description: description || undefined,
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
        assignedTo: assignedTo || null,
      };

      if (durationMode === 'times') {
        const s = `${startDate}T${startTime}:00`;
        const e = `${startDate}T${endTime}:00`;
        data.startTime = s;
        data.endTime = e;
      } else {
        data.startTime = `${startDate}T${startTime}:00`;
        data.durationSeconds = durationSecs;
      }

      await onSave(data);
    } finally { setSaving(false); }
  };

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)] animate-in fade-in-0 zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <p className="text-[15px] font-bold text-[var(--color-foreground)]">
                {isEditing ? 'Edit entry' : 'Log time'}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
                {isEditing ? 'Update your time entry' : 'Record hours worked'}
              </p>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)]">
              <X className="h-4 w-4" weight="bold" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Project</label>
              <div className="flex gap-2">
                <select value={projectId} onChange={e => setProjectId(e.target.value)}
                  className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] pl-4 pr-10 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20">
                  <option value="">No project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.client ? ` (${p.client.name})` : ''}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowCreateProject(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
                  title="Create project"
                >
                  <Plus className="h-4 w-4" weight="bold" />
                </button>
              </div>
              {showCreateProject && (
                <div className="mt-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Project name"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2 text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder="Client name (optional)"
                    value={newProjectClient}
                    onChange={e => setNewProjectClient(e.target.value)}
                    className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2 text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowCreateProject(false)} className="flex-1 text-[12px]">
                      Cancel
                    </Button>
                    <Button variant="default" size="sm" onClick={handleCreateProject} disabled={creatingProject || !newProjectName.trim()} className="create-btn flex-1 text-[12px]">
                      {creatingProject ? 'Creating…' : 'Create & select'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Description</label>
              <input type="text" placeholder="What did you work on?"
                value={description} onChange={e => setDescription(e.target.value)}
                className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20" />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20" />
            </div>

            <div className="flex gap-2 rounded-full bg-[var(--color-surface-tertiary)] p-1">
              <button type="button" onClick={() => setDurationMode('times')}
                className={`flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${durationMode === 'times' ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm' : 'text-[var(--color-text-muted)]'}`}>
                Start & end
              </button>
              <button type="button" onClick={() => setDurationMode('duration')}
                className={`flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${durationMode === 'duration' ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm' : 'text-[var(--color-text-muted)]'}`}>
                Duration
              </button>
            </div>

            {durationMode === 'times' ? (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Start</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20" />
                </div>
                <div className="flex-1">
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">End</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                    className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20" />
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Time</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20" />
                </div>
                <div className="flex-1">
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Duration</label>
                  <div className="flex gap-2">
                    <input type="number" placeholder="0" value={durationHours} onChange={e => setDurationHours(e.target.value)}
                      className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20" />
                    <span className="flex items-center text-[12px] text-[var(--color-text-muted)]">h</span>
                    <input type="number" placeholder="0" value={durationMins} onChange={e => setDurationMins(e.target.value)}
                      className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20" />
                    <span className="flex items-center text-[12px] text-[var(--color-text-muted)]">m</span>
                  </div>
                </div>
              </div>
            )}

            {hasMembers && (
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Assigned to</label>
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                  className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] pl-4 pr-10 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20">
                  <option value="">Myself</option>
                  {workspaceMembers!.map(m => (
                    <option key={m.id} value={m.id}>{m.name}{m.email ? ` (${m.email})` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">
                Hourly rate <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-[var(--color-text-muted)]">$</span>
                <input type="number" placeholder="0.00" min={0} step="0.01"
                  value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
                  className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] py-2.5 pl-8 pr-4 text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20" />
              </div>
            </div>
          </div>

          {errorMsg && (
            <p className="px-5 py-2 text-[12px] font-medium text-[var(--color-danger)]">{errorMsg}</p>
          )}
          <div className="flex gap-3 border-t border-[var(--color-border)] px-5 py-4">
            <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
            <Button variant="default" onClick={handleSave} disabled={saving} className="create-btn flex-1">
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Save entry'}
            </Button>
          </div>
        </div>
      </div>
    </ClientPortal>
  );
}
