'use client';

import Image from 'next/image';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from '@phosphor-icons/react/dist/ssr';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';

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
  const res = await fetch('/api/usd-accounts/settlement', {
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
  return res.json();
}

export function ChangeSettlementDialog({
  currentChain,
  accessToken
}: {
  currentChain: Chain;
  accessToken: string;
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
        className="text-[12px] font-semibold text-[#2563eb] transition hover:underline"
      >
        Change
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Settlement chain</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <p className="text-[13px] text-[#717680]">
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
                      ? 'border-[#2563eb] bg-[#eff4ff]'
                      : 'border-[#e9eaeb] bg-white hover:bg-[#fafafa]'
                  }`}
                >
                  <Image src={option.icon} alt={option.label} width={36} height={36} className="rounded-full shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-semibold ${isSelected ? 'text-[#1d4ed8]' : 'text-[#181d27]'}`}>
                      {option.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#717680]">{option.description}</p>
                  </div>
                  {isSelected && (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2563eb]">
                      <Check className="h-3 w-3 text-white" weight="bold" />
                    </div>
                  )}
                </button>
              );
            })}

            {error && (
              <p className="rounded-xl bg-[#fef3f2] px-3 py-2 text-[12px] text-[#b42318]">{error}</p>
            )}
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-full border border-[#d5d7da] bg-white px-4 py-2 text-[13px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#fafafa]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || selected === currentChain}
              className="inline-flex items-center justify-center rounded-full bg-[#2563eb] px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#1d4ed8] disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save changes'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
