'use client';

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
        await fetch('/api/auth/session', {
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

        router.replace('/dashboard');
      } catch {
        setSettling(false);
      }
    }

    settle();
  }, [ready, authenticated]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2563eb] text-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden="true">
              <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4.236l-8 4.882-8-4.882V6h16v2.236z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-semibold text-[#181d27]">Sign in to Hedwig</h1>
            <p className="mt-1.5 text-[14px] text-[#717680]">
              Continue with Google, Apple, or email.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-xs ring-1 ring-[#e9eaeb]">
          {settling ? (
            <div className="flex items-center justify-center gap-3 rounded-lg bg-[#f8f9fc] px-4 py-3 text-[14px] font-medium text-[#344054]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#d0d5dd] border-t-[#2563eb]" />
              Signing you in…
            </div>
          ) : (
            <button
              type="button"
              onClick={login}
              disabled={!ready}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2.5 text-[14px] font-semibold text-white shadow-xs transition duration-100 ease-linear hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!ready ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Loading…
                </>
              ) : (
                'Continue to sign in'
              )}
            </button>
          )}

          <p className="mt-4 text-center text-[12px] text-[#a4a7ae]">
            Secured by <span className="font-medium text-[#717680]">Privy</span> — same auth as the mobile app
          </p>
        </div>
      </div>
    </main>
  );
}
