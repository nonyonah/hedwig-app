'use client';

import { cloneElement, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '@heroui/react';

const sizeMap: Record<string, 'sm' | 'md' | 'lg' | 'cover' | 'full'> = {
  sm: 'sm',
  md: 'md',
  lg: 'cover',
  xl: 'cover',
  '2xl': 'cover',
  full: 'full',
};

type DialogProps = {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
};

export function Dialog({ children, open, onOpenChange, size, className }: DialogProps) {
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange} variant="blur">
      <Modal.Container size={sizeMap[size ?? 'md']} scroll="inside" className={className}>
        <Modal.Dialog>
          {children}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

export function DialogTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  if (asChild && isValidElement(children)) {
    const childProps = children.props as Record<string, unknown>;
    return cloneElement(children, {
      onClick: (e: any) => {
        (childProps.onClick as any)?.(e);
      },
    } as any);
  }
  return <>{children}</>;
}

export function DialogClose({ children, asChild }: { children?: ReactNode; asChild?: boolean }) {
  if (!children) return null;
  if (asChild && isValidElement(children)) {
    const childProps = children.props as Record<string, unknown>;
    return cloneElement(children, {
      ...childProps,
      'slot': 'close' as any,
    } as any);
  }
  return <button type="button">{children}</button>;
}

export function DialogContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function DialogHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <Modal.Header {...props} />;
}

export function DialogTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <Modal.Heading {...props} />;
}

export function DialogDescription(props: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className="text-sm text-muted" {...props} />;
}

export function DialogBody(props: React.HTMLAttributes<HTMLDivElement>) {
  return <Modal.Body {...props} />;
}

export function DialogFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  return <Modal.Footer {...props} />;
}
