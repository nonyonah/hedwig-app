'use client';

import Image from 'next/image';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from '@/components/ui/lucide-icons';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { backendConfig } from '@/lib/auth/config';

type Chain = 'Base' | 'Solana';

const chainOptions: Array<{ value: Chain; label: string; icon: string; description: string }> = [
  {
    value: 'Base',
    label: 'Base',
    icon: '/icons/networks/base.png',
    description: 'USD deposits settle as USDC on Base (EVM)'
  },
  {
    value: 'Solana',
    label: 'Solana',
    icon: '/icons/networks/solana.png',
    description: 'USD deposits settle as USDC on Solana'
  }
];

async function updateSettlementChain(chain: Chain, accessToken: string) {
  const res = await fetch(`${backendConfig.apiBaseUrl}/api/usd-accounts/settlement`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ chain: chain.toUpperCase() })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error?.message || 'Failed to update settlement chain');
  }
  const body = await res.json().catch(() => ({}));
  return (body as any)?.data ?? body;
}

export function ChangeSettlementDialog({
  currentChain,
  accessToken,
  onUpdated
}: {
  currentChain: Chain;
  accessToken: string;
  onUpdated?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Chain>(currentChain);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      try {
        await updateSettlementChain(selected, accessToken);
        if (onUpdated) {
          await onUpdated();
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setSelected(currentChain); setOpen(true); }}
        className="text-[12px] font-semibold text-[var(--color-text-tertiary)] transition hover:underline"
      >
        Change
      </button>

      <Dialog open={open} onOpenChange={setOpen} size="2xl">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settlement chain</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <p className="text-[13px] text-[var(--color-text-tertiary)]">
              USD deposits will automatically convert to USDC and settle to your wallet on the selected chain.
            </p>

            {chainOptions.map((option) => {
              const isSelected = selected === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelected(option.value)}
                  className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition duration-100 ${
                    isSelected
                      ? 'border-[var(--color-primary)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-background)]'
                  }`}
                >
                  <Image src={option.icon} alt={option.label} width={36} height={36} className="rounded-full shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-semibold ${isSelected ? 'text-[var(--color-text-tertiary)]' : 'text-[var(--color-foreground)]'}`}>
                      {option.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{option.description}</p>
                  </div>
                  {isSelected && (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]">
                      <Check className="h-3 w-3 text-white" weight="bold" />
                    </div>
                  )}
                </button>
              );
            })}

            {error && (
              <p className="rounded-xl bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-text-tertiary)]">{error}</p>
            )}
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] shadow-xs transition hover:bg-[var(--color-background)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || selected === currentChain}
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save changes'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
