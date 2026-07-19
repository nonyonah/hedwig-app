'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
import { X } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

export function CreateWorkspaceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'organization' | 'personal'>('organization');
  const [icon, setIcon] = useState('🚀');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { resolvedTheme } = useTheme();
  const { createWorkspace } = useWorkspaceContext();

  useEffect(() => {
    const handler = () => { setOpen(true); setName(''); setType('organization'); setIcon('🚀'); setError(null); };
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
            <button
              type="button"
              onClick={() => setPickerOpen((p) => !p)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border-light)] text-[22px] transition hover:bg-[var(--color-surface-tertiary)]"
            >
              {icon}
            </button>
            {pickerOpen && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center">
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={() => setPickerOpen(false)} />
                <div className="relative rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-surface)] shadow-2xl shadow-[var(--color-foreground)]/15">
                  <EmojiPicker
                    onEmojiClick={(data) => { setIcon(data.emoji); setPickerOpen(false); }}
                    theme={resolvedTheme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                    skinTonesDisabled
                    searchPlaceholder="Search emoji..."
                    width={350}
                    height={450}
                  />
                </div>
              </div>
            )}
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
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'organization' | 'personal')}
              className="w-full rounded-full border border-[var(--color-border-light)] px-3 py-2 text-[14px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20 bg-[var(--color-surface)]"
            >
              <option value="organization">Organization — for teams and businesses</option>
              <option value="personal">Personal — for solo freelancers</option>
            </select>
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
