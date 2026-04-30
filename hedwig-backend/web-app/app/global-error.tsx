'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
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
    <html>
      <body>
        <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-6 text-[#181d27]">
          <section className="w-full max-w-md rounded-xl border border-[#e9eaeb] bg-white p-6 text-center shadow-sm">
            <h1 className="text-[20px] font-semibold">Something went wrong</h1>
            <p className="mt-2 text-[14px] leading-6 text-[#717680]">
              The error has been reported. You can try reloading this view.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-5 inline-flex h-9 items-center justify-center rounded-full bg-[#2563eb] px-4 text-[13px] font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
