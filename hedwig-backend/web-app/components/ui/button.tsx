'use client';

import { cloneElement, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { Button as HeroUIButton } from '@heroui/react';

const variantMap: Record<string, 'primary' | 'secondary' | 'tertiary' | 'outline' | 'ghost' | 'danger' | 'danger-soft'> = {
  default: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  outline: 'outline',
  destructive: 'danger',
};

const sizeMap: Record<string, 'sm' | 'md' | 'lg'> = {
  default: 'md',
  sm: 'sm',
  lg: 'lg',
  icon: 'md',
};

type ButtonProps = {
  variant?: string;
  size?: string;
  asChild?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
  'aria-label'?: string;
  form?: string;
};

export function Button({
  variant = 'default',
  size = 'default',
  asChild,
  disabled,
  children,
  onClick,
  ...props
}: ButtonProps) {
  if (asChild && isValidElement(children)) {
    const childProps = children.props as Record<string, unknown>;
    return cloneElement(children, {
      ...props,
      onClick,
      disabled,
      className: childProps.className,
    } as any);
  }

  return (
    <HeroUIButton
      variant={variantMap[variant] ?? 'primary'}
      size={sizeMap[size] ?? 'md'}
      isIconOnly={size === 'icon'}
      isDisabled={disabled}
      onPress={onClick as any}
      {...(props as any)}
    >
      {children}
    </HeroUIButton>
  );
}
