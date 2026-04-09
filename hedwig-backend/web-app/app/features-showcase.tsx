'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

const ITEMS = [
  {
    title: 'Crypto-native payments',
    description:
      'Payment links and invoices clients settle in USDC directly from their wallet — no account, no bank delay.',
    preview: <PaymentsPanel />,
  },
  {
    title: 'Client management',
    description:
      'Keep every client, their contact details, linked projects, and payment history in one place.',
    preview: <ClientsPanel />,
  },
  {
    title: 'Projects & milestones',
    description:
      'Structure work into projects with milestones and budgets. Invoices generate automatically as milestones ship.',
    preview: <ProjectsPanel />,
  },
  {
    title: 'Contracts → invoices → reminders',
    description:
      'Define project scope, generate a contract, attach milestones, and let Hedwig create invoices as work ships.',
    preview: <ContractPanel />,
  },
  {
    title: 'Wallet, USD account & offramp',
    description:
      'Receive USDC on Base or Solana, hold in your embedded wallet, and move to your bank whenever you need.',
    preview: <WalletPanel />,
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
    <section className="border-t border-[#f1f2f4] bg-white px-8 py-24">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-16 lg:grid-cols-[400px_1fr] lg:items-start xl:grid-cols-[460px_1fr]">

          {/* ── Left — timeline list ─────────────────────────── */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a4a7ae]">
              What&apos;s inside
            </p>
            <h2 className="mb-14 text-[32px] font-bold tracking-[-0.04em] text-[#181d27] md:text-[42px]">
              Less tool switching.<br />More work getting paid.
            </h2>

            <div className="relative">
              {/* Vertical connecting line */}
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-[#e9eaeb]" />

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
                          ? 'bg-[#2563eb] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]'
                          : 'border border-[#d5d7da] bg-white'
                      }`}
                    />

                    {/* Title */}
                    <p
                      className={`font-semibold transition-all duration-300 ${
                        i === active
                          ? 'text-[20px] tracking-[-0.025em] text-[#181d27]'
                          : 'text-[15px] text-[#a4a7ae] hover:text-[#667085]'
                      }`}
                    >
                      {item.title}
                    </p>

                    {/* Description — only for active */}
                    {i === active && (
                      <p className="mt-2.5 text-[14px] leading-[1.75] text-[#667085]">
                        {item.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right — preview panel ────────────────────────── */}
          <div className="overflow-hidden rounded-2xl border border-[#e2e4e8] bg-[#f4f5f7] shadow-[0_4px_40px_rgba(24,29,39,0.07)]">
            {/* Browser chrome — light */}
            <div className="flex items-center gap-3 border-b border-[#e2e4e8] bg-[#f4f5f7] px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-[#fe5f57]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex h-5 w-48 items-center justify-center gap-1.5 rounded-md bg-white px-3 ring-1 ring-[#d5d7da]">
                <div className="h-2 w-2 rounded-full bg-[#17b26a]" />
                <span className="text-[11px] text-[#667085]">app.hedwig.money</span>
              </div>
            </div>

            {/* Preview content */}
            <div className="relative h-[480px] overflow-hidden bg-white">
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
    { net: '/icons/networks/base.png', name: 'Brand sprint invoice', client: 'Acme Corp', amount: '1,800 USDC', status: 'Paid', c: 'bg-[#ecfdf3] text-[#717680]' },
    { net: '/icons/networks/solana.png', name: 'Logo package', client: 'Ola Design', amount: '450 USDC', status: 'Sent', c: 'bg-[#f2f4f7] text-[#344054]' },
    { net: '/icons/networks/base.png', name: 'Web redesign — M2', client: 'Zenith Labs', amount: '3,200 USDC', status: 'Overdue', c: 'bg-[#fffaeb] text-[#717680]' },
    { net: '/icons/networks/solana.png', name: 'Motion kit delivery', client: 'Spark Studio', amount: '900 USDC', status: 'Draft', c: 'bg-[#f2f4f7] text-[#344054]' },
    { net: '/icons/networks/base.png', name: 'Copywriting retainer', client: 'Bloom Media', amount: '2,000 USDC', status: 'Paid', c: 'bg-[#ecfdf3] text-[#717680]' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#f5f5f5] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#a4a7ae]">Payments</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[#181d27]">Payment links &amp; invoices</h3>
      </div>
      <div className="px-6 pt-4 pb-2">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
          {[{ l: 'Total sent', v: '$8,350' }, { l: 'Collected', v: '$6,550' }, { l: 'Pending', v: '$1,800' }].map((s) => (
            <div key={s.l} className="bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">{s.l}</p>
              <p className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-[#181d27]">{s.v}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-6 pb-4 pt-3">
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-[#e9eaeb]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-[#f5f5f5] px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a4a7ae]">Invoice</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a4a7ae]">Amount</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a4a7ae]">Status</p>
          </div>
          <div className="divide-y divide-[#f9fafb]">
            {rows.map((r) => (
              <div key={r.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Image src={r.net} alt="" width={18} height={18} className="shrink-0 rounded-full" />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-[#181d27]">{r.name}</p>
                    <p className="text-[11px] text-[#a4a7ae]">{r.client}</p>
                  </div>
                </div>
                <p className="text-[12px] font-semibold text-[#181d27]">{r.amount}</p>
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
    { initials: 'AC', color: 'bg-[#eff4ff] text-[#717680]', name: 'Acme Corp', email: 'hello@acmecorp.io', projects: 3, billed: '$6,400' },
    { initials: 'OD', color: 'bg-[#ecfdf3] text-[#717680]', name: 'Ola Design', email: 'ola@oladesign.co', projects: 1, billed: '$1,800' },
    { initials: 'ZL', color: 'bg-[#fffaeb] text-[#717680]', name: 'Zenith Labs', email: 'work@zenithlabs.com', projects: 2, billed: '$9,200' },
    { initials: 'SS', color: 'bg-[#f4f3ff] text-[#717680]', name: 'Spark Studio', email: 'team@sparkstudio.co', projects: 1, billed: '$900' },
    { initials: 'BM', color: 'bg-[#fdf2fa] text-[#717680]', name: 'Bloom Media', email: 'hi@bloommedia.com', projects: 2, billed: '$4,000' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#f5f5f5] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#a4a7ae]">Workspace</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[#181d27]">Clients</h3>
      </div>
      <div className="flex-1 overflow-hidden px-6 py-4">
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-[#e9eaeb]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 border-b border-[#f5f5f5] px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a4a7ae]">Client</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a4a7ae]">Projects</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a4a7ae]">Billed</p>
          </div>
          <div className="divide-y divide-[#f9fafb]">
            {clients.map((c) => (
              <div key={c.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${c.color}`}>
                    {c.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#181d27]">{c.name}</p>
                    <p className="text-[11px] text-[#a4a7ae]">{c.email}</p>
                  </div>
                </div>
                <p className="text-center text-[13px] font-semibold text-[#181d27]">{c.projects}</p>
                <p className="text-right text-[13px] font-semibold text-[#181d27]">{c.billed}</p>
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
      <div className="border-b border-[#f5f5f5] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#a4a7ae]">Workspace</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[#181d27]">Projects &amp; milestones</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="mb-3 overflow-hidden rounded-xl bg-white ring-1 ring-[#e9eaeb]">
          <div className="flex items-center justify-between border-b border-[#f5f5f5] px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-[#181d27]">Web redesign — Zenith Labs</p>
              <p className="mt-0.5 text-[11px] text-[#a4a7ae]">Due Apr 20 · $6,000 total</p>
            </div>
            <span className="rounded-full bg-[#eff4ff] px-2.5 py-1 text-[11px] font-semibold text-[#717680]">In progress</span>
          </div>
          <div className="px-4 pt-3 pb-2">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-[#a4a7ae]">Progress</p>
              <p className="text-[11px] font-semibold text-[#717680]">2 of 4 milestones</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#f2f4f7]">
              <div className="h-full w-1/2 rounded-full bg-[#2563eb]" />
            </div>
          </div>
          <div className="divide-y divide-[#f9fafb] px-4 pb-2">
            {[
              { label: 'Discovery & wireframes', amount: '$1,200', done: true },
              { label: 'Visual design', amount: '$2,400', done: true },
              { label: 'Development handoff', amount: '$1,800', done: false },
              { label: 'Final delivery', amount: '$600', done: false },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${m.done ? 'border-[#17b26a] bg-[#17b26a]' : 'border-[#d5d7da]'}`}>
                    {m.done && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <p className={`text-[12px] font-medium ${m.done ? 'text-[#a4a7ae] line-through' : 'text-[#181d27]'}`}>{m.label}</p>
                </div>
                <p className="text-[12px] font-semibold text-[#181d27]">{m.amount}</p>
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
      <div className="border-b border-[#f5f5f5] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#a4a7ae]">Workspace</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[#181d27]">Contracts</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-[#e9eaeb]">
          <div className="flex items-start justify-between border-b border-[#f5f5f5] px-5 py-4">
            <div>
              <p className="text-[14px] font-semibold text-[#181d27]">Creator partnership — Ola Design</p>
              <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Sent Jan 12 · 3 milestones · $4,800 total</p>
            </div>
            <span className="rounded-full bg-[#fffaeb] px-2.5 py-1 text-[11px] font-semibold text-[#717680]">Awaiting signature</span>
          </div>
          <div className="divide-y divide-[#f9fafb]">
            {[
              { label: 'M1 — Brand audit', amount: '$1,200', date: 'Mar 14', done: true, invoice: 'Paid' },
              { label: 'M2 — Visual identity', amount: '$2,400', date: 'Apr 1', done: false, invoice: 'Pending' },
              { label: 'M3 — Final deliverables', amount: '$1,200', date: 'Apr 20', done: false, invoice: 'Not sent' },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${m.done ? 'border-[#17b26a] bg-[#17b26a]' : 'border-[#d5d7da]'}`}>
                    {m.done && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#181d27]">{m.label}</p>
                    <p className="text-[11px] text-[#a4a7ae]">Due {m.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[12px] font-semibold text-[#181d27]">{m.amount}</p>
                  <p className={`text-[11px] font-semibold ${m.invoice === 'Paid' ? 'text-[#717680]' : m.invoice === 'Pending' ? 'text-[#717680]' : 'text-[#a4a7ae]'}`}>{m.invoice}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WalletPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#f5f5f5] px-6 py-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#a4a7ae]">Money</p>
        <h3 className="mt-1 text-[18px] font-semibold text-[#181d27]">Wallet &amp; offramp</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 ring-1 ring-[#e9eaeb]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Total balance</p>
            <p className="mt-2 text-[26px] font-bold leading-none tracking-[-0.03em] text-[#181d27]">$8,240</p>
            <div className="mt-2.5 flex gap-1.5">
              {['/icons/tokens/usdc.png', '/icons/tokens/eth.png', '/icons/networks/solana.png'].map((src) => (
                <Image key={src} src={src} alt="" width={16} height={16} className="rounded-full ring-1 ring-white" />
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-[#eff4ff] p-4 ring-1 ring-[#dbe6ff]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#475467]">USD account</p>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-[#17b26a]" />
              <p className="text-[14px] font-semibold text-[#181d27]">Active</p>
            </div>
            <p className="mt-1 text-[11px] text-[#667085]">Bridge · Bank transfer</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-[#e9eaeb]">
          <div className="border-b border-[#f5f5f5] px-4 py-2.5">
            <p className="text-[11px] font-semibold text-[#181d27]">Assets</p>
          </div>
          <div className="divide-y divide-[#f9fafb]">
            {[
              { src: '/icons/tokens/usdc.png', label: 'USDC', chain: 'Base', val: '$6,200', change: '+$1,800', up: true },
              { src: '/icons/tokens/eth.png', label: 'ETH', chain: 'Base', val: '$1,420', change: '-$180', up: false },
              { src: '/icons/networks/solana.png', label: 'SOL', chain: 'Solana', val: '$620', change: '+$90', up: true },
            ].map((a) => (
              <div key={a.label} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Image src={a.src} alt={a.label} width={24} height={24} className="rounded-full" />
                  <div>
                    <p className="text-[13px] font-semibold text-[#181d27]">{a.label}</p>
                    <p className="text-[11px] text-[#a4a7ae]">{a.chain}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-[#181d27]">{a.val}</p>
                  <p className={`text-[11px] font-semibold ${a.up ? 'text-[#717680]' : 'text-[#717680]'}`}>{a.change}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
