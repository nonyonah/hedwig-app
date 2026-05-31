import * as React from 'react';
import { Input as HeroUIInput } from '@heroui/react';
import { cn } from '@/lib/utils';

/* --------------------------------------------------------------------------
   Hedwig Input — powered by HeroUI
   Keeps the same ref + className API so every form and page keeps working.
   -------------------------------------------------------------------------- */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <HeroUIInput
      ref={ref}
      variant="primary"
      className={cn(
        // Hedwig overrides on top of HeroUI input styling
        'h-10 w-full rounded-lg border border-[#d5d7da] bg-white px-3.5 py-2 text-[14px] text-[#181d27] shadow-xs outline-none placeholder:text-[#a4a7ae] focus-visible:border-[#2563eb] focus-visible:ring-2 focus-visible:ring-[#2563eb]/20 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);

Input.displayName = 'Input';
