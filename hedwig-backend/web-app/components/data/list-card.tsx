import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export function ListCard({ title, description, items, emptyText = 'Nothing to show yet.' }: { title: string; description?: string; items: Array<{ id: string; title: string; subtitle?: string; meta?: string; href?: string }>; emptyText?: string; }) {
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">{item.title}</p>
                {item.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{item.subtitle}</p> : null}
              </div>
              <div className="text-right">
                {item.meta ? <p className="text-sm text-muted-foreground">{item.meta}</p> : null}
                {item.href ? (
                  <Link className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary" href={item.href}>
                    Open <ArrowRight className="h-4 w-4" />
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
