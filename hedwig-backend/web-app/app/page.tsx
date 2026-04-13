import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight } from '@/components/ui/lucide-icons';
import { getCurrentSession } from '@/lib/auth/session';
import { FeaturesShowcase } from './features-showcase';
import { AnimateIn } from './animate-in';

export default async function IndexPage() {
  const session = await getCurrentSession();
  if (session.accessToken) {
    redirect('/dashboard');
  }
  return <LandingPage />;
}

/* ─────────────────────────────────────────────────────────────── */

const NAV_GROUPS = [
  { label: 'Overview', items: ['Dashboard', 'Insights', 'Calendar'] },
  { label: 'Workspace', items: ['Clients', 'Projects', 'Contracts'] },
  { label: 'Money', items: ['Payments', 'Wallet', 'Offramp'] },
];

/* ─────────────────────────────────────────────────────────────── */

function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans antialiased">

      {/* ── Nav ───────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-[#eef0f3] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-8 py-4">
          <Link href="/">
            <Image src="/hedwig-logo.png" alt="Hedwig" width={38} height={38} priority />
          </Link>
          <div className="flex items-center gap-5">
            <Link
              href="/pricing"
              className="text-[13px] font-semibold text-[#717680] transition-colors duration-200 hover:text-[#181d27]"
            >
              Pricing
            </Link>
            <Link
              href="/privacy"
              className="text-[13px] font-semibold text-[#717680] transition-colors duration-200 hover:text-[#181d27]"
            >
              Privacy
            </Link>
            <a
              href="/api/auth/demo"
              className="inline-flex h-9 items-center justify-center rounded-full border border-[#d5d7da] bg-white px-5 text-[13px] font-semibold text-[#344054] transition-all duration-200 hover:bg-[#f9fafb] hover:border-[#c0c3c9]"
            >
              Try demo
            </a>
            <Link
              href="/sign-in"
              className="inline-flex h-9 items-center justify-center rounded-full bg-[#2563eb] px-5 text-[13px] font-semibold text-white transition-all duration-200 hover:bg-[#1d4ed8]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[#f1f2f4] bg-[#fafbff] px-8 pb-0 pt-20">
        <div className="pointer-events-none absolute left-1/4 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.10),transparent_70%)]" />

        <div className="relative mx-auto max-w-[1400px]">
          {/* Headline */}
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <div
              className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-[#dbe6ff] bg-white px-3.5 py-1.5 shadow-sm"
              style={{ animationDelay: '0ms' }}
            >
              <span className="text-[12px] font-semibold text-[#475467]">
                Your entire freelance workflow, in one place
              </span>
            </div>
            <h1
              className="animate-fade-up text-[52px] font-bold leading-[0.97] tracking-[-0.055em] text-[#181d27] md:text-[68px] lg:text-[80px]"
              style={{ animationDelay: '80ms' }}
            >
              The operating system<br className="hidden sm:block" /> for freelance work.
            </h1>
            <p
              className="animate-fade-up mx-auto mt-6 max-w-xl text-[17px] leading-[1.75] text-[#667085]"
              style={{ animationDelay: '160ms' }}
            >
              Hedwig ties clients, projects, contracts, invoices, crypto payments, and your
              wallet into one clean workflow — built for independent professionals.
            </p>
            <div
              className="animate-fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: '240ms' }}
            >
              <Link
                href="/sign-in"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#2563eb] px-8 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.22)] transition-all duration-200 hover:bg-[#1d4ed8] hover:shadow-[0_12px_32px_rgba(37,99,235,0.32)]"
              >
                Start using Hedwig
                <ArrowRight className="h-4 w-4" weight="bold" />
              </Link>
              <a
                href="/api/auth/demo"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d5d7da] bg-white px-8 text-[14px] font-semibold text-[#344054] transition-all duration-200 hover:bg-[#f9fafb] hover:border-[#c0c3c9]"
              >
                Try demo
              </a>
            </div>
          </div>

          {/* App mockup */}
          <div
            className="animate-fade-up relative mx-auto max-w-[1160px]"
            style={{ animationDelay: '340ms' }}
          >
            <div className="absolute -bottom-8 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full bg-[#2563eb] opacity-[0.07] blur-3xl" />
            <div className="relative overflow-hidden rounded-t-2xl border border-b-0 border-[#e2e4e8] bg-[#f4f5f7] shadow-[0_-4px_40px_rgba(24,29,39,0.08)]">
              {/* Browser bar */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#fe5f57]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </div>
                <div className="flex flex-1 justify-center">
                  <div className="flex h-6 w-56 items-center justify-center gap-1.5 rounded-md bg-white px-3 ring-1 ring-[#d5d7da]">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#17b26a]" />
                    <span className="text-[11px] text-[#667085]">app.hedwig.money</span>
                  </div>
                </div>
              </div>

              {/* App shell */}
              <div className="flex h-[540px] overflow-hidden border-t border-[#e2e4e8]">
                {/* Sidebar */}
                <aside className="flex w-[186px] shrink-0 flex-col border-r border-[#e9eaeb] bg-white py-5">
                  <div className="mb-5 flex items-center gap-2.5 px-4">
                    <Image src="/hedwig-logo.png" alt="Hedwig" width={26} height={26} />
                    <span className="text-[13px] font-semibold text-[#181d27]">Hedwig</span>
                  </div>
                  {NAV_GROUPS.map((group) => (
                    <div key={group.label} className="mb-4 px-3">
                      <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#a4a7ae]">
                        {group.label}
                      </p>
                      {group.items.map((item) => (
                        <div
                          key={item}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium ${
                            item === 'Dashboard'
                              ? 'bg-[#f5f8ff] font-semibold text-[#717680]'
                              : 'text-[#535862]'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${item === 'Dashboard' ? 'bg-[#2563eb]' : 'bg-[#d5d7da]'}`} />
                          {item}
                        </div>
                      ))}
                    </div>
                  ))}
                </aside>

                {/* Main content */}
                <main className="flex-1 overflow-hidden bg-[#f8f9fb] p-5">
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#a4a7ae]">Overview</p>
                    <h2 className="mt-0.5 text-[17px] font-semibold text-[#181d27]">Dashboard</h2>
                  </div>
                  <div className="mb-4 grid grid-cols-4 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
                    {[
                      { label: 'This month', value: '$12,480', sub: '+18% vs last month' },
                      { label: 'Payment rate', value: '94%', sub: '17 of 18 paid' },
                      { label: 'Pending invoices', value: '$3,200', sub: '2 outstanding' },
                      { label: 'Active clients', value: '6', sub: '3 projects live' },
                    ].map((s) => (
                      <div key={s.label} className="bg-white px-4 py-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">{s.label}</p>
                        <p className="mt-1.5 text-[20px] font-bold leading-none tracking-[-0.03em] text-[#181d27]">{s.value}</p>
                        <p className="mt-1 text-[10px] text-[#717680]">{s.sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
                    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb]">
                      <div className="border-b border-[#f5f5f5] px-4 py-3">
                        <p className="text-[12px] font-semibold text-[#181d27]">Recent payments</p>
                      </div>
                      <div className="divide-y divide-[#f9fafb]">
                        {[
                          { net: '/icons/networks/base.png', name: 'Brand sprint invoice', client: 'Acme Corp', amount: '1,800 USDC', status: 'Paid', color: 'text-[#717680] bg-[#ecfdf3]' },
                          { net: '/icons/networks/solana.png', name: 'Logo package', client: 'Ola Design', amount: '450 USDC', status: 'Sent', color: 'text-[#344054] bg-[#f2f4f7]' },
                          { net: '/icons/networks/base.png', name: 'Web redesign — M2', client: 'Zenith Labs', amount: '3,200 USDC', status: 'Overdue', color: 'text-[#717680] bg-[#fffaeb]' },
                          { net: '/icons/networks/solana.png', name: 'Motion kit delivery', client: 'Spark Studio', amount: '900 USDC', status: 'Draft', color: 'text-[#344054] bg-[#f2f4f7]' },
                        ].map((tx) => (
                          <div key={tx.name} className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Image src={tx.net} alt="Network" width={18} height={18} className="shrink-0 rounded-full" />
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-semibold text-[#181d27]">{tx.name}</p>
                                <p className="text-[10px] text-[#a4a7ae]">{tx.client}</p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <p className="text-[11px] font-semibold text-[#181d27]">{tx.amount}</p>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tx.color}`}>{tx.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex-1 overflow-hidden rounded-2xl bg-white p-4 ring-1 ring-[#e9eaeb]">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Wallet</p>
                        <p className="mt-2 text-[22px] font-bold leading-none tracking-[-0.03em] text-[#181d27]">$8,240</p>
                        <p className="mt-1 text-[10px] text-[#717680]">Across Base &amp; Solana</p>
                        <div className="mt-3 flex gap-1.5">
                          {[
                            { src: '/icons/tokens/usdc.png', label: 'USDC' },
                          ].map((t) => (
                            <div key={t.label} className="flex items-center gap-1 rounded-full border border-[#e9eaeb] bg-[#f9fafb] px-2 py-1">
                              <Image src={t.src} alt={t.label} width={12} height={12} className="rounded-full" />
                              <span className="text-[10px] font-semibold text-[#344054]">{t.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-2xl bg-white p-4 ring-1 ring-[#e9eaeb]">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">USDC Settlement</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#17b26a]" />
                          <p className="text-[12px] font-semibold text-[#181d27]">Ready to bridge</p>
                        </div>
                        <p className="mt-1 text-[10px] text-[#717680]">Unified USDC across chains</p>
                      </div>
                    </div>
                  </div>
                </main>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <FeaturesShowcase />

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="border-t border-[#f1f2f4] bg-[#f8f9fb] px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn className="mb-14 text-center">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a4a7ae]">How it works</p>
            <h2 className="text-[32px] font-bold tracking-[-0.04em] text-[#181d27] md:text-[44px]">
              From agreement to payout,<br className="hidden md:block" /> without the mess.
            </h2>
          </AnimateIn>
          <div className="grid gap-px overflow-hidden rounded-[28px] border border-[#e9eaeb] bg-[#e9eaeb] md:grid-cols-3">
            {[
              { step: '01', label: 'Capture the work', desc: 'Create a client, open a project, define milestones. Every commercial detail stays attached from the start.', accent: 'bg-[#eff4ff] text-[#717680]' },
              { step: '02', label: 'Send the agreement', desc: 'Generate a contract and payment request in one flow. The client signs and pays without leaving the link.', accent: 'bg-[#ecfdf3] text-[#717680]' },
              { step: '03', label: 'Collect and settle', desc: 'USDC lands in your wallet instantly. Track it live and move to your bank whenever you choose.', accent: 'bg-[#fffaeb] text-[#717680]' },
            ].map(({ step, label, desc, accent }, i) => (
              <AnimateIn key={step} delay={i * 80}>
                <div className="flex h-full flex-col bg-white px-8 py-10">
                  <span className={`mb-5 inline-flex w-fit rounded-full px-3 py-1 text-[12px] font-bold ${accent}`}>{step}</span>
                  <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-[#181d27]">{label}</h3>
                  <p className="mt-3 text-[14px] leading-7 text-[#667085]">{desc}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Download ──────────────────────────────────────────── */}
      <section id="download" className="border-t border-[#f1f2f4] bg-white px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn>
            <div className="overflow-hidden rounded-[32px] border border-[#e9eaeb] bg-[#f8f9fb]">
              <div className="grid md:grid-cols-2">
                {/* Text side */}
                <div className="flex flex-col justify-center px-10 py-14 md:px-14">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a4a7ae]">Mobile app</p>
                  <h2 className="text-[30px] font-bold tracking-[-0.04em] text-[#181d27] md:text-[38px]">
                    Run your workflow on the move
                  </h2>
                  <p className="mt-4 max-w-sm text-[15px] leading-7 text-[#667085]">
                    Open projects, monitor milestones, receive payments, and manage your wallet from iOS and Android.
                  </p>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <AppStoreButton />
                    <GooglePlayButton />
                  </div>
                </div>

                {/* Phone screenshot */}
                <div className="relative flex items-center justify-center bg-[linear-gradient(145deg,#eff6ff,#f8fbff)] px-4 py-6 md:px-6 md:py-4">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_30%,rgba(37,99,235,0.12),transparent_65%)]" />
                  <Image
                    src="/mobile-preview-20260319c.png"
                    alt="Hedwig mobile app"
                    width={460}
                    height={948}
                    priority
                    sizes="(max-width: 768px) 90vw, 460px"
                    className="relative w-full max-w-[460px] drop-shadow-2xl"
                  />
                </div>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="border-t border-[#f1f2f4] px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn>
            <div className="relative overflow-hidden rounded-[32px] bg-[#181d27] px-10 py-20 text-center shadow-[0_24px_80px_rgba(24,29,39,0.18)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.35),transparent_55%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(37,99,235,0.20),transparent_55%)]" />
              <div className="relative">
                <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#717680]">Start now</p>
                <h2 className="text-[32px] font-bold tracking-[-0.04em] text-white md:text-[48px]">
                  Make your money workflow<br className="hidden md:block" /> feel as polished as your work.
                </h2>
                <p className="mx-auto mt-5 max-w-lg text-[15px] leading-7 text-[#94a3b8]">
                  Contracts, invoices, wallets, and payouts — in one system built for the way independent work actually runs.
                </p>
                <Link
                  href="/sign-in"
                  className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-white px-8 text-[14px] font-semibold text-[#181d27] transition-all duration-200 hover:bg-[#f1f5ff] hover:shadow-lg"
                >
                  Create your account
                  <ArrowRight className="h-4 w-4" weight="bold" />
                </Link>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-[#f1f2f4] bg-white px-8 py-10">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-5 sm:flex-row">
          <Link href="/">
            <Image src="/hedwig-logo.png" alt="Hedwig" width={32} height={32} />
          </Link>
          <p className="text-[12px] text-[#a4a7ae]">© {new Date().getFullYear()} Hedwig. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/pricing" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Pricing</Link>
            <Link href="/privacy" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Privacy</Link>
            <Link href="/terms" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Terms</Link>
            <Link href="/returns" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Returns</Link>
            <Link href="/sign-in" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Sign in</Link>
            <a href="mailto:support@hedwigbot.xyz" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Support</a>
            <a href="https://x.com/hedwigagent" target="_blank" rel="noreferrer" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">X</a>
            <a href="https://t.me/hedwigofficial" target="_blank" rel="noreferrer" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Telegram</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── App store buttons ────────────────────────────────────────── */

function AppStoreButton() {
  return (
    <a
      href="https://testflight.apple.com/join/aKXnyjP4"
      target="_blank"
      rel="noreferrer"
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-[#181d27] bg-[#181d27] px-5 transition-all duration-200 hover:bg-[#0e1521] sm:w-auto"
      aria-label="Join our TestFlight"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" xmlns="http://www.w3.org/2000/svg">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.22 1.31-2.2 3.91.03 3.02 2.65 4.03 2.68 4.04l-.03.17zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
      <div className="text-left">
        <p className="text-[10px] font-medium leading-none text-white/70">Join our</p>
        <p className="text-[13px] font-semibold leading-tight text-white">TestFlight</p>
      </div>
    </a>
  );
}

function GooglePlayButton() {
  return (
    <a
      href="https://play.google.com/store/apps/details?id=com.hedwig.app"
      target="_blank"
      rel="noreferrer"
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-[#181d27] bg-[#181d27] px-5 transition-all duration-200 hover:bg-[#0e1521] sm:w-auto"
      aria-label="Get it on Google Play"
    >
      <Image src="/google-play-icon.svg" alt="" width={20} height={20} className="h-5 w-5" />
      <div className="text-left">
        <p className="text-[10px] font-medium leading-none text-white/70">Get it on</p>
        <p className="text-[13px] font-semibold leading-tight text-white">Google Play</p>
      </div>
    </a>
  );
}
