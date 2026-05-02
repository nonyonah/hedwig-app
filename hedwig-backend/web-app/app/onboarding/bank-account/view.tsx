'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { BankAccountForm } from '@/components/payouts/bank-account-form';
import { hedwigApi } from '@/lib/api/client';
import type { BankAccountRecord } from '@/lib/models/entities';
import { useToast } from '@/components/providers/toast-provider';

export function OnboardingBankAccountClient({
  accessToken,
  initial,
}: {
  accessToken: string | null;
  initial: BankAccountRecord[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [records, setRecords] = useState<BankAccountRecord[]>(initial);
  const [adding, setAdding] = useState(initial.length === 0);

  useEffect(() => {
    setAdding(records.length === 0);
  }, [records.length]);

  const refresh = async () => {
    if (!accessToken) return;
    const list = await hedwigApi.listBankAccounts({ accessToken, disableMockFallback: true }).catch(() => []);
    setRecords(list);
  };

  return (
    <div className="space-y-4">
      {records.length > 0 && !adding && (
        <div className="rounded-2xl border border-[#e9eaeb] bg-[#fafafa] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#181d27]">{records.length} bank account{records.length === 1 ? '' : 's'} added</p>
          <p className="mt-1 text-[12px] text-[#717680]">
            Clients will see all of these on every invoice and payment link with a currency dropdown to switch.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => setAdding(true)}>Add another</Button>
            <Button onClick={() => router.push('/dashboard')}>Continue to dashboard</Button>
          </div>
        </div>
      )}

      {adding && (
        <BankAccountForm
          accessToken={accessToken}
          initial={null}
          isFirstAccount={records.length === 0}
          showHeader={false}
          submitLabel="Save bank account"
          onCancel={records.length > 0 ? () => setAdding(false) : undefined}
          onSaved={async (record) => {
            await refresh();
            toast({
              type: 'success',
              title: 'Bank account saved',
              message: record.isVerified ? 'Verified.' : 'Saved without verification.',
            });
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
