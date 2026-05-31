import { Chip } from '@heroui/react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

/* --------------------------------------------------------------------------
   Hedwig Badge — powered by HeroUI Chip
   HeroUI Badge is meant to anchor to another element (avatars, etc.).
   For standalone status labels we use Chip which has the same pill look.
   -------------------------------------------------------------------------- */

const badgeVariants = cva(
  '',
  {
    variants: {
      variant: {
        default: '',
        neutral: '',
        success: '',
        warning: '',
        error: '',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/* Map Hedwig variants → HeroUI Chip colors */
const colorMap: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  default: 'accent',
  neutral: 'default',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};

export function Badge({
  className,
  variant = 'default',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  const color = colorMap[variant as string] ?? 'default';

  return (
    <Chip
      color={color}
      variant="soft"
      size="sm"
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium',
        className
      )}
      {...(props as any)}
    >
      {children}
    </Chip>
  );
}
