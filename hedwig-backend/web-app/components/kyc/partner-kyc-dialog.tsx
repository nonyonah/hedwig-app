'use client';

import { useState } from 'react';
import { AlertDialog, Button } from '@heroui/react';
import { hedwigApi } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';

/**
 * Partner KYC gate — shown before opening an NGN or USD account.
 * Our banking partners (Bridge, Flutterwave/Anchor) require identity
 * verification before they provision accounts. Uses HeroUI v3 AlertDialog.
 */
export function PartnerKycDialog({
  open,
  onOpenChange,
  accessToken,
  partnerName,
  onVerified,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string | null;
  partnerName: string;
  onVerified: () => void;
}) {
  const { toast } = useToast();
  const [working, setWorking] = useState(false);

  const handleVerify = async () => {
    setWorking(true);
    try {
      const started = await hedwigApi.startKyc({ accessToken: accessToken ?? undefined });
      if (started.url) {
        window.open(started.url, '_blank', 'noopener,noreferrer');
        toast({ type: 'success', title: 'Verification opened', message: 'Complete the check in the new tab, then tap “I’ve completed it” below.' });
      } else {
        toast({ type: 'error', title: 'Could not start verification', message: started.message || 'Please try again in a moment.' });
      }
    } catch (err: any) {
      toast({ type: 'error', title: 'Could not start verification', message: err?.message || 'Please try again in a moment.' });
    } finally {
      setWorking(false);
    }
  };

  const handleCheck = async () => {
    setWorking(true);
    try {
      const res = await hedwigApi.checkKycStatus({ accessToken: accessToken ?? undefined });
      if (res.isApproved) {
        onOpenChange(false);
        onVerified();
      } else {
        toast({ type: 'info', title: 'Not verified yet', message: 'Complete the verification in the opened tab, then check again.' });
      }
    } catch {
      toast({ type: 'error', title: 'Status check failed', message: 'Please try again in a moment.' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <AlertDialog.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-[400px]">
          <AlertDialog.CloseTrigger />
          <AlertDialog.Header>
            <AlertDialog.Icon status="accent" />
            <AlertDialog.Heading>Verification required</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              Our partner {partnerName} requires identity verification before opening this account. It takes about
              2 minutes with a photo ID — your account setup continues right after.
            </p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" slot="close">
              Cancel
            </Button>
            <Button variant="secondary" onPress={() => void handleCheck()} isDisabled={working}>
              I’ve completed it
            </Button>
            <Button variant="primary" onPress={() => void handleVerify()} isDisabled={working}>
              {working ? 'Working…' : 'Verify now'}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
