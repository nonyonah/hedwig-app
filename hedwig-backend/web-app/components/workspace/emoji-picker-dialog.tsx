'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTheme } from 'next-themes';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

export function EmojiPickerDialog() {
  const [open, setOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const { updateWorkspaceIcon } = useWorkspaceContext();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setWorkspaceId(detail?.workspaceId ?? null);
      setOpen(true);
    };
    window.addEventListener('hedwig:open-emoji-picker', handler);
    return () => window.removeEventListener('hedwig:open-emoji-picker', handler);
  }, []);

  const handlePick = useCallback((emoji: string) => {
    if (workspaceId) updateWorkspaceIcon(workspaceId, emoji);
    setOpen(false);
    setWorkspaceId(null);
  }, [workspaceId, updateWorkspaceIcon]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={() => { setOpen(false); setWorkspaceId(null); }} />
      <div className="relative rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-surface)] shadow-2xl shadow-[var(--color-foreground)]/15">
        <EmojiPicker
          onEmojiClick={(data) => handlePick(data.emoji)}
          theme={resolvedTheme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT}
          skinTonesDisabled
          searchPlaceholder="Search emoji..."
          width={350}
          height={450}
        />
      </div>
    </div>
  );
}
