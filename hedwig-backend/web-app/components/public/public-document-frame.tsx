import Link from 'next/link';
import { HedwigLogo } from '@/components/ui/hedwig-logo';

export function PublicDocumentFrame({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)]">
      {/* Sticky top nav */}
      <nav className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <HedwigLogo width={30} height={30} className="rounded-[9px]" />
            <span className="text-[14px] font-semibold text-[var(--color-foreground)]">Hedwig</span>
          </Link>
          <span className="rounded-full bg-[var(--color-surface-secondary)] px-3 py-1 text-[12px] font-medium text-[var(--color-text-tertiary)]">{title}</span>
        </div>
      </nav>

      {/* Page content */}
      <div className="mx-auto max-w-5xl px-5 py-8">
        {children}
      </div>

      {/* Footer */}
      <div className="pb-10 pt-2 text-center">
        <p className="text-[12px] text-[var(--color-text-muted)]">
          Powered by{' '}
          <Link href="/" className="font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
            Hedwig
          </Link>{' '}
          — payments for independent professionals
        </p>
      </div>
    </div>
  );
}
