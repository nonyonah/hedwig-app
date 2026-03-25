import Link from 'next/link';
import { ArrowRight } from '@/components/ui/lucide-icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function ListCard({
  title,
  description,
  items,
  emptyText = 'Nothing to show yet.',
  highlightedId
}: {
  title: string;
  description?: string;
  items: Array<{ id: string; title: string; subtitle?: string; meta?: string; href?: string }>;
  emptyText?: string;
  highlightedId?: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null}
        {items.map((item, index) => (
          <div key={item.id}>
            <div
              className={cn(
                'flex items-start justify-between gap-4 rounded-lg px-2 py-2',
                highlightedId === item.id ? 'bg-[#f8fafc]' : ''
              )}
            >
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{item.title}</p>
                {item.subtitle ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.subtitle}</p> : null}
              </div>
              <div className="text-right">
                {item.meta ? <p className="text-sm font-medium text-muted-foreground">{item.meta}</p> : null}
                {item.href ? (
                  <Link className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary" href={item.href}>
                    Open <ArrowRight className="h-4 w-4 text-[#72706b]" weight="bold" />
                  </Link>
                ) : null}
              </div>
            </div>
            {index < items.length - 1 ? <Separator className="mt-4" /> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
