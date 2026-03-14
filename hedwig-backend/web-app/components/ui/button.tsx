import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/* Untitled UI button variants — rounded-lg, Inter font-semibold, UUI shadow-xs */
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition duration-100 ease-linear focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        /* UUI primary: bg-brand-600, shadow-xs */
        default: 'bg-[#2563eb] text-white shadow-xs hover:bg-[#1d4ed8]',
        /* UUI secondary: white bg, border border-[#d5d7da], shadow-xs */
        secondary: 'border border-[#d5d7da] bg-white text-[#414651] shadow-xs hover:bg-[#fafafa] hover:text-[#252b37]',
        /* UUI tertiary/ghost: no border, no bg, just text */
        ghost: 'text-[#414651] hover:bg-[#fafafa] hover:text-[#252b37]',
        /* UUI tertiary with border */
        outline: 'border border-[#d5d7da] bg-white text-[#414651] shadow-xs hover:bg-[#fafafa]',
        /* UUI destructive */
        destructive: 'bg-[#d92d20] text-white shadow-xs hover:bg-[#b42318]'
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 px-3.5 text-[13px]',
        lg: 'h-11 px-5',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
