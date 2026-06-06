'use client';

import { useRef, useState } from 'react';
import { CaretDown, Plus, Check } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

type WorkspaceSwitcherProps = {
  collapsed: boolean;
  onOpenCreate: () => void;
};

export function WorkspaceSwitcher({ collapsed, onOpenCreate }: WorkspaceSwitcherProps) {
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const canCreate = !activeWorkspace || activeWorkspace.role !== 'member';

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
          className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 ring-[var(--color-border-light)]"
        >
          <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">{initial}</span>
        </button>
        {open && (
          <div className="absolute left-10 top-0 z-50 w-48 overflow-hidden rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] py-1 shadow-lg shadow-[var(--color-foreground)]/5">
            {workspaces.map((ws) => (
              <Button
                key={ws.id}
                variant="ghost"
                size="sm"
                onClick={() => handleSelect(ws.id)}
                className={cn(
                  'w-full justify-start rounded-none px-3 py-1.5 text-[13px] font-medium',
                  ws.id === activeWorkspace?.id ? 'text-[var(--color-foreground)]' : 'text-[var(--color-text-secondary)]'
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-[var(--color-surface-tertiary)] text-[10px] font-bold text-[var(--color-text-tertiary)]">
                  {ws.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate">{ws.name}</span>
                {ws.id === activeWorkspace?.id && (
                  <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" weight="bold" />
                )}
              </Button>
            ))}
            {canCreate && (
              <>
                <div className="mx-2 my-1 h-px bg-[var(--color-surface-tertiary)]" />
                <button
                  type="button"
                  onClick={onOpenCreate}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
                >
                  <Plus className="h-3.5 w-3.5 text-[var(--color-text-placeholder)]" weight="bold" />
                  New workspace
                </button>
              </>
            )}
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
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-[var(--color-surface-tertiary)]"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-[var(--color-surface-tertiary)] text-[10px] font-bold text-[var(--color-text-tertiary)]">
          {activeWorkspace?.name?.charAt(0)?.toUpperCase() ?? 'H'}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-[var(--color-foreground)]">
          {activeWorkspace?.name ?? 'Workspace'}
        </span>
        <CaretDown className={cn('h-3 w-3 shrink-0 text-[var(--color-text-placeholder)] transition', open && 'rotate-180')} weight="bold" />
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-50 w-56 overflow-hidden rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] py-1 shadow-lg shadow-[var(--color-foreground)]/5">
          {workspaces.map((ws) => (
            <Button
              key={ws.id}
              variant="ghost"
              size="sm"
              onClick={() => handleSelect(ws.id)}
              className={cn(
                'w-full justify-start rounded-none px-3 py-1.5 text-[13px] font-medium',
                ws.id === activeWorkspace?.id ? 'text-[var(--color-foreground)]' : 'text-[var(--color-text-secondary)]'
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-[var(--color-surface-tertiary)] text-[10px] font-bold text-[var(--color-text-tertiary)]">
                {ws.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 truncate">{ws.name}</span>
              {ws.id === activeWorkspace?.id && (
                <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" weight="bold" />
              )}
            </Button>
          ))}
          {canCreate && (
            <>
              <div className="mx-2 my-1 h-px bg-[var(--color-surface-tertiary)]" />
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenCreate}
                className="w-full justify-start rounded-none px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)]"
              >
                <Plus className="h-3.5 w-3.5" weight="bold" />
                New workspace
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
