'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, ModalClose, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { CaretDown } from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';

type Purpose = 'subscriptions' | 'vendor' | 'general' | 'custom';
type MerchantMode = 'all' | 'merchants' | 'types';

const PURPOSES: Array<{ value: Purpose; title: string; hint: string; defaults: { cap: string; perTx: string } }> = [
  { value: 'subscriptions', title: 'Manage invoices & subscriptions', hint: 'Auto-renewals watched, invoices paid', defaults: { cap: '500', perTx: '100' } },
  { value: 'vendor', title: 'Pay a specific vendor', hint: 'Single merchant, recurring', defaults: { cap: '500', perTx: '200' } },
  { value: 'general', title: 'General spending', hint: 'Caps only, no vendor restriction', defaults: { cap: '1000', perTx: '250' } },
  { value: 'custom', title: 'Custom', hint: 'Write your own instructions', defaults: { cap: '', perTx: '' } },
];

const LIMIT_PERIODS = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
] as const;

const MERCHANT_TYPES = [
  'Software & SaaS', 'Cloud Services', 'Advertising & Marketing', 'Professional Services',
  'Travel & Hotels', 'Airlines', 'Ride Sharing', 'Dining & Restaurants', 'Groceries',
  'Retail', 'Entertainment & Streaming', 'Education', 'Healthcare', 'Insurance', 'Utilities',
  'Payroll & HR', 'Shipping & Logistics', 'Internet & Telecom', 'Office Supplies',
  'Hardware & Electronics', 'Financial Services', 'Media & Publishing', 'Gas & Fuel', 'Clothing & Apparel',
];

const MERCHANT_CONTROL_OPTIONS = [
  { value: 'all', label: 'All merchants' },
  { value: 'merchants', label: 'Specific merchants only' },
  { value: 'types', label: 'Specific merchant types only' },
] as const;

const SUPPORTED_MERCHANTS = [
  'AWS', 'Google Cloud', 'Google Workspace', 'Microsoft Azure', 'Microsoft 365', 'GitHub',
  'Notion', 'Slack', 'Zoom', 'Figma', 'Stripe', 'OpenAI', 'Anthropic', 'Vercel', 'Linear',
] as const;

export interface ReviewFlags {
  flags_for_review: string[];
  vendor_hints: string[];
  payment_triggers: string;
  restrictions: string[];
}

const inputClass =
  'h-11 w-full rounded-xl border border-[var(--color-border)] bg-transparent px-3 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-tertiary)]';
const labelClass = 'text-[13px] font-semibold text-[var(--color-foreground)]';
const hintClass = 'text-[12px] leading-relaxed text-[var(--color-text-tertiary)]';

