import type { ImgHTMLAttributes } from 'react';
import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/utils';

type HedwigLogoProps = Omit<ImageProps, 'src' | 'alt'> & {
  alt?: string;
  variant?: 'logo' | 'icon';
};

/** Hedwig mark — opaque background in light mode, transparent in dark mode. */
export function HedwigLogo({
  alt = 'Hedwig',
  variant = 'logo',
  className,
  ...props
}: HedwigLogoProps) {
  const lightSrc = variant === 'icon' ? '/hedwig-icon.png' : '/hedwig-logo.png';
  const darkSrc = variant === 'icon' ? '/hedwig-icon-transparent.png' : '/hedwig-logo-transparent.png';

  return (
    <span className={cn('relative inline-block shrink-0 overflow-hidden leading-none', className)}>
      <Image {...props} src={lightSrc} alt={alt} className="h-full w-full object-cover dark:hidden" />
      <Image
        {...props}
        src={darkSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover hidden dark:block"
        aria-hidden
      />
    </span>
  );
}

type HedwigLogoImgProps = ImgHTMLAttributes<HTMLImageElement> & {
  variant?: 'logo' | 'icon';
};

/** Native img variant for places that cannot use next/image. */
export function HedwigLogoImg({ alt = 'Hedwig', variant = 'logo', className, ...props }: HedwigLogoImgProps) {
  const lightSrc = variant === 'icon' ? '/hedwig-icon.png' : '/hedwig-logo.png';
  const darkSrc = variant === 'icon' ? '/hedwig-icon-transparent.png' : '/hedwig-logo-transparent.png';

  return (
    <span className={cn('relative inline-block shrink-0 overflow-hidden leading-none', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...props} src={lightSrc} alt={alt} className="h-full w-full object-cover dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...props}
        src={darkSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover hidden dark:block"
        aria-hidden
      />
    </span>
  );
}
