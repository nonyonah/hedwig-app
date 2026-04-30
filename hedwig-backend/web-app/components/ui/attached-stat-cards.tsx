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
        <p className="text-[12px] font-medium text-[#717680]">{item.title}</p>
        {Icon ? (
          <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]', item.iconWrapClassName)}>
            <Icon className={cn('h-3.5 w-3.5 text-[#717680]', item.iconClassName)} weight="regular" />
          </div>
        ) : null}
      </div>

      {item.loading ? (
        <>
          <div className="h-6 w-20 animate-pulse rounded bg-[#f2f4f7]" />
          <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-[#f2f4f7]" />
        </>
      ) : (
        <>
          <p className={cn('text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]', item.valueClassName)}>
            {item.value}
          </p>
          {item.helper ? <div className="mt-1.5 text-[11px] text-[#a4a7ae]">{item.helper}</div> : null}
        </>
      )}
    </>
  );
}

function AttachedStatCard({ item }: { item: AttachedStatCardItem }) {
  const baseClassName = cn(
    'bg-white px-5 py-4 text-left transition duration-100 ease-linear',
    item.active ? 'bg-[#f5f8ff]' : '',
    (item.href || item.onClick) && !item.active ? 'hover:bg-[#fafafa]' : '',
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
    <div className={cn('grid gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]', className)}>
      {items.map((item) => (
        <AttachedStatCard key={item.id} item={item} />
      ))}
    </div>
  );
}
