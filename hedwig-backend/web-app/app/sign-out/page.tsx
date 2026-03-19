'use client';

import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function SignOutPage() {
  const { logout, ready } = usePrivy();
  const router = useRouter();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!ready || hasStarted.current) return;
    hasStarted.current = true;

    async function signOut() {
      try {
        await fetch('/api/auth/sign-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch {
        // Keep going — browser-side logout is still the critical step.
      }

      try {
        await logout();
      } catch {
        // If Privy logout throws, we still send the user home after clearing Hedwig cookies.
      } finally {
        router.replace('/');
        router.refresh();
      }
    }

    signOut();
  }, [logout, ready, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 bg-white">
      <Image src="/hedwig-logo.png" alt="Hedwig" width={44} height={44} priority />
      <div
        className="h-5 w-5 animate-spin rounded-full border-2 border-[#e9eaeb] border-t-[#2563eb]"
        role="status"
        aria-label="Signing out"
      />
    </main>
  );
}
