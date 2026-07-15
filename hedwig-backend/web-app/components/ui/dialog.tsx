'use client';

import * as React from 'react';
import {
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { cn } from '@/lib/utils';

const sizeMap: Record<string, 'xs' | 'sm' | 'md' | 'lg' | 'cover' | 'full'> = {
  sm: 'sm',
  md: 'md',
  lg: 'cover',
  xl: 'cover',
  '2xl': 'cover',
  full: 'full',
};

/* ── Contexts ────────────────────────────────────────────────────────────── */
const DialogContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

const ContainerClassContext = React.createContext<{
  containerClass: string;
  setContainerClass: (c: string) => void;
}>({ containerClass: '', setContainerClass: () => {} });

function useDialogContext() {
  return React.useContext(DialogContext);
}

function useContainerClassContext() {
  return React.useContext(ContainerClassContext);
}

/* ── Dialog Root ─────────────────────────────────────────────────────────── */
export function Dialog({
  children,
  open,
  onOpenChange,
  defaultOpen,
  size,
  className,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
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

  const [contentClass, setContentClass] = React.useState('');

  return (
    <DialogContext.Provider value={{ open: value, setOpen }}>
      <ContainerClassContext.Provider value={{ containerClass: contentClass, setContainerClass: setContentClass }}>
        <ModalBackdrop
          isOpen={value}
          onOpenChange={setOpen}
          variant="blur"
        >
          <ModalContainer size={sizeMap[size ?? 'md']} scroll="inside" className={cn(className, contentClass)}>
            <ModalDialog>
              {children}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </ContainerClassContext.Provider>
    </DialogContext.Provider>
  );
}

/* ── DialogTrigger ───────────────────────────────────────────────────────── */
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

/* ── DialogClose ─────────────────────────────────────────────────────────── */
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

/* ── DialogContent ───────────────────────────────────────────────────────── */
const WIDTH_CLASS_RE = /^(!?(max-w-|w-))/;

export function DialogContent({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  const { setContainerClass } = useContainerClassContext();

  React.useEffect(() => {
    if (className) {
      const widthParts = className.split(' ').filter((p) => WIDTH_CLASS_RE.test(p));
      if (widthParts.length) {
        setContainerClass(widthParts.join(' '));
      }
    }
    return () => setContainerClass('');
  }, [className, setContainerClass]);

  return <>{children}</>;
}

/* ── DialogHeader ────────────────────────────────────────────────────────── */
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <ModalHeader className={cn('flex flex-col gap-1 px-6 pb-0 pt-6', className)} {...props} />
  );
}

/* ── DialogTitle ─────────────────────────────────────────────────────────── */
export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-[16px] font-semibold text-[var(--color-text-primary)]', className)} {...props} />
  );
}

/* ── DialogDescription ───────────────────────────────────────────────────── */
export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-[14px] leading-5 text-[var(--color-text-tertiary)]', className)} {...props} />
  );
}

/* ── DialogBody ──────────────────────────────────────────────────────────── */
export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <ModalBody className={cn('px-6 py-5', className)} {...props} />
  );
}

/* ── DialogFooter ────────────────────────────────────────────────────────── */
export function DialogFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }) {
  return (
    <ModalFooter className={cn('flex items-center justify-end gap-3 border-t border-[var(--color-surface-tertiary)] px-6 py-4', className)} {...props}>
      {children}
    </ModalFooter>
  );
}
