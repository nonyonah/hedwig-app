'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type UsageMetric = {
  metric: string;
  current: number;
  limit: number | null;
  remaining: number | null;
};

type UsageData = {
  metrics: UsageMetric[];
  resetsAt: string;
};

export function UsageCounter() {
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/assistant/usage')
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        if (payload.success) {
          setData(payload.data);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (error || !data) return null;

  const aiPrompts = data.metrics.find((m) => m.metric === 'ai_prompts');
  if (!aiPrompts || aiPrompts.limit === null) return null;

  const pct = Math.min((aiPrompts.current / aiPrompts.limit) * 100, 100);
  const isLow = aiPrompts.remaining !== null && aiPrompts.remaining < 20;

  return (
    <div className="group relative">
      <div className="flex items-center gap-2 rounded-md bg-[#f8f9fb] px-2.5 py-1.5">
        <span className="text-[11px] font-medium text-[#717680]">
          {aiPrompts.current}/{aiPrompts.limit}
        </span>
        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[#e9eaeb]">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              isLow ? 'bg-[#dc2626]' : 'bg-[#2563eb]',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[#181d27] px-3 py-1.5 text-[11px] text-white shadow-lg group-hover:block">
        {aiPrompts.remaining} AI prompts remaining this month
      </div>
    </div>
  );
}
