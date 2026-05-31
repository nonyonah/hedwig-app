'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

export function CreateWorkspaceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { createWorkspace } = useWorkspaceContext();

  useEffect(() => {
    const handler = () => { setOpen(true); setName(''); setError(null); };
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
      await createWorkspace(name.trim());
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
      <div className="fixed inset-0 bg-[#181d27]/30" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-[#f3f4f6] bg-white shadow-2xl shadow-black/10">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[#181d27]">Create workspace</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#c1c5cd] transition hover:bg-[#f5f5f5] hover:text-[#717680]"
          >
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 pb-5">
          <div className="mb-4">
            <label className="mb-1.5 block text-[13px] font-medium text-[#414651]">Workspace name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Agency"
              className="w-full rounded-lg border border-[#eef0f3] px-3 py-2 text-[14px] text-[#181d27] outline-none transition placeholder:text-[#c1c5cd] focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20"
              maxLength={100}
            />
            {error && <p className="mt-1.5 text-[12px] text-red-500">{error}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#414651] transition hover:bg-[#f4f5f7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="rounded-lg bg-[#2563eb] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
