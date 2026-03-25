import { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from '@/components/ui/lucide-icons';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function MetricCard({ label, value, change, trend = 'up', icon }: { label: string; value: string; change?: string; trend?: 'up' | 'down'; icon?: ReactNode; }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-[#535862]">{label}</p>
            <p className="mt-2 text-[28px] font-semibold leading-none text-[#181d27]">{value}</p>
          </div>
          {icon ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f5f5f5] text-[#717680]">
              {icon}
            </div>
          ) : null}
        </div>
        {change ? (
          <div className={cn('mt-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium',
            trend === 'up'
              ? 'border-[#abefc6] bg-[#ecfdf3] text-[#067647]'
              : 'border-[#fedf89] bg-[#fffaeb] text-[#b54708]'
          )}>
            {trend === 'up' ? <ArrowUpRight className="h-3.5 w-3.5" weight="bold" /> : <ArrowDownRight className="h-3.5 w-3.5" weight="bold" />}
            {change}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
