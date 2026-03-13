'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn, initials } from '@/lib/utils';

export function Avatar({ className, label }: { className?: string; label: string }) {
  return (
    <AvatarPrimitive.Root className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/15 text-sm font-semibold text-primary', className)}>
      <AvatarPrimitive.Fallback>{initials(label)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
