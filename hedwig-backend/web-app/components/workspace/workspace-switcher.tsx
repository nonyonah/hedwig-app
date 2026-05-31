'use client';

import { useRef, useState } from 'react';
import { CaretDown, Plus, Check } from '@/components/ui/lucide-icons';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

type WorkspaceSwitcherProps = {
  collapsed: boolean;
  onOpenCreate: () => void;
};

export function WorkspaceSwitcher({ collapsed, onOpenCreate }: WorkspaceSwitcherProps) {
  const { workspaces, activeWorkspace, switchWorkspace, loading } = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const handleSelect = (id: string) => {
    switchWorkspace(id);
    setOpen(false);
  };

  if (collapsed) {
    const initial = activeWorkspace?.name?.charAt(0)?.toUpperCase() ?? 'H';
    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          title={activeWorkspace?.name ?? 'Workspace'}
          className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 ring-[#eef0f3]"
        >
          <span className="text-[11px] font-bold text-[#414651]">{initial}</span>
        </button>
        {open && (
          <div className="absolute left-10 top-0 z-50 w-48 overflow-hidden rounded-xl border border-[#f3f4f6] bg-white py-1 shadow-lg shadow-black/5">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => handleSelect(ws.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-medium transition hover:bg-[#f8f9fb]',
                  ws.id === activeWorkspace?.id ? 'text-[#181d27]' : 'text-[#414651] hover:text-[#181d27]'
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-[#f4f5f7] text-[10px] font-bold text-[#8d9096]">
                  {ws.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate">{ws.name}</span>
                {ws.id === activeWorkspace?.id && (
                  <Check className="h-3.5 w-3.5 text-[#2563eb]" weight="bold" />
                )}
              </button>
            ))}
            <div className="mx-2 my-1 h-px bg-[#f4f5f7]" />
            <button
              type="button"
              onClick={onOpenCreate}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-medium text-[#414651] transition hover:bg-[#f8f9fb] hover:text-[#181d27]"
            >
              <Plus className="h-3.5 w-3.5 text-[#c1c5cd]" weight="bold" />
              New workspace
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-[#f4f5f7]"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-[#f4f5f7] text-[10px] font-bold text-[#8d9096]">
          {activeWorkspace?.name?.charAt(0)?.toUpperCase() ?? 'H'}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-[#181d27]">
          {activeWorkspace?.name ?? 'Workspace'}
        </span>
        <CaretDown className={cn('h-3 w-3 shrink-0 text-[#c1c5cd] transition', open && 'rotate-180')} weight="bold" />
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-50 w-56 overflow-hidden rounded-xl border border-[#f3f4f6] bg-white py-1 shadow-lg shadow-black/5">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => handleSelect(ws.id)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-medium transition hover:bg-[#f8f9fb]',
                ws.id === activeWorkspace?.id ? 'text-[#181d27]' : 'text-[#414651] hover:text-[#181d27]'
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-[#f4f5f7] text-[10px] font-bold text-[#8d9096]">
                {ws.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 truncate">{ws.name}</span>
              {ws.id === activeWorkspace?.id && (
                <Check className="h-3.5 w-3.5 text-[#2563eb]" weight="bold" />
              )}
            </button>
          ))}
          <div className="mx-2 my-1 h-px bg-[#f4f5f7]" />
          <button
            type="button"
            onClick={onOpenCreate}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-medium text-[#414651] transition hover:bg-[#f8f9fb] hover:text-[#181d27]"
          >
            <Plus className="h-3.5 w-3.5 text-[#c1c5cd]" weight="bold" />
            New workspace
          </button>
        </div>
      )}
    </div>
  );
}
