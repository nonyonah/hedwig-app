'use client';

import { Avatar as HeroUIAvatar } from '@heroui/react';
import { cn, initials } from '@/lib/utils';

/* --------------------------------------------------------------------------
   Hedwig Avatar — powered by HeroUI
   -------------------------------------------------------------------------- */

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
    <HeroUIAvatar
      className={cn(
        'h-8 w-8 rounded-full bg-[#e9eaeb] text-[12px] font-semibold text-[#414651]',
        className
      )}
    >
      {src ? (
        <HeroUIAvatar.Image
          alt={label}
          src={src}
          referrerPolicy="no-referrer"
        />
      ) : null}
      <HeroUIAvatar.Fallback>{initials(label)}</HeroUIAvatar.Fallback>
    </HeroUIAvatar>
  );
}
