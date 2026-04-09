'use client';

import { useState } from 'react';
import { X, FileText, CheckCircle, SpinnerGap } from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';
import type { Invoice } from '@/lib/models/entities';

interface Props {
  accessToken: string | null;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}

export function CreateInvoiceDialog({ accessToken, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    clientName: '',
    amount: '',
    description: '',
    dueDate: '',
    recipientEmail: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Enter a valid amount.';
    if (!form.dueDate) e.dueDate = 'Due date is required.';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setIsSubmitting(true);
    try {
      const invoice = await hedwigApi.createInvoice(
        {
          clientName: form.clientName || undefined,
          amount: Number(form.amount),
          description: form.description || undefined,
          dueDate: form.dueDate,
          recipientEmail: form.recipientEmail || undefined
        },
        { accessToken, disableMockFallback: true }
      );
      toast({ type: 'success', title: 'Invoice created', message: `${invoice.number} was created successfully.` });
      onCreated(invoice);
      onClose();
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed to create invoice', message: err?.message || 'Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-[#e9eaeb]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#e9eaeb] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eff4ff]">
                <FileText className="h-4 w-4 text-[#717680]" weight="bold" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-[#181d27]">New invoice</p>
                <p className="text-[11px] text-[#a4a7ae]">Bill a client for work or services</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#717680] transition-colors hover:bg-[#f2f4f7]"
            >
              <X className="h-4 w-4" weight="bold" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 px-6 py-5">
              {/* Amount */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">
                  Amount (USD) <span className="text-[#717680]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-[#717680]">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => set('amount', e.target.value)}
                    className={`w-full rounded-full border py-2.5 pl-8 pr-4 text-[13px] text-[#181d27] outline-none transition focus:ring-2 focus:ring-[#2563eb]/30 ${
                      errors.amount ? 'border-[#f04438] focus:border-[#f04438]' : 'border-[#d5d7da] focus:border-[#2563eb]'
                    }`}
                  />
                </div>
                {errors.amount && <p className="mt-1 text-[11px] text-[#717680]">{errors.amount}</p>}
              </div>

              {/* Due date */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">
                  Due date <span className="text-[#717680]">*</span>
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set('dueDate', e.target.value)}
                  className={`w-full rounded-full border px-4 py-2.5 text-[13px] text-[#181d27] outline-none transition focus:ring-2 focus:ring-[#2563eb]/30 ${
                    errors.dueDate ? 'border-[#f04438] focus:border-[#f04438]' : 'border-[#d5d7da] focus:border-[#2563eb]'
                  }`}
                />
                {errors.dueDate && <p className="mt-1 text-[11px] text-[#717680]">{errors.dueDate}</p>}
              </div>

              {/* Client name */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">Client name</label>
                <input
                  type="text"
                  placeholder="Acme Corp"
                  value={form.clientName}
                  onChange={(e) => set('clientName', e.target.value)}
                  className="w-full rounded-full border border-[#d5d7da] px-4 py-2.5 text-[13px] text-[#181d27] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">Description</label>
                <input
                  type="text"
                  placeholder="Web development, design work…"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  className="w-full rounded-full border border-[#d5d7da] px-4 py-2.5 text-[13px] text-[#181d27] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30"
                />
              </div>

              {/* Recipient email */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#344054]">Recipient email</label>
                <input
                  type="email"
                  placeholder="client@example.com"
                  value={form.recipientEmail}
                  onChange={(e) => set('recipientEmail', e.target.value)}
                  className="w-full rounded-full border border-[#d5d7da] px-4 py-2.5 text-[13px] text-[#181d27] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30"
                />
                <p className="mt-1 text-[11px] text-[#a4a7ae]">Invoice will be emailed to this address when provided.</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[#e9eaeb] px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-[13px] font-semibold text-[#717680] transition-colors hover:bg-[#f2f4f7]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-full bg-[#2563eb] px-5 py-2 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
                    Creating…
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" weight="bold" />
                    Create invoice
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
