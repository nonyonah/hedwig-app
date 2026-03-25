'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { ShieldCheck } from '@/components/ui/lucide-icons';

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith('/sign-in')) {
    return <>{children}</>;
  }

  return <>{children}</>;
}

export function AuthHintCard() {
  return (
    <div className="rounded-[15px] border border-border/80 bg-card p-6 shadow-surface">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[15px] bg-accent text-primary">
        <ShieldCheck className="h-6 w-6 text-[#72706b]" weight="bold" />
      </div>
      <h2 className="text-[1.65rem] font-semibold tracking-[-0.03em] text-foreground">Use the existing Hedwig identity layer</h2>
      <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
        Web sign-in uses Privy and the same Hedwig backend token verification used by the mobile app. No separate auth system is introduced.
      </p>
      <Link
        className="mt-6 inline-flex rounded-[15px] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft"
        href="/dashboard"
      >
        Continue to app shell
      </Link>
    </div>
  );
}
