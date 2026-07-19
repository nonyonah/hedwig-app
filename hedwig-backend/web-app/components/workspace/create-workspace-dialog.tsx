'use client';

import { useEffect, useRef, useState } from 'react';
import { X, FolderSimple } from '@/components/ui/lucide-icons';
import { IconEmojiPicker, type PickerResult } from '@/components/ui/icon-emoji-picker';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

function iconPreview(result?: PickerResult) {
  if (!result) return <span className="text-[22px]">🚀</span>;
  if (result.type === 'emoji') return <span className="text-[22px]">{result.value}</span>;
  const Icon = FolderSimple;
  return <Icon className="h-5 w-5" weight="bold" style={{ color: result.color }} />;
}

function encodeIcon(result: PickerResult): string {
  if (result.type === 'emoji') return `emoji:${result.value}`;
  return `icon:${result.value}:${result.color}`;
}

export function CreateWorkspaceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'organization' | 'personal'>('organization');
  const [iconResult, setIconResult] = useState<PickerResult | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { createWorkspace } = useWorkspaceContext();

  useEffect(() => {
    const handler = () => { setOpen(true); setName(''); setType('organization'); setIconResult(undefined); setError(null); };
    window.addEventListener('hedwig:open-create-workspace', handler);
    return () => window.removeEventListener('hedwig:open-create-workspace', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const icon = iconResult ? encodeIcon(iconResult) : 'emoji:🚀';
      await createWorkspace(name.trim(), type, icon);
      setOpen(false);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-[var(--color-foreground)]/30" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-surface)] shadow-2xl shadow-[var(--color-foreground)]/10">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[var(--color-foreground)]">Create workspace</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-placeholder)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)]"
          >
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 pb-5">
          <div className="relative mb-4">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-text-secondary)]">Icon</label>
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setPickerOpen((p) => !p)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border-light)] transition hover:bg-[var(--color-surface-tertiary)]"
              >
                {iconPreview(iconResult)}
              </button>
              {pickerOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center">
                  <div className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={() => setPickerOpen(false)} />
                  <div className="relative">
                    <IconEmojiPicker
                      onSelect={(result) => { setIconResult(result); setPickerOpen(false); }}
                      onClose={() => setPickerOpen(false)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-text-secondary)]">Workspace name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Agency"
              className="w-full rounded-full border border-[var(--color-border-light)] px-3 py-2 text-[14px] text-[var(--color-foreground)] outline-none transition placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20"
              maxLength={100}
            />
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-text-secondary)]">Workspace type</label>
            <div className="relative">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'organization' | 'personal')}
                className="w-full appearance-none rounded-full border border-[var(--color-border-light)] px-3 py-2 pr-8 text-[14px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20 bg-[var(--color-surface)]"
              >
                <option value="organization">Organization — for teams and businesses</option>
                <option value="personal">Personal — for solo freelancers</option>
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-muted)]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4.5L6 7.5L9 4.5" />
              </svg>
            </div>
          </div>
          {error && <p className="mb-3 text-[12px] text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-tertiary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="rounded-full bg-[var(--color-create)] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--color-create-dark)] disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
