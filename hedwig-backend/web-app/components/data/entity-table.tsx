import Link from 'next/link';
import { ArrowUpRight } from '@/components/ui/lucide-icons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function EntityTable({
  title,
  columns,
  rows,
  highlightedRowIndex
}: {
  title: string;
  columns: string[];
  rows: Array<Array<{ value: string; href?: string; onClick?: () => void; tone?: 'default' | 'success' | 'warning' | 'neutral'; badge?: boolean; destructive?: boolean; render?: React.ReactNode }>>;
  highlightedRowIndex?: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/80 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {columns.map((column) => (
                  <th key={column} className="px-0 py-2.5 pr-6 font-semibold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={`row-${rowIndex}`}
                  className={cn(
                    'border-b border-border/60 last:border-0',
                    highlightedRowIndex === rowIndex ? 'bg-[#f8fafc]' : ''
                  )}
                >
                  {row.map((cell, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`} className="py-3 pr-6 align-top text-foreground">
                      {cell.render ? (
                        cell.render
                      ) : cell.badge && cell.href ? (
                        <Link href={cell.href} className="inline-flex items-center gap-1">
                          <Badge variant={cell.tone ?? 'neutral'}>{cell.value}</Badge>
                          <ArrowUpRight className="h-4 w-4 text-[#72706b]" weight="bold" />
                        </Link>
                      ) : cell.badge && cell.onClick ? (
                        <button type="button" onClick={cell.onClick} className="inline-flex items-center gap-1">
                          <Badge variant={cell.tone ?? 'neutral'}>{cell.value}</Badge>
                          <ArrowUpRight className="h-4 w-4 text-[#72706b]" weight="bold" />
                        </button>
                      ) : cell.badge ? (
                        <Badge variant={cell.tone ?? 'neutral'}>{cell.value}</Badge>
                      ) : cell.onClick ? (
                        <button
                          type="button"
                          onClick={cell.onClick}
                          className={cn(
                            'inline-flex items-center gap-1 font-semibold',
                            cell.destructive ? 'text-[#717680]' : 'text-primary'
                          )}
                        >
                          {cell.value}
                          {!cell.destructive ? <ArrowUpRight className="h-4 w-4 text-[#72706b]" weight="bold" /> : null}
                        </button>
                      ) : cell.href ? (
                        <Link href={cell.href} className="inline-flex items-center gap-1 font-semibold text-primary">
                          {cell.value}
                          <ArrowUpRight className="h-4 w-4 text-[#72706b]" weight="bold" />
                        </Link>
                      ) : (
                        <span className="font-medium">{cell.value}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
