import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        /* UUI input: rounded-lg, border-[#d5d7da], shadow-xs, focus: ring-2 ring-[#2563eb] */
        'flex h-10 w-full rounded-lg border border-[#d5d7da] bg-white px-3.5 py-2 text-[14px] text-[#181d27] shadow-xs outline-none placeholder:text-[#a4a7ae] focus-visible:border-[#2563eb] focus-visible:ring-2 focus-visible:ring-[#2563eb]/20 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
