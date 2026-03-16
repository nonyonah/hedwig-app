'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn, initials } from '@/lib/utils';

export function Avatar({
  className,
  label,
  src
}: {
  className?: string;
  label: string;
  src?: string | null;
}) {
  return (
    <AvatarPrimitive.Root className={cn('relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e9eaeb] text-[12px] font-semibold text-[#414651]', className)}>
      {src ? (
        <AvatarPrimitive.Image
          alt={label}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          src={src}
        />
      ) : null}
      <AvatarPrimitive.Fallback>{initials(label)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
