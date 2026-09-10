'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, ModalClose, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { hedwigApi } from '@/lib/api/client';

const inputClass =
  'h-11 w-full rounded-xl border border-[var(--color-border)] bg-transparent px-3 font-mono text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-tertiary)]';

/**
 * Provision a pending NGN account through Flutterwave (static virtual
 * account). BVN/NIN is passed through transiently and never stored.
 */
export function ProvisionNgnDialog({
  open,
  onOpenChange,
  accessToken,
  workspaceId,
  onProvisioned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string | null;
  workspaceId?: string | null;
  onProvisioned: () => void;
}) {
  const [doc, setDoc] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const digits = doc.replace(/\D/g, '');
  const valid = digits.length === 11;

  const handleSubmit = async () => {
    if (!valid) return;
    setPending(true);
    setError('');
    try {
      await hedwigApi.provisionNgnAccount(
        { bvn: digits },
        { accessToken: accessToken ?? '', workspaceId, disableMockFallback: true }
      );
      setDoc('');
      onOpenChange(false);
      onProvisioned();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not provision NGN account.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setDoc('');
          setError('');
        }
        onOpenChange(o);
      }}
    >
      <ModalHeader>
        <ModalTitle>Provision NGN account</ModalTitle>
        <ModalDescription>
          Enter your BVN or NIN to receive a permanent Nigerian collection account. It is sent to Flutterwave
          once and never stored.
        </ModalDescription>
      </ModalHeader>
      <ModalContent>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-semibold text-[var(--color-foreground)]" htmlFor="ngn-doc">
            BVN or NIN
          </label>
          <input
            id="ngn-doc"
            value={doc}
            onChange={(e) => setDoc(e.target.value.replace(/\D/g, '').slice(0, 11))}
            inputMode="numeric"
            placeholder="12345678901"
            className={inputClass}
          />
          {doc.length > 0 && !valid && (
            <p className="text-[12px] text-[var(--color-text-tertiary)]">Enter all 11 digits</p>
          )}
          {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
        </div>
      </ModalContent>
      <ModalFooter>
        <ModalClose onClose={() => onOpenChange(false)}>
          <Button variant="ghost">Cancel</Button>
        </ModalClose>
        <Button onClick={handleSubmit} disabled={pending || !valid}>
          {pending ? 'Provisioning…' : 'Provision account'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
