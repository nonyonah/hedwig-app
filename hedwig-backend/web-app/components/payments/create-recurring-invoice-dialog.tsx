'use client';

import { useState, useRef, useEffect } from 'react';
import { CaretDown } from '@phosphor-icons/react/dist/ssr';
import { X } from '@phosphor-icons/react/dist/ssr';
import { hedwigApi, type CreateRecurringInvoiceInput, type RecurringFrequency } from '@/lib/api/client';
import type { Client } from '@/lib/models/entities';
import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';

const FREQUENCIES: { value: RecurringFrequency; label: string; description: string }[] = [
  { value: 'weekly',    label: 'Weekly',    description: 'Every 7 days' },
  { value: 'biweekly',  label: 'Bi-weekly', description: 'Every 14 days' },
  { value: 'monthly',   label: 'Monthly',   description: 'Same day each month' },
  { value: 'quarterly', label: 'Quarterly', description: 'Every 3 months' },
  { value: 'annual',    label: 'Annual',    description: 'Once a year' },
];

type Prefill = {
  clientName?: string;
  clientEmail?: string;
  amount?: string;
  frequency?: RecurringFrequency;
  title?: string;
  startDate?: string;
  endDate?: string;
  autoSend?: boolean;
};

type Props = {
  open: boolean;
  clients: Client[];
  accessToken: string | null;
  prefill?: Prefill;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoice: Awaited<ReturnType<typeof hedwigApi.createRecurringInvoice>>) => void;
};

const CHAINS = [
  { value: 'BASE',   label: 'Base',   logo: '/icons/networks/base.png' },
  { value: 'SOLANA', label: 'Solana', logo: '/icons/networks/solana.png' },
];

function ChainDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = CHAINS.find((c) => c.value === value) ?? CHAINS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-[#e9eaeb] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#c0c3c9] focus:border-[#2563eb] focus:outline-none"
      >
        <img src={selected.logo} alt={selected.label} className="h-5 w-5 rounded-full object-cover" />
        <span className="flex-1 text-[14px] text-[#181d27]">{selected.label}</span>
        <CaretDown className={`h-3.5 w-3.5 shrink-0 text-[#a4a7ae] transition-transform ${open ? 'rotate-180' : ''}`} weight="bold" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-[#e9eaeb] bg-white shadow-lg">
          {CHAINS.map((chain) => (
            <button
              key={chain.value}
              type="button"
              onClick={() => { onChange(chain.value); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[#f9fafb] ${value === chain.value ? 'bg-[#f5f8ff]' : ''}`}
            >
              <img src={chain.logo} alt={chain.label} className="h-5 w-5 rounded-full object-cover" />
              <span className={`text-[13px] font-medium ${value === chain.value ? 'text-[#2563eb]' : 'text-[#181d27]'}`}>{chain.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TODAY = new Date().toISOString().split('T')[0];

export function CreateRecurringInvoiceDialog({ open, clients, accessToken, prefill, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    clientId: string;
    clientEmail: string;
    clientName: string;
    title: string;
    amount: string;
    chain: string;
    memo: string;
    frequency: RecurringFrequency;
    startDate: string;
    endDate: string;
    autoSend: boolean;
  }>({
    clientId: '',
    clientEmail: prefill?.clientEmail ?? '',
    clientName: prefill?.clientName ?? '',
    title: prefill?.title ?? '',
    amount: prefill?.amount ?? '',
    chain: 'BASE',
    memo: '',
    frequency: prefill?.frequency ?? 'monthly',
    startDate: prefill?.startDate ?? TODAY,
    endDate: prefill?.endDate ?? '',
    autoSend: prefill?.autoSend ?? false,
  });

  const set = (field: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleClientChange = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    setForm((f) => ({
      ...f,
      clientId,
      clientName: client?.name || f.clientName,
      clientEmail: client?.email || f.clientEmail,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast({ type: 'error', title: 'Amount required', message: 'Please enter a valid amount.' });
      return;
    }

    setSaving(true);
    try {
      const input: CreateRecurringInvoiceInput = {
        clientId: form.clientId || undefined,
        clientName: form.clientName || undefined,
        clientEmail: form.clientEmail || undefined,
        title: form.title || undefined,
        amount: parseFloat(form.amount),
        chain: form.chain,
        memo: form.memo || undefined,
        frequency: form.frequency,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        autoSend: form.autoSend,
      };

      const result = await hedwigApi.createRecurringInvoice(input, { accessToken });
      toast({
        type: 'success',
        title: 'Recurring invoice created',
        message: `Will generate ${form.frequency} — first invoice on ${form.startDate}.`,
      });
      onCreated(result);
      onOpenChange(false);
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed to create', message: err?.message || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)] ring-1 ring-[#e9eaeb]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f2f4f7] px-6 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[#181d27]">Set up recurring invoice</p>
            <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Generates automatically on schedule</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#a4a7ae] hover:bg-[#f2f4f7] hover:text-[#344054] transition-colors"
          >
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto px-6 py-5 space-y-4">

            {/* Client */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Client</label>
              {clients.length > 0 ? (
                <select
                  value={form.clientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  className="w-full rounded-xl border border-[#e9eaeb] bg-white px-3 py-2.5 text-[14px] text-[#181d27] focus:border-[#2563eb] focus:outline-none"
                >
                  <option value="">Select client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : null}
              {!form.clientId && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Client name"
                    value={form.clientName}
                    onChange={(e) => set('clientName', e.target.value)}
                    className="rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[14px] text-[#181d27] placeholder-[#a4a7ae] focus:border-[#2563eb] focus:outline-none"
                  />
                  <input
                    type="email"
                    placeholder="Client email"
                    value={form.clientEmail}
                    onChange={(e) => set('clientEmail', e.target.value)}
                    className="rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[14px] text-[#181d27] placeholder-[#a4a7ae] focus:border-[#2563eb] focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Title + Amount */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Invoice title</label>
              <input
                type="text"
                placeholder="e.g. Monthly retainer"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                className="w-full rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[14px] text-[#181d27] placeholder-[#a4a7ae] focus:border-[#2563eb] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Amount (USDC)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value)}
                  className="w-full rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[14px] text-[#181d27] placeholder-[#a4a7ae] focus:border-[#2563eb] focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Chain</label>
                <ChainDropdown value={form.chain} onChange={(v) => set('chain', v)} />
              </div>
            </div>

            {/* Frequency */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Frequency</label>
              <div className="grid grid-cols-5 gap-1.5">
                {FREQUENCIES.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => set('frequency', f.value)}
                    className={`flex flex-col items-center rounded-xl border px-2 py-2.5 text-center transition-colors ${
                      form.frequency === f.value
                        ? 'border-[#2563eb] bg-[#eff4ff] text-[#2563eb]'
                        : 'border-[#e9eaeb] text-[#717680] hover:border-[#c0c3c9]'
                    }`}
                  >
                    <span className="text-[12px] font-semibold">{f.label}</span>
                    <span className="mt-0.5 text-[10px] opacity-70">{f.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">First invoice date</label>
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                  className="w-full rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[14px] text-[#181d27] focus:border-[#2563eb] focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">End date (optional)</label>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(e) => set('endDate', e.target.value)}
                  className="w-full rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[14px] text-[#181d27] placeholder-[#a4a7ae] focus:border-[#2563eb] focus:outline-none"
                />
              </div>
            </div>

            {/* Memo */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Memo (optional)</label>
              <input
                type="text"
                placeholder="Notes for the client"
                value={form.memo}
                onChange={(e) => set('memo', e.target.value)}
                className="w-full rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[14px] text-[#181d27] placeholder-[#a4a7ae] focus:border-[#2563eb] focus:outline-none"
              />
            </div>

            {/* Auto-send toggle */}
            <button
              type="button"
              onClick={() => set('autoSend', !form.autoSend)}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                form.autoSend ? 'border-[#2563eb] bg-[#eff4ff]' : 'border-[#e9eaeb] bg-white hover:border-[#c0c3c9]'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className={`text-[13px] font-semibold ${form.autoSend ? 'text-[#2563eb]' : 'text-[#181d27]'}`}>
                    Auto-send invoices
                  </p>
                  <p className="mt-0.5 text-[12px] leading-[1.5] text-[#717680]">
                    {form.autoSend
                      ? 'Hedwig will send each invoice automatically on the due date.'
                      : 'Each invoice saved as a draft for you to review and send manually.'}
                  </p>
                </div>
                {/* Toggle track */}
                <div
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
                    form.autoSend ? 'bg-[#2563eb]' : 'bg-[#d5d7da]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      form.autoSend ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </div>
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[#f2f4f7] px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create recurring invoice'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
