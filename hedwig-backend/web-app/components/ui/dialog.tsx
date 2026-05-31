'use client';

import * as React from 'react';
import {
  Modal as HeroUIModal,
  ModalBackdrop as HeroUIModalBackdrop,
  ModalContainer as HeroUIModalContainer,
  ModalDialog as HeroUIModalDialog,
  ModalCloseTrigger as HeroUIModalCloseTrigger,
  ModalHeader as HeroUIModalHeader,
  ModalHeading as HeroUIModalHeading,
  ModalBody as HeroUIModalBody,
  ModalFooter as HeroUIModalFooter,
} from '@heroui/react';
import { X } from '@/components/ui/lucide-icons';
import { cn } from '@/lib/utils';

/* --------------------------------------------------------------------------
   Hedwig Dialog — powered by HeroUI Modal
   Maintains the same compound-component API as Radix Dialog so consumers
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

  return (
    <HeroUIModalBackdrop
      isOpen={open}
      onOpenChange={setOpen}
      variant="blur"
    >
      <HeroUIModalContainer placement="center">
        <HeroUIModalDialog
          className={cn(
            'w-full max-w-[480px] rounded-2xl bg-white shadow-2xl ring-1 ring-[#e9eaeb]',
            className
          )}
          {...(props as any)}
        >
          <HeroUIModalCloseTrigger className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-[#a4a7ae] transition duration-100 hover:bg-[#f5f5f5] hover:text-[#717680]">
            <X className="h-4 w-4" weight="bold" />
            <span className="sr-only">Close</span>
          </HeroUIModalCloseTrigger>
          {children}
        </HeroUIModalDialog>
      </HeroUIModalContainer>
    </HeroUIModalBackdrop>
  );
}

/* ── DialogHeader ──────────────────────────────────────────────────────── */
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <HeroUIModalHeader className={cn('border-b border-[#e9eaeb] px-6 py-5 pr-12', className)} {...props} />;
}

/* ── DialogTitle ───────────────────────────────────────────────────────── */
export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <HeroUIModalHeading className={cn('text-[16px] font-semibold text-[#181d27]', className)} {...props} />;
}

/* ── DialogDescription ───────────────────────────────────────────────── */
export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-[14px] text-[#717680]', className)} {...props} />;
}

/* ── DialogBody ──────────────────────────────────────────────────────── */
export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <HeroUIModalBody className={cn('px-6 py-5', className)} {...props} />;
}

/* ── DialogFooter ──────────────────────────────────────────────────────── */
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <HeroUIModalFooter
      className={cn('flex items-center justify-end gap-3 border-t border-[#e9eaeb] px-6 py-4', className)}
      {...props}
    />
  );
}
