'use client';

import * as React from 'react';
import { AlertDialog as HeroUIAlertDialog } from '@heroui/react';
import { cn } from '@/lib/utils';
import { X } from '@/components/ui/lucide-icons';

type HeroUIAlertStatus = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  status,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  status?: 'info' | 'success' | 'warning' | 'danger';
  children?: React.ReactNode;
}) {
  return (
    <HeroUIAlertDialog.Root isOpen={open} onOpenChange={onOpenChange}>
      <HeroUIAlertDialog.Backdrop variant="blur" />
      <HeroUIAlertDialog.Container placement="center">
        <HeroUIAlertDialog.Dialog
          className={cn(
            'w-full max-w-[460px] rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)] outline-none'
          )}
        >
          <HeroUIAlertDialog.CloseTrigger className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition duration-100 hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)]">
            <X className="h-4 w-4" weight="bold" />
          </HeroUIAlertDialog.CloseTrigger>
          {status ? (
            <HeroUIAlertDialog.Icon
              status={status === 'info' ? 'default' : status as Exclude<HeroUIAlertStatus, 'default' | 'accent'>}
            />
          ) : null}
          <HeroUIAlertDialog.Header className="border-b border-[var(--color-border)] px-6 py-5 pr-12">
            <HeroUIAlertDialog.Heading className="text-[16px] font-semibold text-[var(--color-foreground)]">
              {title}
            </HeroUIAlertDialog.Heading>
            {description ? (
              <p className="mt-1 text-[14px] text-[var(--color-text-tertiary)]">{description}</p>
            ) : null}
          </HeroUIAlertDialog.Header>
          {children ? (
            <HeroUIAlertDialog.Body className="px-6 py-5">
              {children}
            </HeroUIAlertDialog.Body>
          ) : null}
        </HeroUIAlertDialog.Dialog>
      </HeroUIAlertDialog.Container>
    </HeroUIAlertDialog.Root>
  );
}
