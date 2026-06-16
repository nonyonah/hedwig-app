'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

const ITEMS = [
  {
    title: 'Receive — collect from anywhere',
    description:
      'Generate branded payment links or invoices in seconds. Your customers pay from any wallet, anywhere in the world — no routing numbers, no currency confusion.',
    preview: <ReceivePanel />,
  },
  {
    title: 'Manage — one treasury view',
    description:
      'See your entire balance in one place. Track collected, pending, and settled funds. Convert between currencies when the rate works for you.',
    preview: <ManagePanel />,
  },
  {
    title: 'Move — settle on your terms',
    description:
      'Auto-settle daily to your bank account or withdraw on demand. No minimums, no holds. Batch payouts to team members, contractors, or suppliers.',
    preview: <MovePanel />,
  },
  {
    title: 'Scale — AI-powered workflows',
    description:
      'Your AI assistant handles the routine — surfacing insights, flagging anomalies, and recommending actions. Connect your tools and let Hedwig do the heavy lifting.',
    preview: <ScalePanel />,
  },
];

export function FeaturesShowcase() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActive((current) => (current + 1) % ITEMS.length);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface)] px-8 py-24">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-16 lg:grid-cols-[400px_1fr] lg:items-start xl:grid-cols-[460px_1fr]">

          {/* ── Left — timeline list ─────────────────────────── */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              The platform
            </p>
            <h2 className="mb-14 text-[32px] font-bold tracking-[-0.04em] text-[var(--color-foreground)] md:text-[42px]">
              From receiving payments<br />to scaling globally.
            </h2>

            <div className="relative">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-[var(--color-border)]" />

              <div className="flex flex-col gap-7 pl-7">
                {ITEMS.map((item, i) => (
                  <button
                    key={item.title}
                    onClick={() => setActive(i)}
                    className="relative text-left"
                  >
                    <div
                      className={`absolute -left-7 top-[6px] h-[11px] w-[11px] rounded-sm transition-all duration-300 ${
                        i === active
                          ? 'bg-[var(--color-primary)] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]'
                          : 'border border-[var(--color-border-input)] bg-[var(--color-surface)]'
                      }`}
                    />

                    <p
                      className={`font-semibold transition-all duration-300 ${
                        i === active
                          ? 'text-[20px] tracking-[-0.025em] text-[var(--color-foreground)]'
                          : 'text-[15px] text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)]'
                      }`}
                    >
                      {item.title}
                    </p>

                    {i === active && (
                      <p className="mt-2.5 text-[14px] leading-[1.75] text-[var(--color-text-muted)]">
                        {item.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right — preview panel ────────────────────────── */}
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-surface-tertiary)] shadow-[0_4px_40px_rgba(24,29,39,0.07)]">
            <div className="flex items-center gap-3 border-b border-[var(--color-border-light)] bg-[var(--color-surface-tertiary)] px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-danger)]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-warning)]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
              </div>
              <div className="flex h-5 w-48 items-center justify-center gap-1.5 rounded-md bg-[var(--color-surface)] px-3 ring-1 ring-[var(--color-border-input)]">
                <div className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
                <span className="text-[11px] text-[var(--color-text-muted)]">app.hedwig.money</span>
              </div>
            </div>

            <div className="relative h-[480px] overflow-hidden bg-[var(--color-surface)]">
              <div
                key={active}
                className="absolute inset-0"
                style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
              >
                {ITEMS[active].preview}
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

/* ── Pillar 1: Receive ───────────────────────────────────────── */

function ReceivePanel() {
  const links = [
    { name: 'Brand sprint — payment link', amount: '$1,800', status: 'Paid', statusColor: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]', method: 'Wallet' },
    { name: 'Logo package — invoice', amount: '$450', status: 'Pending', statusColor: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]', method: 'Invoice' },
    { name: 'Web redesign M2 — payment link', amount: '$3,200', status: 'Overdue', statusColor: 'text-[var(--color-text-tertiary)] bg-[var(--color-warning-soft)]', method: 'Wallet' },
    { name: 'Motion kit delivery — invoice', amount: '$900', status: 'Draft', statusColor: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]', method: 'Invoice' },
    { name: 'Copywriting retainer — payment link', amount: '$2,000', status: 'Paid', statusColor: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]', method: 'Wallet' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Receive</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Payment links & invoices</h3>
      </div>
      <div className="px-6 pt-4 pb-2">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-[var(--color-border)] ring-1 ring-[var(--color-border)]">
          {[{ l: 'Total collected', v: '$8,350' }, { l: 'This month', v: '$4,200' }, { l: 'Pending', v: '$1,800' }].map((s) => (
            <div key={s.l} className="bg-[var(--color-surface)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">{s.l}</p>
              <p className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{s.v}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-6 pb-4 pt-3">
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-[var(--color-surface-secondary)] px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Item</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Type</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Amount</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Status</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {links.map((r) => (
              <div key={r.name} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[10px] font-bold text-[var(--color-text-tertiary)]">
                    {r.method === 'Wallet' ? '⟐' : '⟐'}
                  </div>
                  <p className="truncate text-[12px] font-semibold text-[var(--color-foreground)]">{r.name}</p>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)]">{r.method}</span>
                <p className="text-[12px] font-semibold text-[var(--color-foreground)]">{r.amount}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.statusColor}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pillar 2: Manage ────────────────────────────────────────── */

function ManagePanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Manage</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Treasury & currency management</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
          <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] p-4 ring-1 ring-[var(--color-border)]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">USDC balance</p>
            <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.03em] text-[var(--color-foreground)]">42,800</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">≈ $42,800.00</p>
          </div>
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="border-b border-[var(--color-surface-secondary)] px-4 py-2.5">
            <p className="text-[11px] font-semibold text-[var(--color-foreground)]">Conversion history</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[
              { from: 'USDC', to: 'NGN', amount: '$2,000', rate: '1,540', status: 'Completed', color: 'text-[var(--color-text-tertiary)]' },
              { from: 'USDC', to: 'KES', amount: '$1,200', rate: '129.50', status: 'Completed', color: 'text-[var(--color-text-tertiary)]' },
            ].map((c) => (
              <div key={c.from + c.to + c.amount} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-[var(--color-foreground)]">{c.from}</span>
                    <span className="text-[11px] text-[var(--color-text-muted)]">→</span>
                    <span className="text-[13px] font-semibold text-[var(--color-foreground)]">{c.to}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{c.amount} @ {c.rate}</p>
                  <p className={`text-[11px] font-semibold ${c.color}`}>{c.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pillar 3: Move ──────────────────────────────────────────── */

function MovePanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Move</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Settlements & payouts</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-[var(--color-border)] ring-1 ring-[var(--color-border)]">
          {[
            { l: 'Settled (30d)', v: '$31,080' },
            { l: 'Pending settlement', v: '$1,200' },
            { l: 'Next settlement', v: 'Today, 4pm' },
          ].map((s) => (
            <div key={s.l} className="bg-[var(--color-surface)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">{s.l}</p>
              <p className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{s.v}</p>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="border-b border-[var(--color-surface-secondary)] px-4 py-2.5">
            <p className="text-[11px] font-semibold text-[var(--color-foreground)]">Settlement schedule</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[
              { label: 'Auto-settlement', detail: 'Daily to Primary Account', amount: 'Up to $50,000/day', state: 'Active', stateColor: 'text-[var(--color-text-tertiary)]' },
              { label: 'Last payout', detail: 'NGN — GTBank', amount: '$2,400', state: 'Completed', stateColor: 'text-[var(--color-text-tertiary)]' },
              { label: 'Pending', detail: 'NGN — GTBank', amount: '$1,200', state: 'Tomorrow', stateColor: 'text-[var(--color-text-secondary)]' },
              { label: 'Batch payout', detail: '3 contractors', amount: '$4,500', state: 'Scheduled', stateColor: 'text-[var(--color-text-secondary)]' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{row.label}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{row.detail}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{row.amount}</p>
                  <p className={`text-[11px] font-semibold ${row.stateColor}`}>{row.state}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pillar 4: Scale ─────────────────────────────────────────── */

function ScalePanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Scale</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">AI assistant & integrations</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="mb-3 overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="border-b border-[var(--color-surface-secondary)] px-5 py-4">
            <p className="text-[14px] font-semibold text-[var(--color-foreground)]">AI assistant</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Active · Summarizes activity daily</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[
              { label: 'Daily summary', desc: '3 payments collected ($4,200) · 1 overdue invoice · 1 settlement completed', tag: 'Just now' },
              { label: 'Flagged', desc: 'Invoice #1042 is 14 days overdue — consider sending a reminder', tag: '2 hrs ago' },
              { label: 'Suggested', desc: 'USDC balance above $40K — convert to local currency? Rate is favorable today', tag: 'Yesterday' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[11px]">
                    ✦
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--color-foreground)]">{row.label}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{row.desc}</p>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">{row.tag}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="border-b border-[var(--color-surface-secondary)] px-4 py-2.5">
            <p className="text-[11px] font-semibold text-[var(--color-foreground)]">Integrations</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[
              { name: 'Google Workspace', status: 'Connected', statusClass: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]' },
              { name: 'QuickBooks', status: 'Coming soon', statusClass: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]' },
              { name: 'Slack', status: 'Coming soon', statusClass: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]' },
              { name: 'Xero', status: 'Coming soon', statusClass: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]' },
            ].map((m) => (
              <div key={m.name} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[11px] font-bold text-[var(--color-text-tertiary)]">
                    {m.name[0]}
                  </div>
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{m.name}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${m.statusClass}`}>{m.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
