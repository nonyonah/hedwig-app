'use client';

import { Button as HeroUIButton, Dropdown, Label } from '@heroui/react';
import { Plus, Check } from '@/components/ui/lucide-icons';
import { Avatar } from '@/components/ui/avatar';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

type WorkspaceSwitcherProps = {
  collapsed: boolean;
  onOpenCreate: () => void;
};

export function WorkspaceSwitcher({ collapsed, onOpenCreate }: WorkspaceSwitcherProps) {
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspaceContext();

  const canCreate = !activeWorkspace || activeWorkspace.role !== 'member';

  const menuPopover = (
    <Dropdown.Popover>
      <Dropdown.Menu onAction={(key) => {
        if (key === '__create__') onOpenCreate();
        else switchWorkspace(key as string);
      }}>
        {workspaces.map((ws) => (
          <Dropdown.Item key={ws.id} id={ws.id} textValue={ws.name}>
            <Avatar label={ws.name} src={ws.icon || undefined} size="xs" as="square" />
            <Label>{ws.name}</Label>
            {ws.id === activeWorkspace?.id && (
              <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" weight="bold" />
            )}
          </Dropdown.Item>
        ))}
        {canCreate && (
          <Dropdown.Item id="__create__" textValue="New workspace">
            <Plus className="h-3.5 w-3.5" weight="bold" />
            <Label>New workspace</Label>
          </Dropdown.Item>
        )}
      </Dropdown.Menu>
    </Dropdown.Popover>
  );

  if (collapsed) {
    return (
      <Dropdown>
        <HeroUIButton isIconOnly variant="ghost" className="h-6 w-6 min-w-0 rounded-md p-0" aria-label={activeWorkspace?.name ?? 'Workspace'}>
          <Avatar label={activeWorkspace?.name ?? 'Workspace'} src={activeWorkspace?.icon || undefined} size="xs" as="square" />
        </HeroUIButton>
        {menuPopover}
      </Dropdown>
    );
  }

  return (
    <Dropdown>
      <HeroUIButton variant="ghost" className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 justify-start">
        <Avatar label={activeWorkspace?.name ?? 'Workspace'} src={activeWorkspace?.icon || undefined} size="xs" as="square" />
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-[var(--color-foreground)]">
          {activeWorkspace?.name ?? 'Workspace'}
        </span>
      </HeroUIButton>
      {menuPopover}
    </Dropdown>
  );
}
