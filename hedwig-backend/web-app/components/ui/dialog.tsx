'use client';

import * as React from 'react';
import { X } from '@/components/ui/lucide-icons';
import { cn } from '@/lib/utils';

/* --------------------------------------------------------------------------
   Hedwig Dialog — plain Tailwind overlay
   Maintains the same compound-component API as before so consumers
   need zero changes.
   -------------------------------------------------------------------------- */

/* Context to share open state between Trigger and Content */
const DialogContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

function useDialogContext() {
  return React.useContext(DialogContext);
}

/* ── Dialog Root ───────────────────────────────────────────────────────── */
export function Dialog({ children, open, onOpenChange, defaultOpen }: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const isControlled = open !== undefined;
  const value = isControlled ? open : internalOpen;

  const setOpen = React.useCallback(
    (v: boolean) => {
      if (!isControlled) setInternalOpen(v);
      onOpenChange?.(v);
    },
    [isControlled, onOpenChange]
  );

  return (
    <DialogContext.Provider value={{ open: value, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

/* ── DialogTrigger ─────────────────────────────────────────────────────── */
export function DialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const { setOpen } = useDialogContext();
  const child = React.Children.only(children) as React.ReactElement<any>;

  if (asChild && React.isValidElement(child)) {
    const childProps = child.props as Record<string, any>;
    return React.cloneElement(
      child,
      {
        onClick: (e: React.MouseEvent) => {
          childProps.onClick?.(e);
          setOpen(true);
        },
      } as any
    );
  }

  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  );
}

/* ── DialogClose ───────────────────────────────────────────────────────── */
export function DialogClose({ children, asChild }: { children?: React.ReactNode; asChild?: boolean }) {
  const { setOpen } = useDialogContext();
  if (children) {
    if (asChild) {
      const child = React.Children.only(children) as React.ReactElement<any>;
      const childProps = child.props as Record<string, any>;
      return React.cloneElement(
        child,
        {
          onClick: (e: React.MouseEvent) => {
            childProps.onClick?.(e);
            setOpen(false);
          },
        } as any
      );
    }
    return (
      <button type="button" onClick={() => setOpen(false)}>
        {children}
      </button>
    );
  }
  return null;
}

/* ── DialogContent ─────────────────────────────────────────────────────── */
export function DialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = useDialogContext();

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full max-w-[480px] rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)]',
          className
        )}
        {...(props as any)}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition duration-100 hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)]"
        >
          <X className="h-4 w-4" weight="bold" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    </div>
  );
}

/* ── DialogHeader ──────────────────────────────────────────────────────── */
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-[var(--color-border)] px-6 py-5 pr-12', className)} {...props} />;
}

/* ── DialogTitle ───────────────────────────────────────────────────────── */
export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-[16px] font-semibold text-[var(--color-text-primary)]', className)} {...props} />;
}

/* ── DialogDescription ───────────────────────────────────────────────── */
export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-[14px] text-[var(--color-text-tertiary)]', className)} {...props} />;
}

/* ── DialogBody ──────────────────────────────────────────────────────── */
export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-5', className)} {...props} />;
}

/* ── DialogFooter ──────────────────────────────────────────────────────── */
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4', className)} {...props} />;
}
