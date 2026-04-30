'use client';

import { useState } from 'react';
import { AssistantChatPanel } from '@/components/assistant/assistant-chat-panel';

export function AssistantChatLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ask Hedwig"
        aria-label="Open Hedwig assistant"
        className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#2563eb] text-white shadow-lg ring-1 ring-[#2563eb]/30 transition-transform duration-150 hover:scale-105 hover:bg-[#1d4ed8] active:scale-95"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hedwig-logo.png" alt="Hedwig" className="h-full w-full object-cover" />
      </button>

      <AssistantChatPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
