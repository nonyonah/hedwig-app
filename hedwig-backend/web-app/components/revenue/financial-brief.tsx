'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Skeleton } from '@heroui/react';
import { ArrowRight, Sparkle } from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';
import type { FinancialBrief as FinancialBriefData, FinancialBriefTone } from '@/lib/types/revenue';

const toneStyles: Record<FinancialBriefTone, { dot: string; text: string }> = {
  positive: { dot: 'bg-[var(--color-success)]', text: 'text-[var(--color-foreground)]' },
  neutral: { dot: 'bg-[var(--color-text-tertiary)]', text: 'text-[var(--color-foreground)]' },
  warning: { dot: 'bg-[var(--color-warning)]', text: 'text-[var(--color-foreground)]' },
  danger: { dot: 'bg-[var(--color-danger)]', text: 'text-[var(--color-foreground)]' },
};

function BriefSkeleton() {
  return (
    <Card className="w-full rounded-2xl">
      <div className="p-5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="ml-auto h-3.5 w-12 rounded-md" />
        </div>
        <div className="mt-4 space-y-2.5">
          <Skeleton className="h-4 w-4/5 rounded-md" />
          <Skeleton className="h-4 w-3/5 rounded-md" />
          <Skeleton className="h-4 w-2/3 rounded-md" />
        </div>
      </div>
    </Card>
  );
}

export function FinancialBrief({ accessToken, range = '30d' }: { accessToken: string | null; range?: string }) {
  const [brief, setBrief] = useState<FinancialBriefData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    hedwigApi
      .revenueBrief(range, { accessToken: accessToken ?? undefined })
      .then((data) => {
        if (active) setBrief(data);
      })
      .catch(() => {
        if (active) setBrief(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, accessToken]);

  const visible = useMemo(() => {
    if (loading) return true;
    return brief !== null && brief.display === true && brief.headline.length > 0;
  }, [loading, brief]);

  if (!visible) return null;

  return (
    <Card className="w-full rounded-2xl">
      <div className="flex items-start gap-3 p-5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
          <Sparkle className="h-4 w-4 text-[var(--color-accent)]" weight="bold" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Financial brief</p>
            {brief && (
              <span className="rounded-full bg-[var(--color-background)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">
                {brief.range}
              </span>
            )}
          </div>

          {loading ? (
            <div className="mt-3 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--color-background)]" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--color-background)]" />
            </div>
          ) : (
            <>
              <p className="mt-2 text-[15px] font-semibold leading-snug text-[var(--color-foreground)]">
                {brief?.headline}
              </p>
              {brief && brief.bullets.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {brief.bullets.map((bullet) => {
                    const tone = toneStyles[bullet.tone] ?? toneStyles.neutral;
                    return (
                      <li key={bullet.id} className="flex items-start gap-2">
                        <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                        <span className={`text-[13px] leading-relaxed ${tone.text}`}>{bullet.text}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {brief?.cta && (
                <Link
                  href={brief.cta.href}
                  className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-accent)] hover:text-[var(--color-primary-dark)]"
                >
                  {brief.cta.label} <ArrowRight className="h-3.5 w-3.5" weight="bold" />
                </Link>
              )}
              {brief && brief.facts.runwayScenarios && brief.facts.runwayScenarios.base !== null && (
                <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
                  <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">RUNWAY</p>
                  <div className="mt-2.5 grid grid-cols-3 divide-x divide-[var(--color-border)]">
                    {[
                      { label: 'Base', value: brief.facts.runwayScenarios.base, tone: 'text-[var(--color-foreground)]' },
                      { label: 'Best', value: brief.facts.runwayScenarios.best, tone: 'text-[var(--color-success)]' },
                      { label: 'Worst', value: brief.facts.runwayScenarios.worst, tone: 'text-[var(--color-danger)]' },
                    ].map(({ label, value, tone }) => (
                      <div key={label} className="flex flex-col items-center gap-0.5 px-2 first:pl-0 last:pr-0">
                        <span className={`text-[15px] font-semibold leading-tight ${tone}`}>
                          {value !== null ? `${value}mo` : '—'}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
