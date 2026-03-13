import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-3 py-1 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-primary/12 text-primary',
      neutral: 'bg-muted text-muted-foreground',
      success: 'bg-emerald-500/15 text-emerald-400',
      warning: 'bg-amber-500/15 text-amber-300'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
