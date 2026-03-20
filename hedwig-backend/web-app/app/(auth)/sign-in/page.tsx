'use client';

import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

function getIdentityDetails(user: any) {
  const email =
    user?.email?.address ||
    user?.google?.email ||
    user?.apple?.email ||
    '';

  const firstName =
    user?.google?.name?.split?.(' ')?.[0] ||
    user?.apple?.firstName ||
    user?.firstName ||
    '';

  const lastName =
    user?.google?.name?.split?.(' ')?.slice(1).join(' ') ||
    user?.apple?.lastName ||
    user?.lastName ||
    '';

  return { email, firstName, lastName };
}

export default function SignInPage() {
  const { login, authenticated, ready, user, getAccessToken } = usePrivy();
  const router = useRouter();
  const [settling, setSettling] = useState(false);
  const autoOpened = useRef(false);

  // Auto-open Privy modal as soon as SDK is ready
  useEffect(() => {
    if (!ready || authenticated || autoOpened.current) return;
    autoOpened.current = true;
    login();
  }, [ready, authenticated, login]);

  // After Privy login succeeds, exchange for a session cookie
  useEffect(() => {
    if (!ready || !authenticated || settling) return;

    async function settle() {
      setSettling(true);
      try {
        const token = await getAccessToken();
        if (!token) { setSettling(false); return; }

        const identity = getIdentityDetails(user);
        const response = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            user: {
              id: user?.id ?? '',
              privyId: user?.id ?? '',
              email: identity.email,
              firstName: identity.firstName,
              lastName: identity.lastName,
              workspaceId: 'hedwig',
              role: 'owner'
            }
          })
        });

        if (!response.ok) {
          setSettling(false);
          return;
        }

        router.replace('/dashboard');
      } catch {
        setSettling(false);
      }
    }

    settle();
  }, [ready, authenticated]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 bg-white">
      <Image src="/hedwig-logo.png" alt="Hedwig" width={44} height={44} priority />
      {settling ? (
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-[#e9eaeb] border-t-[#2563eb]"
          role="status"
          aria-label="Loading"
        />
      ) : (
        <a
          href="/api/auth/demo"
          className="text-sm text-[#6b7280] underline-offset-4 hover:text-[#2563eb] hover:underline"
        >
          Try demo
        </a>
      )}
    </main>
  );
}
