'use client';

import { Card } from '@heroui/react';

export function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
      <Card.Header className="border-b border-[var(--color-border)] px-5 py-4">
        <Card.Title className="text-[16px] font-semibold text-[var(--color-foreground)]">{title}</Card.Title>
        {description ? (
          <Card.Description className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">{description}</Card.Description>
        ) : null}
      </Card.Header>
      <div className="divide-y divide-[var(--color-border)]">{children}</div>
    </Card>
  );
}
