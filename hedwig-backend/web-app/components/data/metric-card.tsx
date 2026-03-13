import { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function MetricCard({ label, value, change, trend = 'up', icon }: { label: string; value: string; change?: string; trend?: 'up' | 'down'; icon?: ReactNode; }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-primary">{icon}</div>
        </div>
        {change ? (
          <div className={cn('mt-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', trend === 'up' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200')}>
            {trend === 'up' ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {change}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
