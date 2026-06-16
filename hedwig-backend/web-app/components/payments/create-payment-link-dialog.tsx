'use client';

import { useState } from 'react';
import { X, LinkSimple, CheckCircle, SpinnerGap, Wallet } from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import type { PaymentLink } from '@/lib/models/entities';

interface Props {
  accessToken: string | null;
  onClose: () => void;
  onCreated: (link: PaymentLink) => void;
}

export function CreatePaymentLinkDialog({ accessToken, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspaceContext();
  const isOrganization = activeWorkspace?.type === 'organization';
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
    if (!form.dueDate) e.dueDate = 'Expiry date is required.';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setIsSubmitting(true);
    try {
      const link = await hedwigApi.createPaymentLink(
        {
          clientName: form.clientName || undefined,
          amount: Number(form.amount),
          description: form.description || undefined,
          dueDate: form.dueDate,
          recipientEmail: form.recipientEmail || undefined,
          currency: 'USDC'
        },
        { accessToken, disableMockFallback: true }
      );
      toast({ type: 'success', title: 'Payment link created', message: `${link.title} is ready to share.` });
      onCreated(link);
      onClose();
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed to create payment link', message: err?.message || 'Please try again.' });
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
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-success-soft)]">
                <LinkSimple className="h-4 w-4 text-[var(--color-text-tertiary)]" weight="bold" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-[var(--color-foreground)]">New payment link</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">Collect USDC from anyone with a link</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
            >
              <X className="h-4 w-4" weight="bold" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 px-6 py-5">
              {/* Client name */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">
                  Client / payer name
                </label>
                <input
                  type="text"
                  placeholder="Acme Corp"
                  value={form.clientName}
                  onChange={(e) => set('clientName', e.target.value)}
                  className="w-full rounded-full border border-[var(--color-border-input)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30"
                />
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Optional, but useful for labeling the link.</p>
              </div>

              {/* Amount */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">
                  Amount (USDC) <span className="text-[var(--color-text-tertiary)]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--color-text-tertiary)]">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => set('amount', e.target.value)}
                    className={`w-full rounded-full border py-2.5 pl-8 pr-4 text-[13px] text-[var(--color-foreground)] outline-none transition focus:ring-2 focus:ring-[var(--color-accent)]/30 ${
                      errors.amount ? 'border-[var(--color-danger)] focus:border-[var(--color-danger)]' : 'border-[var(--color-border-input)] focus:border-[var(--color-accent)]'
                    }`}
                  />
                </div>
                {errors.amount && <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{errors.amount}</p>}
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Fixed to USDC · settled on Base</p>
              </div>

              {/* Expiry date */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">
                  Expiry date <span className="text-[var(--color-text-tertiary)]">*</span>
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set('dueDate', e.target.value)}
                  className={`w-full rounded-full border px-4 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:ring-2 focus:ring-[var(--color-accent)]/30 ${
                    errors.dueDate ? 'border-[var(--color-danger)] focus:border-[var(--color-danger)]' : 'border-[var(--color-border-input)] focus:border-[var(--color-accent)]'
                  }`}
                />
                {errors.dueDate && <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{errors.dueDate}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">Description</label>
                <input
                  type="text"
                  placeholder="Monthly retainer, project milestone…"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  className="w-full rounded-full border border-[var(--color-border-input)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30"
                />
              </div>

              {/* Recipient email */}
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">Recipient email</label>
                <input
                  type="email"
                  placeholder="client@example.com"
                  value={form.recipientEmail}
                  onChange={(e) => set('recipientEmail', e.target.value)}
                  className="w-full rounded-full border border-[var(--color-border-input)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30"
                />
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Link will be emailed to this address when provided.</p>
              </div>

              {isOrganization && (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--color-accent-soft)] px-3.5 py-2.5 text-[11px] text-[var(--color-text-secondary)]">
                  <Wallet className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" weight="fill" />
                  <span>Payment will be received into your workspace treasury</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-5 py-2 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
                    Creating…
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" weight="bold" />
                    Create link
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
