import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function EntityTable({ title, columns, rows }: { title: string; columns: string[]; rows: Array<Array<{ value: string; href?: string; tone?: 'default' | 'success' | 'warning' | 'neutral'; badge?: boolean }>>; }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {columns.map((column) => (
                  <th key={column} className="px-0 py-3 pr-6 font-medium">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="border-b border-border/60 last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`} className="py-4 pr-6 align-top text-foreground">
                      {cell.badge ? (
                        <Badge variant={cell.tone ?? 'neutral'}>{cell.value}</Badge>
                      ) : cell.href ? (
                        <Link href={cell.href} className="inline-flex items-center gap-1 font-medium text-primary">
                          {cell.value}
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      ) : (
                        cell.value
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
