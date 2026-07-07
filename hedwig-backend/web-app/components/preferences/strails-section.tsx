'use client';

import { useCallback, useEffect, useState } from 'react';
import { hedwigApi } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { CopySimple, ShieldCheck } from '@/components/ui/lucide-icons';

interface VirtualAccount {
  accountNumber: string;
  accountName: string;
  bankName: string;
  accountType?: string;
}

interface StrailsState {
  onboarded: boolean;
  loading: boolean;
  pollRequestId: string | null;
  virtualAccount: VirtualAccount | null;
  bvnInput: string;
}

export function StrailsSection({ accessToken }: { accessToken: string | null }) {
  const { toast } = useToast();
  const [state, setState] = useState<StrailsState>({
    onboarded: false,
    loading: true,
    pollRequestId: null,
    virtualAccount: null,
    bvnInput: '',
  });

  const fetchStatus = useCallback(async () => {
    if (!accessToken) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    try {
      const res = await hedwigApi.strailsGetVirtualAccount({ accessToken, disableMockFallback: true });
      setState((s) => ({
        ...s,
        loading: false,
        onboarded: res.onboarded && !!res.virtualAccount,
        virtualAccount: res.virtualAccount,
      }));
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [accessToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll for onboarding completion
  useEffect(() => {
    if (!state.pollRequestId || !accessToken) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30; // 2.5 min at 5s intervals

    const poll = async () => {
      if (cancelled || attempts >= maxAttempts) return;
      attempts++;

      try {
        const res = await hedwigApi.strailsOnboardStatus(state.pollRequestId!, {
          accessToken,
          disableMockFallback: true,
        });

        if (res.status === 'completed') {
          await fetchStatus();
          setState((s) => ({ ...s, pollRequestId: null }));
          toast({ type: 'success', title: 'Verified', message: 'Your Nigerian virtual account is ready.' });
          return;
        }
      } catch {
        // silently retry
      }

      if (!cancelled) {
        setTimeout(poll, 5000);
      }
    };

    setTimeout(poll, 3000);
    return () => { cancelled = true; };
  }, [state.pollRequestId, accessToken, fetchStatus, toast]);

  const handleOnboard = async () => {
    const bvn = state.bvnInput.replace(/\D/g, '');
    if (bvn.length !== 11) {
      toast({ type: 'error', title: 'Invalid BVN', message: 'BVN must be 11 digits.' });
      return;
    }

    if (!accessToken) return;

    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await hedwigApi.strailsOnboard(bvn, { accessToken, disableMockFallback: true });
      setState((s) => ({
        ...s,
        loading: false,
        pollRequestId: res.requestId,
      }));
      toast({ type: 'success', title: 'Verifying BVN', message: 'This usually takes a few seconds…' });
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false }));
      toast({ type: 'error', title: 'Onboarding failed', message: err?.message || 'Please try again.' });
    }
  };

  const copyVaNumber = () => {
    if (!state.virtualAccount) return;
    navigator.clipboard.writeText(state.virtualAccount.accountNumber).then(
      () => toast({ type: 'success', title: 'Copied', message: 'Account number copied.' }),
      () => toast({ type: 'error', title: 'Failed to copy' })
    );
  };

  const isPolling = !!state.pollRequestId;

  return (
    <section className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
      <div className="flex items-center justify-between border-b border-[var(--color-surface-tertiary)] px-5 py-4">
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">
            Nigerian virtual account
            {state.virtualAccount && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-success-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
                Active
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">
            Receive NGN bank transfers that auto-convert to USDC. Powered by Strails.
          </p>
        </div>
      </div>

      <div className="px-5 py-5 space-y-3">
        {state.loading && !isPolling ? (
          <p className="text-[13px] text-[var(--color-text-tertiary)]">Loading…</p>
        ) : isPolling ? (
          <div className="rounded-2xl border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)]/30 px-4 py-6 text-center">
            <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            <p className="mt-3 text-[13px] font-semibold text-[var(--color-foreground)]">Verifying your BVN</p>
            <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
              This usually takes less than a minute…
            </p>
          </div>
        ) : state.virtualAccount ? (
          <div className="rounded-2xl border border-[var(--color-border)] px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[18px] leading-none">🇳🇬</span>
                  <p className="text-[14px] font-semibold text-[var(--color-foreground)]">
                    {state.virtualAccount.bankName}
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
                    <ShieldCheck className="h-2.5 w-2.5" weight="bold" /> Active
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
                  {state.virtualAccount.accountName}
                </p>
                <button
                  type="button"
                  onClick={copyVaNumber}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-background)] px-3 py-1.5 text-[14px] font-mono font-medium text-[var(--color-foreground)] transition hover:bg-[var(--color-surface-secondary)]"
                  title="Click to copy account number"
                >
                  {state.virtualAccount.accountNumber}
                  <CopySimple className="h-3.5 w-3.5 text-[var(--color-text-muted)]" weight="regular" />
                </button>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
              Anyone can send NGN to this account and it converts to USDC on Base automatically.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              Enter your BVN to create a Nigerian virtual account that auto-converts deposits to USDC.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={11}
                placeholder="12345678901"
                value={state.bvnInput}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '');
                  if (cleaned.length <= 11) setState((s) => ({ ...s, bvnInput: cleaned }));
                }}
                className="w-48 rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
              <Button
                size="sm"
                onClick={handleOnboard}
                disabled={state.bvnInput.replace(/\D/g, '').length !== 11}
              >
                Verify BVN
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
