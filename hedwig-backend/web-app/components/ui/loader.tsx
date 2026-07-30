import { Spinner } from '@heroui/react';

type LoaderProps = {
  size?: number | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: 'accent' | 'current' | 'danger' | 'success' | 'warning';
};

const pixelToHeroSize: Record<string, 'sm' | 'md' | 'lg' | 'xl'> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
};

function toHeroSize(size: NonNullable<LoaderProps['size']>): 'sm' | 'md' | 'lg' | 'xl' {
  if (typeof size === 'string') return pixelToHeroSize[size] ?? 'md';
  if (size <= 12) return 'sm';
  if (size <= 18) return 'md';
  if (size <= 24) return 'lg';
  return 'xl';
}

export function Loader({ size = 'md', className, color }: LoaderProps) {
  return (
    <span className={className} role="status" aria-label="Loading">
      <Spinner size={toHeroSize(size)} color={color} />
    </span>
  );
}
