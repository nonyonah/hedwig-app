'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type MessageRole = 'user' | 'assistant';

export const Message = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { role?: MessageRole }
>(({ className, role = 'assistant', ...props }, ref) => (
  <div
    ref={ref}
    data-role={role}
    className={cn('flex w-full gap-3', role === 'user' ? 'justify-end' : 'justify-start', className)}
    {...props}
  />
));
Message.displayName = 'Message';

export const MessageAvatar = ({
  role = 'assistant',
  children,
}: {
  role?: MessageRole;
  children: React.ReactNode;
}) => (
  <div
    aria-hidden="true"
    className={cn(
      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
      role === 'user'
        ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]'
        : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
    )}
  >
    {children}
  </div>
);

export const MessageContent = ({
  role = 'assistant',
  children,
  className,
  variant = 'bubble',
}: {
  role?: MessageRole;
  children: React.ReactNode;
  className?: string;
  variant?: 'bubble' | 'plain';
}) => (
  <div
    className={cn(
      'max-w-[min(760px,calc(100%-3rem))] text-[14px] leading-6',
      variant === 'bubble' && 'rounded-2xl px-4 py-3',
      variant === 'plain'
        ? 'text-[var(--color-foreground)]'
        : role === 'user'
          ? 'bg-[var(--color-surface-secondary)] text-[var(--color-foreground)]'
          : 'rounded-bl-md bg-[var(--color-surface-secondary)] text-[var(--color-foreground)]',
      className,
    )}
  >
    {children}
  </div>
);

export const MessageMeta = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-1 px-1 text-[11px] text-[var(--color-text-muted)]">{children}</div>
);
