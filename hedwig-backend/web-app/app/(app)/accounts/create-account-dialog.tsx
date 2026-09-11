'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, ModalClose, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { CaretDown } from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';

const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'NGN', label: 'NGN — Nigerian Naira' },
  // GBP + EUR disabled until their providers ship — added back gradually.
] as const;

const ACCOUNT_TYPES_ALL = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'payroll', label: 'Payroll' },
] as const;

// Nigerian accounts come as current/savings.
const ACCOUNT_TYPES_NGN = [
  { value: 'current', label: 'Current' },
  { value: 'savings', label: 'Savings' },
] as const;

const inputClass =
  'h-11 w-full rounded-xl border border-[var(--color-border)] bg-transparent px-3 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-tertiary)]';
const labelClass = 'text-[13px] font-semibold text-[var(--color-foreground)]';

export function CreateAccountDialog({
  open,
  onOpenChange,
  accessToken,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string | null;
  workspaceId?: string | null;
  onCreated: () => void;
}) {
  const [currency, setCurrency] = useState('USD');
  const [accountType, setAccountType] = useState('checking');
  const typeOptions = currency === 'NGN' ? ACCOUNT_TYPES_NGN : ACCOUNT_TYPES_ALL;
  const [label, setLabel] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setPending(true);
    setError('');
    try {
      const effectiveType = typeOptions.some((t) => t.value === accountType)
        ? accountType
        : typeOptions[0].value;
      await hedwigApi.createVirtualAccount(
        { currency, account_type: effectiveType, label: label.trim() || undefined },
        { accessToken: accessToken ?? '', workspaceId, disableMockFallback: true }
      );
      setLabel('');
      onOpenChange(false);
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalHeader>
        <ModalTitle>New account</ModalTitle>
        <ModalDescription>Fiat accounts provision through our banking partners; stablecoin is instant.</ModalDescription>
      </ModalHeader>
      <ModalContent>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Currency</span>
            <div className="relative w-full">
              <select
                aria-label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={`${inputClass} appearance-none pr-10 [&>option]:bg-[var(--color-surface)]`}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <CaretDown
                weight="bold"
                className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Account type</span>
            <div className="relative w-full">
              <select
                aria-label="Account type"
                value={typeOptions.some((t) => t.value === accountType) ? accountType : typeOptions[0].value}
                onChange={(e) => setAccountType(e.target.value)}
                className={`${inputClass} appearance-none pr-10 [&>option]:bg-[var(--color-surface)]`}
              >
                {typeOptions.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <CaretDown
                weight="bold"
                className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="account-label">
              Label (optional)
            </label>
            <input
              id="account-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Client collections"
              className={inputClass}
            />
          </div>
          {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
        </div>
      </ModalContent>
      <ModalFooter>
        <ModalClose onClose={() => onOpenChange(false)}>
          <Button variant="ghost">Cancel</Button>
        </ModalClose>
        <Button onClick={handleSubmit} disabled={pending}>
          {pending ? 'Creating…' : 'Create account'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
