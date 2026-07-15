'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import Image from 'next/image';
import { HedwigLogo } from '@/components/ui/hedwig-logo';

type State =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'ready'; workspaceName: string; inviterName?: string; role: string }
  | { kind: 'accepting' }
  | { kind: 'accepted'; workspaceName: string }
  | { kind: 'error'; message: string };

export default function JoinPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { authenticated, user, login, ready, getAccessToken } = usePrivy();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [joinedWsId, setJoinedWsId] = useState<string | null>(null);
  const token = searchParams.get('token');

  const fetchInvitation = useCallback(async () => {
    if (!token) {
      setState({ kind: 'not_found' });
      return;
    }

    try {
      const res = await fetch(`/api/backend/api/workspaces/invitations/${encodeURIComponent(token)}`);
      if (res.status === 404) {
        setState({ kind: 'not_found' });
        return;
      }
      if (!res.ok) throw new Error('Failed to load invitation');
      const body = await res.json();
      const inv = body.data?.invitation;
      if (!inv) {
        setState({ kind: 'not_found' });
        return;
      }
      setState({ kind: 'ready', workspaceName: inv.workspaceName, inviterName: inv.inviterName, role: inv.role });
    } catch {
      setState({ kind: 'error', message: 'Failed to load invitation. Please try again.' });
    }
  }, [token]);

  useEffect(() => { fetchInvitation(); }, [fetchInvitation]);

  const handleAccept = async () => {
    if (!token) return;
    setState({ kind: 'accepting' });
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`/api/backend/api/workspaces/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to accept invitation');
      }
      const body = await res.json();
      const wsId = body.data?.workspaceId;
      setJoinedWsId(wsId);
      if (typeof window !== 'undefined' && wsId) {
        window.localStorage.setItem('hedwig-web-active-workspace', wsId);
      }
      setState({ kind: 'accepted', workspaceName: body.data?.workspaceName || 'the workspace' });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to accept invitation' });
    }
  };

  const handleSignIn = () => login();

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#f3f4f6] bg-white p-8 text-center shadow-sm">
          <p className="text-[14px] text-[#8d9096]">No invitation token provided. Check your link and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#f3f4f6] bg-white p-8 shadow-sm">
        {/* Loading */}
        {state.kind === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#eef0f3] border-t-[#2563eb]" />
            <p className="text-[14px] text-[#8d9096]">Loading invitation...</p>
          </div>
        )}

        {/* Not found */}
        {state.kind === 'not_found' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fef2f2]">
              <span className="text-2xl">&#9998;</span>
            </div>
            <div className="text-center">
              <h2 className="mb-1 text-[16px] font-semibold text-[#181d27]">Invitation not found</h2>
              <p className="text-[13px] text-[#8d9096]">This invitation may have expired or already been accepted.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {state.kind === 'error' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fef2f2]">
              <span className="text-2xl">!</span>
            </div>
            <div className="text-center">
              <h2 className="mb-1 text-[16px] font-semibold text-[#181d27]">Something went wrong</h2>
              <p className="text-[13px] text-[#8d9096]">{state.message}</p>
            </div>
            <button
              type="button"
              onClick={fetchInvitation}
              className="rounded-full bg-[#2563eb] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Try again
            </button>
          </div>
        )}

        {/* Ready to accept */}
        {state.kind === 'ready' && (
          <div className="flex flex-col items-center gap-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#eff6ff]">
              <HedwigLogo width={32} height={32} className="rounded-full" />
            </div>
            <div className="text-center">
              <h2 className="mb-1 text-[16px] font-semibold text-[#181d27]">
                Join {state.workspaceName}
              </h2>
              {state.inviterName && (
                <p className="text-[13px] text-[#8d9096]">
                  {state.inviterName} invited you as a {state.role === 'admin' ? 'admin' : 'member'}
                </p>
              )}
            </div>
            {!ready ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#eef0f3] border-t-[#2563eb]" />
                <span className="text-[13px] text-[#8d9096]">Checking login...</span>
              </div>
            ) : !authenticated ? (
              <div className="w-full space-y-3">
                <p className="text-center text-[13px] text-[#8d9096]">
                  Sign in or create a free account to accept this invitation.
                </p>
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="w-full rounded-full bg-[#2563eb] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8]"
                >
                  Sign in to continue
                </button>
              </div>
            ) : (
              <div className="w-full space-y-3">
                <p className="text-center text-[13px] text-[#8d9096]">
                  Signed in as <span className="font-medium text-[#181d27]">{user?.email?.address || user?.google?.email || user?.apple?.email || 'you'}</span>
                </p>
                <button
                  type="button"
                  onClick={handleAccept}
                  className="w-full rounded-full bg-[#2563eb] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8]"
                >
                  Accept invitation
                </button>
              </div>
            )}
          </div>
        )}

        {/* Accepting */}
        {state.kind === 'accepting' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#eef0f3] border-t-[#2563eb]" />
            <p className="text-[14px] text-[#8d9096]">Accepting invitation...</p>
          </div>
        )}

        {/* Accepted */}
        {state.kind === 'accepted' && (
          <div className="flex flex-col items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ecfdf5]">
              <svg className="h-6 w-6 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="mb-1 text-[16px] font-semibold text-[#181d27]">You are in!</h2>
              <p className="text-[13px] text-[#8d9096]">You have joined {state.workspaceName}.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="w-full rounded-full bg-[#2563eb] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