/** Native select with a custom chevron inset from the edge (hides the browser default arrow). */
function FieldSelect({
  ariaLabel,
  value,
  onChange,
  children,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} appearance-none pr-10 [&>option]:bg-[var(--color-surface)]`}
      >
        {children}
      </select>
      <CaretDown
        weight="bold"
        className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
      />
    </div>
  );
}

function ChipList({ values, onRemove }: { values: string[]; onRemove: (v: string) => void }) {
  if (!values.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span
          key={v}
          className="flex items-center gap-1 rounded-full bg-[var(--color-surface-secondary)] py-1 pl-3 pr-1.5 text-[12px] font-medium"
        >
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onRemove(v)}
            className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-[var(--color-border)]"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export function CreateAgentDialog({
  open,
  onOpenChange,
  accessToken,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string | null;
  workspaceId?: string;
  onCreated: () => void;
}) {
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [name, setName] = useState('');
  const [limitPeriod, setLimitPeriod] = useState<string>('MONTHLY');
  const [periodCap, setPeriodCap] = useState('');
  const [perTxCap, setPerTxCap] = useState('');
  const [vendors, setVendors] = useState<string[]>([]);
  const [openToAll, setOpenToAll] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [merchantMode, setMerchantMode] = useState<MerchantMode>('merchants');
  const [types, setTypes] = useState<string[]>([]);
  const [vendorInput, setVendorInput] = useState('');
  const [review, setReview] = useState<ReviewFlags | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const opts = { accessToken: accessToken ?? '', workspaceId, disableMockFallback: true };

  const selectPurpose = (p: Purpose) => {
    setPurpose(p);
    const t = PURPOSES.find((x) => x.value === p)!;
    setPeriodCap(t.defaults.cap);
    setPerTxCap(t.defaults.perTx);
    setReview(null);
  };

  const generatedInstructions = (): string => {
    switch (purpose) {
      case 'subscriptions': {
        const scope = openToAll
          ? 'Subscriptions: auto-renewing services must not be paid — they bill automatically. For each subscription, track the start date, the renewal date, and any free trial end date, and remind me 3 days before a renewal or trial converts to paid.'
          : vendors.length > 0
            ? `Subscriptions (${vendors.join(', ')}): these auto-renew — do not pay their charges. For each, track the start date, the renewal date, and any free trial end date, and remind me 3 days before a renewal or trial converts to paid.`
            : '';
        const invoices = openToAll
          ? 'Invoices: pay invoices as they arrive from any vendor within my caps — including contractors, API services, and freelancers.'
          : vendors.length > 0
            ? `Invoices: pay invoices from ${vendors.join(', ')} when they arrive — including contractor, API usage, and freelancer invoices. Ask before paying any new vendor.`
            : '';
        return [scope, invoices].filter(Boolean).join('\n');
      }
      case 'vendor':
        return vendorName.trim()
          ? `Pay invoices from ${vendorName.trim()} when they arrive — including contractor, API usage, and freelancer invoices. Ask before paying any other vendor.`
          : '';
      case 'general':
        return 'Pay business expenses as they arrive, within my caps — invoices from contractors, API services, and freelancers included.';
      case 'custom':
        return instructions.trim();
      default:
        return '';
    }
  };

  const purposeReady = (() => {
    switch (purpose) {
      case 'subscriptions':
        return openToAll || vendors.length > 0;
      case 'vendor':
        return vendorName.trim().length > 0;
      case 'general':
        return true;
      case 'custom':
        return instructions.trim().length > 0;
      default:
        return false;
    }
  })();

  const addVendor = (raw: string) => {
    const v = raw.trim().replace(/,+$/, '').trim();
    if (!v) return;
    setVendors((prev) =>
      prev.some((x) => x.toLowerCase() === v.toLowerCase()) || prev.length >= 100 ? prev : [...prev, v]
    );
  };

  const reset = () => {
    setPurpose(null);
    setName('');
    setPeriodCap('');
    setPerTxCap('');
    setVendors([]);
    setOpenToAll(false);
    setVendorName('');
    setInstructions('');
    setMerchantMode('merchants');
    setTypes([]);
    setVendorInput('');
    setReview(null);
    setError('');
  };

  const handleSubmit = async (confirmFlags = false) => {
    if (!purpose || !purposeReady || !name.trim() || pending) return;
    setPending(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { name: name.trim() };
      const generated = generatedInstructions();
      if (generated) payload.instructions = generated;
      const cap = Number(periodCap);
      if (periodCap && Number.isFinite(cap) && cap > 0) {
        payload.monthly_cap = cap;
        payload.limit_period = limitPeriod;
      }
      const perTx = Number(perTxCap);
      if (perTxCap && Number.isFinite(perTx) && perTx > 0) payload.per_transaction_cap = perTx;
      switch (purpose) {
        case 'subscriptions':
          payload.allow_new_vendors = openToAll;
          payload.merchant_allowlist = openToAll ? [] : vendors;
          break;
        case 'vendor':
          payload.allow_new_vendors = false;
          payload.merchant_allowlist = [vendorName.trim()];
          break;
        case 'general':
          payload.allow_new_vendors = true;
          break;
        case 'custom':
          payload.allow_new_vendors = merchantMode !== 'merchants';
          payload.merchant_allowlist = merchantMode === 'merchants' ? vendors : [];
          payload.merchant_types = merchantMode === 'types' ? types : [];
          break;
      }
      if (confirmFlags) payload.confirm_flags_reviewed = true;
      const result = (await hedwigApi.createAgent(payload, opts)) as Record<string, unknown>;
      if (result && result.status === 'needs_review') {
        setReview(result as unknown as ReviewFlags);
        return;
      }
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create agent.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <ModalHeader>
        <ModalTitle>Create an agent</ModalTitle>
        <ModalDescription>Pick what it&apos;s for — Hedwig turns it into instructions and hard limits.</ModalDescription>
      </ModalHeader>

      <ModalContent>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Step 1 · Pick a purpose</span>
            <FieldSelect ariaLabel="Agent purpose" value={purpose ?? ''} onChange={(v) => selectPurpose(v as Purpose)}>
              <option value="" disabled>
                Select a purpose
              </option>
              {PURPOSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.title} — {p.hint}
                </option>
              ))}
            </FieldSelect>
          </div>

          {purpose && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Step 2 · Fill in the blanks</span>
                <label className={labelClass} htmlFor="agent-name">
                  Agent name
                </label>
                <input
                  id="agent-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Subscription Agent"
                  className={inputClass}
                />
              </div>

              {purpose === 'subscriptions' && (
                <div className="flex flex-col gap-2">
                  <span className={labelClass}>Vendors &amp; services</span>
                  {!openToAll ? (
                    <>
                      <FieldSelect
                        ariaLabel="Vendors and services"
                        value=""
                        onChange={(v) => {
                          if (v) addVendor(v);
                        }}
                      >
                        <option value="" disabled>
                          Select vendors
                        </option>
                        {SUPPORTED_MERCHANTS.filter((m) => !vendors.includes(m)).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </FieldSelect>
                      <ChipList values={vendors} onRemove={(v) => setVendors((p) => p.filter((x) => x !== v))} />
                      {vendors.length === 0 && (
                        <p className={hintClass}>Pick at least one vendor, or allow any vendor below.</p>
                      )}
                    </>
                  ) : (
                    <p className={hintClass}>Invoices from any vendor can be paid, within your caps. Auto-renewals are watched, not paid.</p>
                  )}
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={openToAll}
                      onChange={(e) => setOpenToAll(e.target.checked)}
                      className="h-4 w-4 accent-[var(--color-accent)]"
                    />
                    <span className="text-[13px] text-[var(--color-text-tertiary)]">Or leave it open — any vendor, within my caps</span>
                  </label>
                  <p className={hintClass}>
                    Auto-renewals are tracked with a reminder 3 days before each one — the debit itself isn&apos;t touched.
                    Contractor, API, and freelancer invoices are paid as they arrive.
                  </p>
                </div>
              )}

              {purpose === 'vendor' && (
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass} htmlFor="vendor-name">
                    Vendor name
                  </label>
                  <input
                    id="vendor-name"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="e.g. Notion"
                    className={inputClass}
                  />
                </div>
              )}

              {purpose === 'general' && (
                <p className={hintClass}>No vendor restrictions — your caps are the only limits.</p>
              )}

              {purpose === 'custom' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClass} htmlFor="agent-instructions">
                      Instructions
                    </label>
                    <textarea
                      id="agent-instructions"
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Tell your agent what to do — e.g. pay recurring SaaS invoices when they arrive, and ask first about any new vendor."
                      rows={4}
                      className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2.5 text-[13px] outline-none placeholder:text-[var(--color-text-tertiary)]"
                    />
                    <p className={hintClass}>Hedwig reads this once at setup. Hard limits below always apply, no matter what.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className={labelClass}>Merchant controls</span>
                    <FieldSelect
                      ariaLabel="Merchant controls"
                      value={merchantMode}
                      onChange={(v) => setMerchantMode(v as MerchantMode)}
                    >
                      {MERCHANT_CONTROL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </FieldSelect>
                    {merchantMode === 'merchants' && (
                      <>
                        <FieldSelect
                          ariaLabel="Allowed merchants"
                          value=""
                          onChange={(v) => {
                            if (v) addVendor(v);
                          }}
                        >
                          <option value="" disabled>
                            Select merchants
                          </option>
                          {SUPPORTED_MERCHANTS.filter((m) => !vendors.includes(m)).map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </FieldSelect>
                        <ChipList values={vendors} onRemove={(v) => setVendors((p) => p.filter((x) => x !== v))} />
                        <input
                          value={vendorInput}
                          onChange={(e) => setVendorInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault();
                              addVendor(vendorInput);
                              setVendorInput('');
                            }
                          }}
                          onBlur={() => {
                            addVendor(vendorInput);
                            setVendorInput('');
                          }}
                          placeholder="Add a custom vendor and press Enter"
                          className={inputClass}
                        />
                      </>
                    )}
                    {merchantMode === 'types' && (
                      <>
                        <FieldSelect
                          ariaLabel="Allowed merchant types"
                          value=""
                          onChange={(v) => {
                            if (v && !types.includes(v)) setTypes((p) => [...p, v]);
                          }}
                        >
                          <option value="" disabled>
                            Select merchant types
                          </option>
                          {MERCHANT_TYPES.filter((t) => !types.includes(t)).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </FieldSelect>
                        <ChipList values={types} onRemove={(t) => setTypes((p) => p.filter((x) => x !== t))} />
                        {types.length === 0 && <p className={hintClass}>Pick at least one type, or every payment will be held.</p>}
                      </>
                    )}
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Spend controls</span>
                <div className="grid grid-cols-2 gap-3">
                  <FieldSelect ariaLabel="Limit period" value={limitPeriod} onChange={setLimitPeriod}>
                    {LIMIT_PERIODS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </FieldSelect>
                  <input
                    value={periodCap}
                    onChange={(e) => setPeriodCap(e.target.value.replace(/[^\d.]/g, ''))}
                    inputMode="decimal"
                    placeholder="Cap (USDC)"
                    className={inputClass}
                  />
                </div>
                <input
                  value={perTxCap}
                  onChange={(e) => setPerTxCap(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  placeholder="Per-payment cap (USDC)"
                  className={inputClass}
                />
                <p className={hintClass}>Limits in USDC, enforced in code.</p>
              </div>

              {review && (
                <div className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-surface-secondary)] p-4">
                  <p className="text-[13px] font-semibold">Review before you go live</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {review.flags_for_review.map((f) => (
                      <li key={f} className="text-[12px] text-[var(--color-text-tertiary)]">
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" onClick={() => setReview(null)}>
                      Edit details
                    </Button>
                    <Button onClick={() => handleSubmit(true)} disabled={pending}>
                      {pending ? 'Creating…' : 'Create anyway'}
                    </Button>
                  </div>
                </div>
              )}

              {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            </>
          )}
        </div>
      </ModalContent>

        <ModalFooter>
          <ModalClose onClose={() => onOpenChange(false)}>
            <Button variant="ghost">Cancel</Button>
          </ModalClose>
          <Button onClick={() => handleSubmit(false)} disabled={!purpose || !purposeReady || !name.trim() || pending}>
            {pending ? 'Setting up…' : 'Create agent'}
          </Button>
        </ModalFooter>
    </Modal>
  );
}
