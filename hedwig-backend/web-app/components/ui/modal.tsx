'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * shadcn-pattern modal (same component API as shadcn/ui dialog) styled to
 * Hedwig's design language: rounded-xl border surface, compact width.
 * Custom implementation (no Radix dep): fixed blur overlay, Escape to close,
 * body scroll-lock, content scrolls inside the panel.
 */

export function Modal({ children, open, onOpenChange }: { children: ReactNode; open: boolean; onOpenChange?: (open: boolean) => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => onOpenChange?.(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export function ModalContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('overflow-y-auto px-6 py-4', className)}>{children}</div>;
}

export function ModalHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-6 pb-0 pt-5', className)}>{children}</div>;
}

export function ModalTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-[18px] font-semibold text-[var(--color-foreground)]', className)}>{children}</h2>;
}

export function ModalDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mt-1 text-[13px] text-[var(--color-text-tertiary)]', className)}>{children}</p>;
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex justify-end gap-2 border-t border-[var(--color-border)] px-6 py-4', className)}>{children}</div>
  );
}

export function ModalClose({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return <span onClick={onClose}>{children}</span>;
}
