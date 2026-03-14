import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/* UUI badge: rounded-full (pill), text-xs font-medium, border */
const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium', {
  variants: {
    variant: {
      /* UUI brand: #eff4ff bg, #2563eb border light, #2563eb text */
      default: 'border-[#c7d7f8] bg-[#eff4ff] text-[#2563eb]',
      /* UUI gray: gray-100 bg, gray-200 border, gray-700 text */
      neutral: 'border-[#e9eaeb] bg-[#f5f5f5] text-[#414651]',
      /* UUI success: #ecfdf3 bg, #17b26a border, #067647 text */
      success: 'border-[#abefc6] bg-[#ecfdf3] text-[#067647]',
      /* UUI warning: #fffaeb bg, #fedf89 border, #b54708 text */
      warning: 'border-[#fedf89] bg-[#fffaeb] text-[#b54708]',
      /* UUI error: #fef3f2 bg, #fda29b border, #d92d20 text */
      error: 'border-[#fda29b] bg-[#fef3f2] text-[#d92d20]'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
