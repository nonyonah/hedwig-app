'use client';

import { Button, Dropdown, Label } from '@heroui/react';
import { DotsThreeOutline } from '@/components/ui/lucide-icons';

export interface RowActionItem {
  label: string;
  onClick: () => void | Promise<void>;
  destructive?: boolean;
}

export function RowActionsMenu({
  items,
}: {
  items: RowActionItem[];
  align?: 'left' | 'right';
}) {
  const itemMap = Object.fromEntries(items.map((item) => [item.label, item]));

  return (
    <Dropdown>
      <Button isIconOnly variant="ghost" aria-label="Row actions">
        <DotsThreeOutline className="h-4 w-4" weight="fill" />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu onAction={(key) => itemMap[key as string]?.onClick()}>
          {items.map((item) => (
            <Dropdown.Item
              key={item.label}
              id={item.label}
              textValue={item.label}
              variant={item.destructive ? 'danger' : undefined}
            >
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
