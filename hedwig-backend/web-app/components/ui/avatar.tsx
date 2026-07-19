'use client';

import { Avatar as HeroUIAvatar } from '@heroui/react';
import { cn, initials } from '@/lib/utils';
import {
  FolderSimple,
  type IconWeight
} from '@/components/ui/lucide-icons';

function parseAvatarSrc(src: string): { type: 'image'; url: string } | { type: 'emoji'; value: string } | { type: 'icon'; name: string; color: string } {
  if (src.startsWith('emoji:')) return { type: 'emoji', value: src.slice(6) };
  if (src.startsWith('icon:')) {
    const parts = src.split(':');
    return { type: 'icon', name: parts[1], color: parts[2] || '#0d47a1' };
  }
  return { type: 'image', url: src };
}

export function Avatar({
  className,
  label,
  src
}: {
  className?: string;
  label: string;
  src?: string | null;
}) {
  const parsed = src ? parseAvatarSrc(src) : null;

  const renderCustom = () => {
    if (!parsed) return null;
    if (parsed.type === 'emoji') {
      return <span className="text-[14px] leading-none">{parsed.value}</span>;
    }
    if (parsed.type === 'icon') {
      return <FolderSimple className="h-4 w-4" weight="bold" style={{ color: parsed.color }} />;
    }
    return null;
  };

  const customContent = renderCustom();

  if (customContent) {
    return (
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-border)]',
          className
        )}
      >
        {customContent}
      </div>
    );
  }

  return (
    <HeroUIAvatar
      className={cn(
        'h-8 w-8 rounded-full bg-[var(--color-border)] text-[12px] font-semibold text-[var(--color-text-secondary)]',
        className
      )}
    >
      {parsed?.type === 'image' ? (
        <HeroUIAvatar.Image
          alt={label}
          src={parsed.url}
          referrerPolicy="no-referrer"
        />
      ) : null}
      <HeroUIAvatar.Fallback>{initials(label)}</HeroUIAvatar.Fallback>
    </HeroUIAvatar>
  );
}
