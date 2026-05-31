'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { Button as HeroUIButton } from '@heroui/react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

/* --------------------------------------------------------------------------
   Hedwig Button — powered by HeroUI
   Maintains the same API as the previous CVA-based button so every consumer
   keeps working without changes.
   -------------------------------------------------------------------------- */

const buttonVariants = cva(
  'rounded-full font-semibold',
  {
    variants: {
      variant: {
        default: '',
        secondary: '',
        ghost: '',
        outline: '',
        destructive: '',
      },
      size: {
        default: '',
        sm: '',
        lg: '',
        icon: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

/* Map Hedwig variants → HeroUI variants */
const variantMap: Record<string, 'primary' | 'secondary' | 'tertiary' | 'outline' | 'ghost' | 'danger' | 'danger-soft'> = {
  default: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  outline: 'outline',
  destructive: 'danger',
};

/* Map Hedwig sizes → HeroUI sizes */
const sizeMap: Record<string, 'sm' | 'md' | 'lg'> = {
  default: 'md',
  sm: 'sm',
  lg: 'lg',
  icon: 'md',
};

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild = false, onClick, disabled, children, ...props }, ref) => {
    const heroVariant = variantMap[variant as string] ?? 'primary';
    const heroSize = sizeMap[size as string] ?? 'md';
    const isIconOnly = size === 'icon';

    // Build the className that Hedwig consumers expect
    const hedwigClassName = cn(buttonVariants({ variant, size }), className);

    if (asChild) {
      // When asChild is true, we use HeroUIButton's asChild support
      // but we need to cast because the TypeScript types don't expose it.
      return (
        <HeroUIButton
          ref={ref}
          variant={heroVariant}
          size={heroSize}
          isIconOnly={isIconOnly}
          isDisabled={disabled}
          className={hedwigClassName}
          onPress={onClick as any}
          {...(props as any)}
          asChild={true as any}
        >
          <Slot>{children}</Slot>
        </HeroUIButton>
      );
    }

    return (
      <HeroUIButton
        ref={ref}
        variant={heroVariant}
        size={heroSize}
        isIconOnly={isIconOnly}
        isDisabled={disabled}
        className={hedwigClassName}
        onPress={onClick as any}
        {...(props as any)}
      >
        {children}
      </HeroUIButton>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
