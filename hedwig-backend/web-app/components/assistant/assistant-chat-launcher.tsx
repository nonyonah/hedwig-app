'use client';

import { useState } from 'react';
import { AssistantChatPanel } from '@/components/assistant/assistant-chat-panel';
import { HedwigLogoImg } from '@/components/ui/hedwig-logo';

export function AssistantChatLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ask Hedwig"
        aria-label="Open Hedwig assistant"
        className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent)] text-white shadow-lg ring-1 ring-[var(--color-accent)]/30 transition-transform duration-150 hover:scale-105 hover:bg-[var(--color-primary-dark)] active:scale-95"
      >
        <HedwigLogoImg className="h-full w-full object-cover" />
      </button>

      <AssistantChatPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
