import * as React from 'react';
import { Card as HeroUICard } from '@heroui/react';
import { cn } from '@/lib/utils';

/* --------------------------------------------------------------------------
   Hedwig Card — powered by HeroUI
   Keeps the same compound-component API (Card, CardHeader, CardTitle,
   CardDescription, CardContent) so all existing consumers work unchanged.
   -------------------------------------------------------------------------- */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <HeroUICard
      variant="default"
      className={cn(
        // Hedwig-specific overrides on top of HeroUI's default card styling
        'rounded-xl bg-white text-[#181d27] shadow-xs ring-1 ring-[#e9eaeb]',
        className
      )}
      {...props}
    >
      {children}
    </HeroUICard>
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // HeroUI Card.Header already gives us a clean header block
  return <HeroUICard.Header className={cn('flex flex-col gap-1 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <HeroUICard.Title className={cn('text-[16px] font-semibold text-[#181d27]', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <HeroUICard.Description className={cn('text-[14px] leading-5 text-[#717680]', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <HeroUICard.Content className={cn('px-5 pb-5', className)} {...props} />;
}
