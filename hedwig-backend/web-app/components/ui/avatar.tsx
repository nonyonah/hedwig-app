'use client';

import { Avatar as HeroUIAvatar } from '@heroui/react';
import { cn, initials } from '@/lib/utils';
import { FolderSimple } from '@/components/ui/lucide-icons';

function parseAvatarSrc(src: string): { type: 'image'; url: string } | { type: 'emoji'; value: string } | { type: 'icon'; name: string; color: string } {
  if (src.startsWith('emoji:')) return { type: 'emoji', value: src.slice(6) };
  if (src.startsWith('icon:')) {
    const parts = src.split(':');
    return { type: 'icon', name: parts[1], color: parts[2] || '#0d47a1' };
  }
  return { type: 'image', url: src };
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function subtleBg(color: string) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

function gradientBg(color: string) {
  const { r, g, b } = hexToRgb(color);
  return `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.25) 0%, rgba(${r}, ${g}, ${b}, 0.08) 100%)`;
}

function emojiToColor(emoji: string): string {
  const code = [...emoji].reduce((acc, c) => acc + (c.codePointAt(0) ?? 0), 0);
  const hue = code % 360;
  const colors = [
    `hsl(${hue}, 55%, 88%)`,
    `hsl(${(hue + 40) % 360}, 50%, 86%)`,
    `hsl(${(hue + 80) % 360}, 45%, 90%)`,
    `hsl(${(hue + 160) % 360}, 55%, 88%)`,
    `hsl(${(hue + 200) % 360}, 50%, 86%)`,
  ];
  return colors[Math.floor(code / 360) % colors.length];
}

function emojiGradientBg(emoji: string) {
  const code = [...emoji].reduce((acc, c) => acc + (c.codePointAt(0) ?? 0), 0);
  const hue = code % 360;
  return `linear-gradient(135deg, hsl(${hue}, 55%, 88%) 0%, hsl(${(hue + 60) % 360}, 45%, 92%) 100%)`;
}

const sizeMap: Record<string, { container: string; icon: string; font: string }> = {
  xs: { container: 'h-5 w-5 text-[8px]', icon: 'h-3 w-3', font: 'text-[10px]' },
  sm: { container: 'h-7 w-7 text-[10px]', icon: 'h-3.5 w-3.5', font: 'text-[11px]' },
  md: { container: 'h-8 w-8 text-[12px]', icon: 'h-4 w-4', font: 'text-[14px]' },
  lg: { container: 'h-10 w-10 text-[14px]', icon: 'h-5 w-5', font: 'text-[20px]' },
  xl: { container: 'h-12 w-12 text-[16px]', icon: 'h-6 w-6', font: 'text-[24px]' },
};

export function Avatar({
  className,
  label,
  src,
  size = 'md',
  gradient = false,
  as = 'circle',
}: {
  className?: string;
  label: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  gradient?: boolean;
  as?: 'circle' | 'square';
}) {
  const parsed = src ? parseAvatarSrc(src) : null;
  const s = sizeMap[size] || sizeMap.md;
  const shape = as === 'square' ? 'rounded-lg' : 'rounded-full';

  if (parsed?.type === 'emoji') {
    const bg = gradient ? emojiGradientBg(parsed.value) : emojiToColor(parsed.value);
    return (
      <HeroUIAvatar
        className={cn(s.container, shape, className)}
        style={{ background: bg }}
      >
        <HeroUIAvatar.Fallback>
          <span className={s.font}>{parsed.value}</span>
        </HeroUIAvatar.Fallback>
      </HeroUIAvatar>
    );
  }

  if (parsed?.type === 'icon') {
    const bg = gradient ? gradientBg(parsed.color) : subtleBg(parsed.color);
    return (
      <HeroUIAvatar
        className={cn(s.container, shape, className)}
        style={{ background: bg }}
      >
        <HeroUIAvatar.Fallback>
          <FolderSimple className={s.icon} weight="bold" style={{ color: parsed.color }} />
        </HeroUIAvatar.Fallback>
      </HeroUIAvatar>
    );
  }

  return (
    <HeroUIAvatar className={cn(s.container, shape, 'font-semibold', className)}>
      {parsed?.type === 'image' ? (
        <HeroUIAvatar.Image alt={label} src={parsed.url} referrerPolicy="no-referrer" />
      ) : null}
      <HeroUIAvatar.Fallback>{initials(label)}</HeroUIAvatar.Fallback>
    </HeroUIAvatar>
  );
}
