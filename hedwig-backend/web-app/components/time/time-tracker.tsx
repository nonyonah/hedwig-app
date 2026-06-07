'use client';

import { useState } from 'react';
import { Play, Square } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import type { TimeEntry } from '@/components/time/types';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TimeTracker({
  activeEntry,
  elapsed,
  onStart,
  onStop,
}: {
  activeEntry: TimeEntry | null;
  elapsed: number;
  onStart: (projectId?: string, description?: string, rate?: number) => void;
  onStop: () => void;
}) {
  const [description, setDescription] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');

  const handleStart = () => {
    if (!hourlyRate || parseFloat(hourlyRate) <= 0) {
      alert('Please enter an hourly rate before starting the timer.');
      return;
    }
    onStart(undefined, description || undefined, parseFloat(hourlyRate));
    setDescription('');
    setHourlyRate('');
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
      <div className="px-5 py-4">
        {activeEntry ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[18px] font-bold tabular-nums tracking-tight text-[var(--color-foreground)]">
                    {formatElapsed(elapsed)}
                  </p>
                  {activeEntry.hourlyRate && (
                    <span className="text-[12px] font-medium text-[var(--color-text-muted)]">
                      ${Number(activeEntry.hourlyRate).toFixed(2)}/hr
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-[var(--color-text-muted)]">
                  {activeEntry.description || 'No description'}
                </p>
              </div>
            </div>
            <Button variant="destructive" onClick={onStop}>
              <Square className="h-4 w-4" weight="bold" /> Stop
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)]">
                <Play className="h-5 w-5 text-[var(--color-text-tertiary)]" weight="bold" />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="What are you working on?"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2 text-[14px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-[var(--color-text-muted)]">$</span>
                <input
                  type="number"
                  placeholder="Hourly rate"
                  min={0}
                  step="0.01"
                  value={hourlyRate}
                  onChange={e => setHourlyRate(e.target.value)}
                  className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] py-2 pl-8 pr-4 text-[14px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </div>
              <Button variant="default" onClick={handleStart}>
                <Play className="h-4 w-4" weight="bold" /> Start
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
