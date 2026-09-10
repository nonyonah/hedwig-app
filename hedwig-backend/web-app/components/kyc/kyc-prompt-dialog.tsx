'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertDialog, Button } from '@heroui/react';
import { hedwigApi, type KycStatusSummary } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';

const DISMISS_KEY = 'hedwig:kyc-prompt-dismissed';

/**
 * Global KYC gate — prompts users who haven't completed verification.
 * Shown on every app load until `kyc_status` is approved; dismissible per
 * session via the close trigger. Uses HeroUI v3 AlertDialog.
 */
export function KycPromptDialog({ accessToken }: { accessToken: string | null }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<KycStatusSummary['status'] | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    if (typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1') return;
    let cancelled = false;
    hedwigApi
      .getKycStatus({ accessToken })
      .then((res) => {
        if (cancelled) return;
        setStatus(res.status);
        if (!res.isApproved && res.status !== 'approved') setOpen(true);
      })
      .catch(() => {
        /* KYC gate is non-blocking — stay silent on failure. */
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && typeof window !== 'undefined') sessionStorage.setItem(DISMISS_KEY, '1');
  };

  const handleVerify = useCallback(async () => {
    setWorking(true);
    try {
      const started = await hedwigApi.startKyc({ accessToken: accessToken ?? undefined });
      if (started.url) {
        window.open(started.url, '_blank', 'noopener,noreferrer');
        toast({ type: 'success', title: 'Verification opened', message: 'Complete the check in the new tab, then come back — we’ll pick up your status automatically.' });
        handleOpenChange(false);
      } else {
        toast({ type: 'error', title: 'Could not start verification', message: started.message || 'Please try again in a moment.' });
      }
    } catch (err: any) {
      toast({ type: 'error', title: 'Could not start verification', message: err?.message || 'Please try again in a moment.' });
    } finally {
      setWorking(false);
    }
  }, [accessToken, toast]);

  const handleCheck = useCallback(async () => {
    setWorking(true);
    try {
      const res = await hedwigApi.checkKycStatus({ accessToken: accessToken ?? undefined });
      setStatus(res.status);
      if (res.isApproved) {
        toast({ type: 'success', title: 'Identity verified', message: 'Your account is fully verified.' });
        handleOpenChange(false);
      } else {
        toast({ type: 'info', title: 'Still under review', message: 'Your verification is still being processed. We’ll let you know when it clears.' });
      }
    } catch {
      toast({ type: 'error', title: 'Status check failed', message: 'Please try again in a moment.' });
    } finally {
      setWorking(false);
    }
  }, [accessToken, toast]);

  const copy =
    status === 'pending'
      ? {
          heading: 'Verification in progress',
          body: 'Your identity check is still being reviewed. Most verifications clear within a few minutes — you can check the latest status below.',
          primary: 'Check status',
          onPrimary: handleCheck,
        }
      : status === 'rejected' || status === 'retry_required'
        ? {
            heading: 'Verification needs attention',
            body: 'Your last identity check couldn’t be approved. Restart verification with a clear photo ID and good lighting to get approved.',
            primary: 'Retry verification',
            onPrimary: handleVerify,
          }
        : {
            heading: 'Verify your identity',
            body: 'To unlock payouts, USD accounts, and higher limits, verify your identity. It takes about 2 minutes with a photo ID.',
            primary: 'Verify now',
            onPrimary: handleVerify,
          };

  return (
    <AlertDialog.Backdrop isOpen={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-[400px]">
          <AlertDialog.CloseTrigger />
          <AlertDialog.Header>
            <AlertDialog.Icon status="accent" />
            <AlertDialog.Heading>{copy.heading}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="text-[13px] text-[var(--color-text-secondary)]">{copy.body}</p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" slot="close">
              Later
            </Button>
            <Button variant="primary" onPress={() => void copy.onPrimary()} isDisabled={working}>
              {working ? 'Working…' : copy.primary}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
