'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap } from 'lucide-react';
import { navigation } from '@/lib/utils/navigation';
import { cn } from '@/lib/utils';

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-white/5 bg-slate-950/80 px-5 py-6 lg:flex lg:flex-col">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Zap className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Hedwig</p>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Freelancer OS</h1>
        </div>
      </div>

      <nav className="space-y-1.5">
        {navigation.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition',
                active ? 'bg-primary text-primary-foreground shadow-panel' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              )}
            >
              <Icon className="h-4.5 w-4.5" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-3xl border border-primary/20 bg-primary/10 p-5 text-sm text-primary-foreground/90">
        <p className="font-semibold text-primary">AI in the workflow</p>
        <p className="mt-2 leading-6 text-slate-300">
          Draft invoices and payment links from prompts, then review, edit, and confirm before anything touches the backend.
        </p>
      </div>
    </aside>
  );
}
