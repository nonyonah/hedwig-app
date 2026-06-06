import { HedwigLogo } from '@/components/ui/hedwig-logo';

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[var(--color-surface)]">
      <HedwigLogo width={44} height={44} priority />

      <div
        className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
