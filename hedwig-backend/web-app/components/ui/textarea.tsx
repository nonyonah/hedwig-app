import * as React from 'react';
import { TextArea as HeroUITextArea } from '@heroui/react';
import { cn } from '@/lib/utils';

/* --------------------------------------------------------------------------
   Hedwig Textarea — powered by HeroUI
   -------------------------------------------------------------------------- */

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <HeroUITextArea
      ref={ref}
      className={cn(
        'min-h-[100px] w-full rounded-lg border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[14px] text-[var(--color-text-primary)] shadow-xs outline-none placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
