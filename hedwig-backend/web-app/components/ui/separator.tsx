import { Separator as HeroUISeparator } from '@heroui/react';
import { cn } from '@/lib/utils';

/* --------------------------------------------------------------------------
   Hedwig Separator — powered by HeroUI
   -------------------------------------------------------------------------- */

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <HeroUISeparator
      className={cn('h-px w-full bg-[var(--color-border)]/75', className)}
      {...props}
    />
  );
}
