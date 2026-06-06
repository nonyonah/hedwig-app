'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type AttachedStatCardItem = {
  id: string;
  title: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  icon?: ComponentType<any>;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
  valueClassName?: string;
  iconClassName?: string;
  iconWrapClassName?: string;
  className?: string;
};

function AttachedStatCardBody({ item }: { item: AttachedStatCardItem }) {
  const Icon = item.icon;

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-medium text-[var(--color-text-tertiary)]">{item.title}</p>
        {Icon ? (
          <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-surface-secondary)]', item.iconWrapClassName)}>
            <Icon className={cn('h-3.5 w-3.5 text-[var(--color-text-tertiary)]', item.iconClassName)} weight="regular" />
          </div>
        ) : null}
      </div>

      {item.loading ? (
        <>
          <div className="h-6 w-20 animate-pulse rounded bg-[var(--color-surface-tertiary)]" />
          <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-[var(--color-surface-tertiary)]" />
        </>
      ) : (
        <>
          <p className={cn('text-[22px] font-bold tracking-[-0.03em] leading-none text-[var(--color-foreground)]', item.valueClassName)}>
            {item.value}
          </p>
          {item.helper ? <div className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">{item.helper}</div> : null}
        </>
      )}
    </>
  );
}

function AttachedStatCard({ item }: { item: AttachedStatCardItem }) {
  const baseClassName = cn(
    'bg-[var(--color-surface)] px-5 py-4 text-left transition duration-100 ease-linear',
    item.active ? 'bg-[var(--color-accent-soft)]' : '',
    (item.href || item.onClick) && !item.active ? 'hover:bg-[var(--color-background)]' : '',
    item.className,
  );

  if (item.href) {
    return (
      <Link href={item.href} className={baseClassName}>
        <AttachedStatCardBody item={item} />
      </Link>
    );
  }

  if (item.onClick) {
    return (
      <button type="button" onClick={item.onClick} className={baseClassName}>
        <AttachedStatCardBody item={item} />
      </button>
    );
  }

  return (
    <div className={baseClassName}>
      <AttachedStatCardBody item={item} />
    </div>
  );
}

export function AttachedStatGrid({
  items,
  className,
}: {
  items: AttachedStatCardItem[];
  className?: string;
}) {
  return (
    <div className={cn('grid gap-px overflow-hidden rounded-2xl bg-[var(--color-border)] ring-1 ring-[var(--color-border)]', className)}>
      {items.map((item) => (
        <AttachedStatCard key={item.id} item={item} />
      ))}
    </div>
  );
}
