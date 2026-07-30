'use client';

import { Chip } from '@heroui/react';
import { cn } from '@/lib/utils';

const colorMap: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  default: 'accent',
  neutral: 'default',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};

export function Badge({
  className,
  variant = 'default',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: string }) {
  return (
    <Chip
      color={colorMap[variant] ?? 'default'}
      variant="soft"
      size="sm"
      className={cn(className)}
      {...(props as any)}
    >
      {children}
    </Chip>
  );
}
