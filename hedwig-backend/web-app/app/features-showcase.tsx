'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

const ITEMS = [
  {
    title: 'Invoices that clients actually pay',
    description:
      'Send branded invoices with clear USDC payment links. Your client sees the amount, due date, and a one-tap way to pay. No confusion, no chasing.',
    preview: <PaymentsPanel />,
  },
  {
    title: 'Every client detail in one place',
    description:
      'Keep contacts, projects, payment history, and outstanding balances together before follow-up gets messy.',
    preview: <ClientsPanel />,
  },
  {
    title: 'Projects that turn into invoices',
    description:
      'Structure work into milestones and budgets so billing is tied to delivery, not memory.',
    preview: <ProjectsPanel />,
  },
  {
    title: 'Clear follow-up, no awkwardness',
    description:
      'See what has been paid, what is pending, and what needs a reminder. Hedwig tells you who to follow up with and when.',
    preview: <ContractPanel />,
  },
  {
    title: 'Your money lives here',
    description:
      'Your Hedwig wallet is where payments land. Check your balance, convert currency, and withdraw to your bank — on web or mobile.',
    preview: <SubscriptionPanel />,
  },
];

export function FeaturesShowcase() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActive((current) => (current + 1) % ITEMS.length);
    }, 3800);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface)] px-8 py-24">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-16 lg:grid-cols-[400px_1fr] lg:items-start xl:grid-cols-[460px_1fr]">

          {/* ── Left — timeline list ─────────────────────────── */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Why freelancers use it
            </p>
            <h2 className="mb-14 text-[32px] font-bold tracking-[-0.04em] text-[var(--color-foreground)] md:text-[42px]">
              Fewer awkward follow-ups.<br />More paid work.
            </h2>

            <div className="relative">
              {/* Vertical connecting line */}
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-[var(--color-border)]" />

              <div className="flex flex-col gap-7 pl-7">
                {ITEMS.map((item, i) => (
                  <button
                    key={item.title}
                    onClick={() => setActive(i)}
                    className="relative text-left"
                  >
                    {/* Dot indicator */}
                    <div
                      className={`absolute -left-7 top-[6px] h-[11px] w-[11px] rounded-sm transition-all duration-300 ${
                        i === active
                          ? 'bg-[var(--color-primary)] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]'
                          : 'border border-[var(--color-border-input)] bg-[var(--color-surface)]'
                      }`}
                    />

                    {/* Title */}
                    <p
                      className={`font-semibold transition-all duration-300 ${
                        i === active
                          ? 'text-[20px] tracking-[-0.025em] text-[var(--color-foreground)]'
                          : 'text-[15px] text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)]'
                      }`}
                    >
                      {item.title}
                    </p>

                    {/* Description — only for active */}
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
            {/* Browser chrome — light */}
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

            {/* Preview content */}
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

/* ── Preview panels ───────────────────────────────────────────── */

function PaymentsPanel() {
  const rows = [
    { net: '/icons/networks/base.png', name: 'Brand sprint invoice', client: 'Acme Corp', amount: '1,800 USDC', status: 'Paid', c: 'bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]' },
    { net: '/icons/networks/solana.png', name: 'Logo package', client: 'Ola Design', amount: '450 USDC', status: 'Sent', c: 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]' },
    { net: '/icons/networks/base.png', name: 'Web redesign — M2', client: 'Zenith Labs', amount: '3,200 USDC', status: 'Overdue', c: 'bg-[var(--color-warning-soft)] text-[var(--color-text-tertiary)]' },
    { net: '/icons/networks/solana.png', name: 'Motion kit delivery', client: 'Spark Studio', amount: '900 USDC', status: 'Draft', c: 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]' },
    { net: '/icons/networks/base.png', name: 'Copywriting retainer', client: 'Bloom Media', amount: '2,000 USDC', status: 'Paid', c: 'bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Payments</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Payment links &amp; invoices</h3>
      </div>
      <div className="px-6 pt-4 pb-2">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-[var(--color-border)] ring-1 ring-[var(--color-border)]">
          {[{ l: 'Total sent', v: '$8,350' }, { l: 'Collected', v: '$6,550' }, { l: 'Pending', v: '$1,800' }].map((s) => (
            <div key={s.l} className="bg-[var(--color-surface)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">{s.l}</p>
              <p className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{s.v}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-6 pb-4 pt-3">
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-[var(--color-surface-secondary)] px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Invoice</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Amount</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Status</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {rows.map((r) => (
              <div key={r.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Image src={r.net} alt="" width={18} height={18} className="shrink-0 rounded-full" />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-[var(--color-foreground)]">{r.name}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{r.client}</p>
                  </div>
                </div>
                <p className="text-[12px] font-semibold text-[var(--color-foreground)]">{r.amount}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.c}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientsPanel() {
  const clients = [
    { initials: 'AC', color: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]', name: 'Acme Corp', email: 'hello@acmecorp.io', projects: 3, billed: '$6,400' },
    { initials: 'OD', color: 'bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]', name: 'Ola Design', email: 'ola@oladesign.co', projects: 1, billed: '$1,800' },
    { initials: 'ZL', color: 'bg-[var(--color-warning-soft)] text-[var(--color-text-tertiary)]', name: 'Zenith Labs', email: 'work@zenithlabs.com', projects: 2, billed: '$9,200' },
    { initials: 'SS', color: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]', name: 'Spark Studio', email: 'team@sparkstudio.co', projects: 1, billed: '$900' },
    { initials: 'BM', color: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]', name: 'Bloom Media', email: 'hi@bloommedia.com', projects: 2, billed: '$4,000' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Workspace</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Clients</h3>
      </div>
      <div className="flex-1 overflow-hidden px-6 py-4">
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 border-b border-[var(--color-surface-secondary)] px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Client</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Projects</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Billed</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {clients.map((c) => (
              <div key={c.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${c.color}`}>
                    {c.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{c.name}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{c.email}</p>
                  </div>
                </div>
                <p className="text-center text-[13px] font-semibold text-[var(--color-foreground)]">{c.projects}</p>
                <p className="text-right text-[13px] font-semibold text-[var(--color-foreground)]">{c.billed}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectsPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Workspace</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Projects &amp; milestones</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="mb-3 overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="flex items-center justify-between border-b border-[var(--color-surface-secondary)] px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Web redesign — Zenith Labs</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Due Apr 20 · $6,000 total</p>
            </div>
            <span className="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-tertiary)]">In progress</span>
          </div>
          <div className="px-4 pt-3 pb-2">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">Progress</p>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">2 of 4 milestones</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
              <div className="h-full w-1/2 rounded-full bg-[var(--color-primary)]" />
            </div>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)] px-4 pb-2">
            {[
              { label: 'Discovery & wireframes', amount: '$1,200', done: true },
              { label: 'Visual design', amount: '$2,400', done: true },
              { label: 'Development handoff', amount: '$1,800', done: false },
              { label: 'Final delivery', amount: '$600', done: false },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${m.done ? 'border-[var(--color-success)] bg-[var(--color-success)]' : 'border-[var(--color-border-input)]'}`}>
                    {m.done && <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-surface)]" />}
                  </div>
                  <p className={`text-[12px] font-medium ${m.done ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-foreground)]'}`}>{m.label}</p>
                </div>
                <p className="text-[12px] font-semibold text-[var(--color-foreground)]">{m.amount}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContractPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Workspace</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Contracts</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="flex items-start justify-between border-b border-[var(--color-surface-secondary)] px-5 py-4">
            <div>
              <p className="text-[14px] font-semibold text-[var(--color-foreground)]">Creator partnership — Ola Design</p>
              <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Sent Jan 12 · 3 milestones · $4,800 total</p>
            </div>
            <span className="rounded-full bg-[var(--color-warning-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-tertiary)]">Awaiting signature</span>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[
              { label: 'M1 — Brand audit', amount: '$1,200', date: 'Mar 14', done: true, invoice: 'Paid' },
              { label: 'M2 — Visual identity', amount: '$2,400', date: 'Apr 1', done: false, invoice: 'Pending' },
              { label: 'M3 — Final deliverables', amount: '$1,200', date: 'Apr 20', done: false, invoice: 'Not sent' },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${m.done ? 'border-[var(--color-success)] bg-[var(--color-success)]' : 'border-[var(--color-border-input)]'}`}>
                    {m.done && <div className="h-2 w-2 rounded-full bg-[var(--color-surface)]" />}
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--color-foreground)]">{m.label}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">Due {m.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[12px] font-semibold text-[var(--color-foreground)]">{m.amount}</p>
                  <p className={`text-[11px] font-semibold ${m.invoice === 'Paid' ? 'text-[var(--color-text-tertiary)]' : m.invoice === 'Pending' ? 'text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-muted)]'}`}>{m.invoice}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubscriptionPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">System</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Subscription</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[var(--color-surface)] p-4 ring-1 ring-[var(--color-border)]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Current plan</p>
            <p className="mt-2 text-[26px] font-bold leading-none tracking-[-0.03em] text-[var(--color-foreground)]">Pro</p>
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">Annual billing enabled</p>
          </div>
          <div className="rounded-xl bg-[var(--color-accent-soft)] p-4 ring-1 ring-[var(--color-accent-soft)]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-secondary)]">Renewal</p>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
              <p className="text-[14px] font-semibold text-[var(--color-foreground)]">Apr 22, 2026</p>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Auto-renew is on</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="border-b border-[var(--color-surface-secondary)] px-4 py-2.5">
            <p className="text-[11px] font-semibold text-[var(--color-foreground)]">Plan activity</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[
              { label: 'Plan upgraded', context: 'From Free to Pro', detail: 'Apr 12, 2026', state: 'Completed' },
              { label: 'Billing method', context: 'Visa ending 1284', detail: 'Updated Apr 10, 2026', state: 'Active' },
              { label: 'Mobile companion', context: 'Wallet tools remain in app', detail: 'Linked account', state: 'Connected' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{row.label}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{row.context}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{row.state}</p>
                  <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">{row.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
