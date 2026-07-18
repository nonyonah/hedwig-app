'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

const ITEMS = [
  {
    title: 'Payments',
    description:
      'Receive payments via branded links or invoices, hold in USDC, and withdraw when you need to. Stablecoin-native business account with withdrawals and offramp.',
    preview: <PaymentsPanel />,
  },
  {
    title: 'Bookkeeping',
    description:
      'Import bank statements and receipts, auto-match incoming payments to clients, auto-tag transactions as expenses or earnings — no manual entry.',
    preview: <BookkeepingPanel />,
  },
  {
    title: 'Clients & Projects',
    description:
      'Send client reminders, message clients in-app, generate contracts from project scopes, and track time against billable work — all tied to client records.',
    preview: <ClientsPanel />,
  },
  {
    title: 'Payroll & Team',
    description:
      'Run payroll on any schedule, assign projects to team members, manage workspace roles and permissions as a core feature, not an afterthought.',
    preview: <PayrollPanel />,
  },
  {
    title: 'Integrations',
    description:
      'Sync projects from Linear, keep deadlines on Google Calendar, and back up contracts and invoices to Google Docs. Your tools, connected.',
    preview: <IntegrationsPanel />,
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
    <section id="features" className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface)] px-8 py-24">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-16 lg:grid-cols-[400px_1fr] lg:items-start xl:grid-cols-[460px_1fr]">

          {/* ── Left — timeline list ─────────────────────────── */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              The platform
            </p>
            <h2 className="mb-14 text-[32px] font-bold tracking-[-0.04em] text-[var(--color-foreground)] md:text-[42px]">
              A financial platform,<br />not a patchwork of tools.
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

/* ── Pillar 1: Payments ──────────────────────────────────────── */

function PaymentsPanel() {
  const links = [
    { name: 'Brand sprint — payment link', amount: '$1,800', status: 'Paid', statusColor: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]', method: 'Wallet' },
    { name: 'Logo package — invoice', amount: '$450', status: 'Pending', statusColor: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]', method: 'Invoice' },
    { name: 'Web redesign M2 — invoice', amount: '$3,200', status: 'Overdue', statusColor: 'text-[var(--color-text-tertiary)] bg-[var(--color-warning-soft)]', method: 'Invoice' },
    { name: 'Motion kit delivery — payment link', amount: '$900', status: 'Paid', statusColor: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]', method: 'Wallet' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Payments</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Invoices, payment links, and withdrawals</h3>
      </div>
      <div className="flex-1 overflow-hidden px-6 pt-4">
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
                    ⟐
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

/* ── Pillar 2: Bookkeeping ───────────────────────────────────── */

function BookkeepingPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Bookkeeping</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Auto-categorized income & expenses</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
        <div className="overflow-hidden rounded-xl bg-[var(--color-accent-soft)] p-4 text-center ring-1 ring-[var(--color-border)]">
          <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Last import</p>
          <p className="mt-1 text-[13px] font-semibold text-[var(--color-foreground)]">statement-2026-06.csv</p>
          <p className="text-[11px] text-[var(--color-text-muted)]">34 transactions · Auto-categorized</p>
        </div>
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="border-b border-[var(--color-surface-secondary)] px-4 py-2.5">
            <p className="text-[11px] font-semibold text-[var(--color-foreground)]">Recent transactions</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[
              { desc: 'Payment from Acme Corp', amount: '+$1,800', tag: 'Income', tagStyle: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]' },
              { desc: 'Design tools subscription', amount: '-$49', tag: 'Expense', tagStyle: 'text-[var(--color-text-tertiary)] bg-[var(--color-surface-tertiary)]' },
              { desc: 'Invoice #1042 — Ola Design', amount: '+$450', tag: 'Income', tagStyle: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]' },
              { desc: 'Hosting (DigitalOcean)', amount: '-$24', tag: 'Expense', tagStyle: 'text-[var(--color-text-tertiary)] bg-[var(--color-surface-tertiary)]' },
            ].map((t) => (
              <div key={t.desc} className="flex items-center justify-between px-4 py-3">
                <p className="text-[12px] text-[var(--color-foreground)]">{t.desc}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[12px] font-semibold text-[var(--color-foreground)]">{t.amount}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.tagStyle}`}>{t.tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pillar 3: Clients & Projects ────────────────────────────── */

function ClientsPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Clients & Projects</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Work, time, and communication</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[
              { client: 'Acme Corp', project: 'Brand redesign', time: '12h logged', status: 'Active', statusStyle: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]' },
              { client: 'Ola Design', project: 'Logo package', time: '4h logged', status: 'Review', statusStyle: 'text-[var(--color-text-secondary)] bg-[var(--color-warning-soft)]' },
              { client: 'Zenith Labs', project: 'Web redesign', time: '—', status: 'Contract sent', statusStyle: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]' },
            ].map((c) => (
              <div key={c.client} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{c.project}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{c.client} · {c.time}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.statusStyle}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pillar 4: Payroll & Team ────────────────────────────────── */

function PayrollPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Payroll & Team</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Run payroll, assign work, manage access</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-[var(--color-border)] ring-1 ring-[var(--color-border)]">
          {[
            { l: 'Team members', v: '4' },
            { l: 'Next payroll', v: 'Fri, Jul 25' },
          ].map((s) => (
            <div key={s.l} className="bg-[var(--color-surface)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">{s.l}</p>
              <p className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{s.v}</p>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="border-b border-[var(--color-surface-secondary)] px-4 py-2.5">
            <p className="text-[11px] font-semibold text-[var(--color-foreground)]">Team</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[
              { name: 'You', role: 'Owner', projects: '3 active' },
              { name: 'Chioma A.', role: 'Member', projects: '2 active' },
              { name: 'Kofi A.', role: 'Member', projects: '1 active' },
              { name: 'Sandra O.', role: 'Viewer', projects: '—' },
            ].map((m) => (
              <div key={m.name} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[11px] font-bold text-[var(--color-text-tertiary)]">{m.name[0]}</div>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{m.name}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{m.role} · {m.projects}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pillar 5: Integrations ──────────────────────────────────── */

function IntegrationsPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-surface-secondary)] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Integrations</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">Your tools, connected</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
        <div className="overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[
              { name: 'Google Workspace', status: 'Connected', statusClass: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]' },
              { name: 'Linear', status: 'Connected', statusClass: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]' },
              { name: 'Google Calendar', status: 'Connected', statusClass: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]' },
              { name: 'QuickBooks', status: 'Coming soon', statusClass: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]' },
              { name: 'Slack', status: 'Coming soon', statusClass: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]' },
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
