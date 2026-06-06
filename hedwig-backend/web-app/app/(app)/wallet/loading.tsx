import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function WalletLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-16 rounded-full bg-[var(--color-border-light)]" />
        <div className="h-9 w-72 rounded-full bg-[var(--color-border-light)]" />
        <div className="h-4 w-[34rem] max-w-full rounded-full bg-[var(--color-surface-tertiary)]" />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[15px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xs">
            <div className="h-4 w-24 rounded-full bg-[var(--color-border-light)]" />
            <div className="mt-3 h-7 w-28 rounded-full bg-[var(--color-surface-tertiary)]" />
            <div className="mt-2 h-4 w-32 rounded-full bg-[var(--color-surface-secondary)]" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.3fr_1fr]">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="pb-0">
              <div className="h-4 w-28 rounded-full bg-[var(--color-border-light)]" />
            </CardHeader>
            <CardContent className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((__, innerIndex) => (
                <div key={innerIndex} className="rounded-[15px] border border-[var(--color-border)] bg-[var(--color-background)] p-3.5">
                  <div className="h-4 w-24 rounded-full bg-[var(--color-border-light)]" />
                  <div className="mt-2 h-4 w-40 rounded-full bg-[var(--color-surface-tertiary)]" />
                  <div className="mt-2 h-3 w-20 rounded-full bg-[var(--color-surface-secondary)]" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
