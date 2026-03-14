import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        /* UUI textarea: matches input but min-h-[100px] */
        'flex min-h-[100px] w-full rounded-lg border border-[#d5d7da] bg-white px-3.5 py-2.5 text-[14px] text-[#181d27] shadow-xs outline-none placeholder:text-[#a4a7ae] focus-visible:border-[#2563eb] focus-visible:ring-2 focus-visible:ring-[#2563eb]/20 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
