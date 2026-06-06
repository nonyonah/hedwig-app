'use client';

import Link from 'next/link';
import { Lock, Sparkle } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';

export function ProLockCard({
  title,
  description,
  ctaLabel = 'Upgrade to Pro',
  href = '/pricing',
  compact = false,
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  href?: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-xs ring-1 ring-[var(--color-border)]">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-soft)]">
          {compact ? (
            <Lock className="h-4 w-4 text-[var(--color-text-tertiary)]" weight="regular" />
          ) : (
            <Sparkle className="h-4 w-4 text-[var(--color-text-tertiary)]" weight="fill" />
          )}
        </div>
        <p className="text-[15px] font-semibold text-[var(--color-foreground)]">{title}</p>
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--color-text-tertiary)]">{description}</p>
      <div className="mt-4">
        <Button asChild>
          <Link href={href}>{ctaLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
