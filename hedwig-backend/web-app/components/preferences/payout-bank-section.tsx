'use client';

import { useEffect, useState } from 'react';
import { hedwigApi } from '@/lib/api/client';
import type { BankAccountRecord } from '@/lib/models/entities';
import { BankAccountForm } from '@/components/payouts/bank-account-form';
import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { Bank, Plus, ShieldCheck } from '@/components/ui/lucide-icons';

const COUNTRY_FLAG: Record<BankAccountRecord['country'], string> = {
  NG: '🇳🇬',
  US: '🇺🇸',
  UK: '🇬🇧',
  GH: '🇬🇭',
};

function maskedAccount(record: BankAccountRecord): string {
  const value = record.accountNumber || '';
  if (!value) return '';
  const trimmed = value.replace(/\s+/g, '');
  if (trimmed.length <= 4) return trimmed;
  return `${'•'.repeat(Math.max(trimmed.length - 4, 4))}${trimmed.slice(-4)}`;
}

export function PayoutBankSection({ accessToken }: { accessToken: string | null }) {
  const { toast } = useToast();
  const [records, setRecords] = useState<BankAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BankAccountRecord | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) {
      setLoading(false);
      return;
    }
    hedwigApi.listBankAccounts({ accessToken, disableMockFallback: true })
      .then((r) => { if (!cancelled) setRecords(r); })
      .catch(() => { if (!cancelled) setRecords([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken]);

  const refresh = async () => {
    if (!accessToken) return;
    const list = await hedwigApi.listBankAccounts({ accessToken, disableMockFallback: true }).catch(() => []);
    setRecords(list);
  };

  const setDefault = async (record: BankAccountRecord) => {
    if (!accessToken) return;
    try {
      await hedwigApi.setDefaultBankAccount(record.id, { accessToken, disableMockFallback: true });
      await refresh();
      toast({ type: 'success', title: 'Default updated', message: `${record.bankName} is now your default payout.` });
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed', message: err?.message });
    }
  };

  const showForm = adding || editing !== null;

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
      <div className="flex items-center justify-between border-b border-[#f2f4f7] px-5 py-4">
        <div>
          <h2 className="text-[16px] font-semibold text-[#181d27]">Payout banks</h2>
          <p className="mt-0.5 text-[13px] text-[#717680]">
            Add accounts in any supported country. Clients can switch currencies on the public page.
          </p>
        </div>
        {!showForm && records.length > 0 && (
          <Button size="sm" onClick={() => { setAdding(true); setEditing(null); }}>
            <Plus className="h-3.5 w-3.5" weight="bold" /> Add account
          </Button>
        )}
      </div>

      <div className="px-5 py-5 space-y-3">
        {loading ? (
          <p className="text-[13px] text-[#717680]">Loading…</p>
        ) : showForm ? (
          <BankAccountForm
            accessToken={accessToken}
            initial={editing}
            isFirstAccount={records.length === 0}
            showHeader={false}
            onCancel={() => { setEditing(null); setAdding(false); }}
            onSaved={async (saved) => {
              await refresh();
              setEditing(null);
              setAdding(false);
              toast({ type: 'success', title: 'Bank account saved', message: saved.isVerified ? 'Verified.' : 'Saved without verification.' });
            }}
            onDeleted={async () => {
              await refresh();
              setEditing(null);
              setAdding(false);
              toast({ type: 'success', title: 'Bank account removed' });
            }}
          />
        ) : records.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e9eaeb] bg-[#fafafa] px-4 py-8 text-center">
            <Bank className="mx-auto h-6 w-6 text-[#a4a7ae]" weight="regular" />
            <p className="mt-2 text-[13px] font-semibold text-[#181d27]">No payout banks yet</p>
            <p className="mt-1 text-[12px] text-[#717680]">
              Add a Nigerian, US, UK, or Ghanaian bank so clients can pay you by transfer.
            </p>
            <Button className="mt-3" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" weight="bold" /> Add bank account
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[#e9eaeb] px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-[20px] leading-none">{COUNTRY_FLAG[record.country]}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-[#181d27]">{record.bankName}</p>
                      {record.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#eff4ff] px-2 py-0.5 text-[10px] font-semibold text-[#2563eb]">
                          Default
                        </span>
                      )}
                      {record.isVerified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[10px] font-semibold text-[#027a48]">
                          <ShieldCheck className="h-2.5 w-2.5" weight="bold" /> Verified
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-[#717680]">
                      {record.accountHolderName} · {record.currency} · {maskedAccount(record)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!record.isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => setDefault(record)}>
                      Set default
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => { setEditing(record); setAdding(false); }}>
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
