'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import Image from 'next/image';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[var(--color-surface)] px-6">
      <Image src="/hedwig-icon.png" alt="" width={48} height={48} priority />

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[20px] font-semibold text-[var(--color-foreground)]">Something went wrong</h1>
        <p className="max-w-sm text-[14px] leading-6 text-[var(--color-text-tertiary)]">
          The error has been reported. You can try reloading this view.
        </p>
      </div>

      <button
        type="button"
        onClick={reset}
        className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--color-primary)] px-4 text-[13px] font-semibold text-white transition hover:bg-[var(--color-primary-dark)]"
      >
        Try again
      </button>
    </div>
  );
}
