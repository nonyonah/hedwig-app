'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith('/sign-in')) {
    return <>{children}</>;
  }

  return <>{children}</>;
}

export function AuthHintCard() {
  return (
    <div className="rounded-2xl border border-border bg-card/90 p-6 shadow-panel">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Use the existing Hedwig identity layer</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Web sign-in uses Privy and the same Hedwig backend token verification used by the mobile app. No separate auth system is introduced.
      </p>
      <Link
        className="mt-5 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        href="/dashboard"
      >
        Continue to app shell
      </Link>
    </div>
  );
}
