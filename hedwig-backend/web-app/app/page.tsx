import Image from 'next/image';
import Link from 'next/link';
import { HedwigLogo } from '@/components/ui/hedwig-logo';
import { redirect } from 'next/navigation';
import { ArrowRight, CheckCircle } from '@/components/ui/lucide-icons';
import { getCurrentSession } from '@/lib/auth/session';
import { FeaturesShowcase } from './features-showcase';
import { AnimateIn } from './animate-in';
import { ForceLightTheme } from './force-light-theme';

export default async function IndexPage() {
  const session = await getCurrentSession();
  if (session.accessToken && !session.isMockSession) {
    redirect('/dashboard');
  }
  return <LandingPage />;
}

const NAV_GROUPS = [
  { label: 'Overview', items: ['Dashboard', 'Insights', 'Treasury'] },
  { label: 'Payments', items: ['Payment Links', 'Payouts'] },
  { label: 'Settings', items: ['Team', 'Integrations'] },
];

function LandingPage() {
  const showRemoteProductHuntBadge = process.env.NODE_ENV !== 'development';

  return (
    <ForceLightTheme>
    <div className="min-h-screen overflow-x-hidden bg-[var(--color-surface)] font-sans antialiased">

      {/* ── Nav ───────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-[var(--color-border-light)] bg-[var(--color-surface)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-8 py-4">
          <Link href="/">
            <HedwigLogo width={38} height={38} priority />
          </Link>
          <div className="flex items-center gap-6">
            <a href="#pricing" className="hidden text-[13px] font-semibold text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)] sm:block">
              Pricing
            </a>
            <a href="mailto:support@hedwigbot.xyz" className="hidden text-[13px] font-semibold text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)] sm:block">
              Contact
            </a>
            <Link
              href="/sign-in"
              className="text-[13px] font-semibold text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)]"
            >
              Sign in
            </Link>
            <a
              href="/api/auth/exit-demo"
              className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--color-primary)] px-5 text-[13px] font-semibold text-white transition-all duration-200 hover:bg-[var(--color-primary-dark)]"
            >
              Get started
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[var(--color-surface-tertiary)] bg-[var(--color-accent-soft)] px-8 pb-0 pt-20">
        <div className="pointer-events-none absolute left-1/4 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(37,99,235,0.10),transparent_70%)]" />

        <div className="relative mx-auto max-w-[1400px]">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <div
              className="animate-fade-up mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--color-accent-soft)] bg-[var(--color-surface)] px-3.5 py-1.5 shadow-sm"
              style={{ animationDelay: '0ms' }}
            >
              <span className="text-[12px] font-semibold text-[var(--color-text-secondary)]">
                Global payment infrastructure for modern businesses
              </span>
            </div>
            <h1
              className="animate-fade-up text-[52px] font-bold leading-[0.97] tracking-[-0.055em] text-[var(--color-foreground)] md:text-[68px] lg:text-[80px]"
              style={{ animationDelay: '80ms' }}
            >
              Receive, manage, and move money — across borders
            </h1>
            <p
              className="animate-fade-up mx-auto mt-6 max-w-xl text-[17px] leading-[1.75] text-[var(--color-text-muted)]"
              style={{ animationDelay: '160ms' }}
            >
              One platform to collect payments from anywhere in the world, manage your treasury in a single balance, and settle funds where they need to go. No hidden fees, no monthly subscriptions.
            </p>
            <div
              className="animate-fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: '240ms' }}
            >
              <a
                href="/api/auth/exit-demo"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--color-primary)] px-8 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.22)] transition-all duration-200 hover:bg-[var(--color-primary-dark)] hover:shadow-[0_12px_32px_rgba(37,99,235,0.32)]"
              >
                Get started
                <ArrowRight className="h-4 w-4" weight="bold" />
              </a>
              <a
                href="/api/auth/demo"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-8 text-[14px] font-semibold text-[var(--color-foreground)] transition-all duration-200 hover:bg-[var(--color-surface-secondary)]"
              >
                Watch demo
              </a>
            </div>
            <p
              className="animate-fade-up mt-3 text-[12px] font-medium text-[var(--color-text-muted)]"
              style={{ animationDelay: '280ms' }}
            >
              No card required. Set up in 2 minutes. You only pay when you settle funds.
            </p>

            {showRemoteProductHuntBadge ? (
              <div
                className="animate-fade-up mt-7 flex justify-center"
                style={{ animationDelay: '320ms' }}
              >
                <a
                  href="https://www.producthunt.com/products/hedwig-3?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-hedwig-3"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Hedwig on Product Hunt"
                  className="inline-flex transition-transform duration-200 hover:scale-[1.02]"
                >
                  <img
                    src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1138206&theme=neutral&t=1777895408783"
                    alt="Hedwig - Global payment infrastructure for modern businesses | Product Hunt"
                    width={250}
                    height={54}
                  />
                </a>
              </div>
            ) : null}
          </div>

          {/* App mockup — treasury dashboard */}
          <div
            className="animate-fade-up relative mx-auto max-w-[1160px]"
            style={{ animationDelay: '340ms' }}
          >
            <div className="absolute -bottom-8 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full bg-[var(--color-primary)] opacity-[0.07] blur-3xl" />
            <div className="relative overflow-hidden rounded-t-2xl border border-b-0 border-[var(--color-border-light)] bg-[var(--color-surface-tertiary)] shadow-[0_-4px_40px_rgba(24,29,39,0.08)]">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-danger)]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-warning)]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
                </div>
                <div className="flex flex-1 justify-center">
                  <div className="flex h-6 w-56 items-center justify-center gap-1.5 rounded-md bg-[var(--color-surface)] px-3 ring-1 ring-[var(--color-border-input)]">
                    <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
                    <span className="text-[11px] text-[var(--color-text-muted)]">app.hedwig.money</span>
                  </div>
                </div>
              </div>

              <div className="flex h-[540px] overflow-hidden border-t border-[var(--color-border-light)]">
                <aside className="flex w-[186px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] py-5">
                  <div className="mb-5 flex items-center gap-2.5 px-4">
                    <HedwigLogo width={26} height={26} />
                    <span className="text-[13px] font-semibold text-[var(--color-foreground)]">Hedwig</span>
                  </div>
                  {NAV_GROUPS.map((group) => (
                    <div key={group.label} className="mb-4 px-3">
                      <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                        {group.label}
                      </p>
                      {group.items.map((item) => (
                        <div
                          key={item}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium ${
                            item === 'Treasury'
                              ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-text-tertiary)]'
                              : 'text-[var(--color-text-secondary)]'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${item === 'Treasury' ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-input)]'}`} />
                          {item}
                        </div>
                      ))}
                    </div>
                  ))}
                </aside>

                <main className="flex-1 overflow-hidden bg-[var(--color-surface-secondary)] p-5">
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Overview</p>
                    <h2 className="mt-0.5 text-[17px] font-semibold text-[var(--color-foreground)]">Treasury</h2>
                  </div>
                  <div className="mb-4 grid grid-cols-4 gap-px overflow-hidden rounded-2xl bg-[var(--color-border)] ring-1 ring-[var(--color-border)]">
                    {[
                      { label: 'Total balance', value: '$84,260', sub: 'Across all payment methods' },
                      { label: 'Collected (30d)', value: '$38,400', sub: 'From payment links and invoices' },
                      { label: 'Pending', value: '$5,200', sub: 'Awaiting settlement' },
                      { label: 'Settled (30d)', value: '$31,080', sub: 'To bank accounts' },
                    ].map((s) => (
                      <div key={s.label} className="bg-[var(--color-surface)] px-4 py-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">{s.label}</p>
                        <p className="mt-1.5 text-[20px] font-bold leading-none tracking-[-0.03em] text-[var(--color-foreground)]">{s.value}</p>
                        <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{s.sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
                    <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
                      <div className="border-b border-[var(--color-surface-secondary)] px-4 py-3">
                        <p className="text-[12px] font-semibold text-[var(--color-foreground)]">Recent transactions</p>
                      </div>
                      <div className="divide-y divide-[var(--color-surface-secondary)]">
                        {[
                          { net: '/icons/networks/base.png', name: 'Payment link — Brand sprint', client: 'Acme Corp', amount: '+$1,800', status: 'Settled', color: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]' },
                          { net: '/icons/networks/solana.png', name: 'Invoice — Logo package', client: 'Ola Design', amount: '+$450', status: 'Pending', color: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]' },
                          { net: '/icons/networks/base.png', name: 'Bank payout', client: 'To Primary Account', amount: '-$6,200', status: 'Completed', color: 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]' },
                          { net: '/icons/networks/solana.png', name: 'Invoice — Web redesign', client: 'Zenith Labs', amount: '+$3,200', status: 'Settled', color: 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]' },
                        ].map((tx) => (
                          <div key={tx.name} className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Image src={tx.net} alt="Network" width={18} height={18} className="shrink-0 rounded-full" />
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-semibold text-[var(--color-foreground)]">{tx.name}</p>
                                <p className="text-[10px] text-[var(--color-text-muted)]">{tx.client}</p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <p className={`text-[11px] font-semibold ${tx.amount.startsWith('+') ? 'text-[var(--color-success)]' : 'text-[var(--color-foreground)]'}`}>{tx.amount}</p>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tx.color}`}>{tx.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex-1 overflow-hidden rounded-2xl bg-[var(--color-surface)] p-4 ring-1 ring-[var(--color-border)]">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Available</p>
                        <p className="mt-2 text-[22px] font-bold leading-none tracking-[-0.03em] text-[var(--color-foreground)]">$38,460</p>
                        <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">Ready to withdraw or settle to your bank</p>
                        <div className="mt-3 flex gap-1.5">
                          {['USDC', 'EURC'].map((item) => (
                            <div key={item} className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 py-1">
                              <span className="text-[10px] font-semibold text-[var(--color-text-secondary)]">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] p-4 ring-1 ring-[var(--color-border)]">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Auto-settlement</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
                          <p className="text-[12px] font-semibold text-[var(--color-foreground)]">Active</p>
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">Daily settlement to primary bank account</p>
                      </div>
                    </div>
                  </div>
                </main>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust Bar ─────────────────────────────────────────── */}
      <section className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface)] px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn className="mb-14 text-center">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Trusted by teams worldwide</p>
            <p className="mx-auto max-w-lg text-[15px] leading-7 text-[var(--color-text-muted)]">
              Hedwig is built by people who understand the pain of managing cross-border payments, multiple currencies, and slow bank transfers.
            </p>
          </AnimateIn>

          <div className="grid gap-px overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-border)] md:grid-cols-3">
            {[
              {
                name: 'Tunde A.',
                company: 'Co-founder, Relay',
                quote: 'We pay contractors in six countries. Hedwig replaced spreadsheets, multiple wallets, and weekly bank visits. One balance, one view.',
              },
              {
                name: 'Sarah K.',
                company: 'Operations Lead, Blend Studios',
                quote: 'Our clients are in the US and Europe. Hedwig lets us invoice in seconds and manage everything from one treasury. We stopped juggling five payment tools.',
              },
              {
                name: 'David M.',
                company: 'CTO, Tanda Labs',
                quote: 'The AI assistant handles the tedious stuff — figuring out when to settle, what to flag, and who needs a reminder. It keeps our treasury running without someone watching it full time.',
              },
            ].map((t, i) => (
              <AnimateIn key={t.name} delay={i * 80}>
                <div className="flex h-full flex-col bg-[var(--color-surface)] px-8 py-10">
                  <p className="text-[15px] leading-7 text-[var(--color-text-muted)]">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-5">
                    <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{t.name}</p>
                    <p className="text-[13px] text-[var(--color-text-muted)]">{t.company}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── How Payments Work ──────────────────────────────────── */}
      <section className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface-secondary)] px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn className="mb-14 text-center">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">How it works</p>
            <h2 className="text-[32px] font-bold tracking-[-0.04em] text-[var(--color-foreground)] md:text-[44px]">
              From payment received to funds settled.
            </h2>
          </AnimateIn>
          <div className="grid gap-px overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-border)] md:grid-cols-4">
            {[
              { step: '01', label: 'Create payment links', desc: 'Generate branded payment links or invoices in seconds. Your customers pay from anywhere in the world, in seconds.', accent: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]' },
              { step: '02', label: 'Funds arrive instantly', desc: 'Payments land in your unified treasury within minutes. Track everything — collected, pending, and settled — in real time.', accent: 'bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]' },
              { step: '03', label: 'Manage your treasury', desc: 'View your balance across currencies, convert between them when rates work for you, and control who on your team has access.', accent: 'bg-[var(--color-warning-soft)] text-[var(--color-text-tertiary)]' },
              { step: '04', label: 'Settle on your schedule', desc: 'Auto-settle daily or withdraw on demand to your bank account. No minimums, no holds. Pay a 1% fee only when funds move out.', accent: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]' },
            ].map(({ step, label, desc, accent }, i) => (
              <AnimateIn key={step} delay={i * 80}>
                <div className="flex h-full flex-col bg-[var(--color-surface)] px-8 py-10">
                  <span className={`mb-5 inline-flex w-fit rounded-full px-3 py-1 text-[12px] font-bold ${accent}`}>{step}</span>
                  <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-[var(--color-foreground)]">{label}</h3>
                  <p className="mt-3 text-[14px] leading-7 text-[var(--color-text-muted)]">{desc}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <FeaturesShowcase />

      {/* ── Mobile App ────────────────────────────────────────── */}
      <section id="download" className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface)] px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn>
            <div className="overflow-hidden rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
              <div className="grid md:grid-cols-2">
                <div className="flex flex-col justify-center px-10 py-14 md:px-14">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Mobile companion</p>
                  <h2 className="text-[30px] font-bold tracking-[-0.04em] text-[var(--color-foreground)] md:text-[38px]">
                    Your treasury, in your pocket.
                  </h2>
                  <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--color-text-muted)]">
                    Monitor your balance, track payments, and manage your treasury from anywhere. The same account, the same data — on web and mobile.
                  </p>
                  <div className="mt-9 flex flex-col gap-6">
                    {[
                      {
                        title: 'Real-time balance',
                        desc: 'See your USDC balance, pending payments, and settled funds at a glance.',
                      },
                      {
                        title: 'Payment alerts',
                        desc: 'Get notified the moment funds arrive. No refreshing, no guessing.',
                      },
                      {
                        title: 'Quick actions',
                        desc: 'Settle to your bank, convert currencies, or send payment links — all from your phone.',
                      },
                    ].map((f) => (
                      <div key={f.title}>
                        <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{f.title}</p>
                        <p className="mt-1 text-[14px] leading-7 text-[var(--color-text-muted)]">{f.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <AppStoreButton />
                    <GooglePlayButton />
                  </div>
                </div>

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

      {/* ── Pricing ───────────────────────────────────────────── */}
      <section id="pricing" className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface)] px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn className="mb-14 text-center">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Pricing</p>
            <h2 className="text-[32px] font-bold tracking-[-0.04em] text-[var(--color-foreground)] md:text-[44px]">
              Simple, usage-based pricing
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-7 text-[var(--color-text-muted)]">
              No monthly subscriptions. No hidden fees. You only pay when you move money.
            </p>
          </AnimateIn>

          <AnimateIn>
            <div className="mx-auto max-w-[600px] overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] ring-1 ring-[var(--color-border)]">
              <div className="px-10 py-12 text-center">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Settlement fee</p>
                <p className="mt-4 text-[64px] font-bold tracking-[-0.05em] text-[var(--color-foreground)]">1%</p>
                <p className="mt-2 text-[16px] text-[var(--color-text-muted)]">
                  Only when you settle funds to your bank account.
                </p>
                <div className="mt-10 flex flex-col gap-4 text-left">
                  {[
                    'Collecting payments is always free',
                    'No monthly or annual subscriptions',
                    'No minimum volumes or commitments',
                    'No hidden markups on exchange rates',
                    'Cancel anytime — keep access to your funds',
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" weight="fill" />
                      <span className="text-[14px] text-[var(--color-text-secondary)]">{item}</span>
                    </div>
                  ))}
                </div>

                <a
                  href="/api/auth/exit-demo"
                  className="mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-primary)] px-8 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.22)] transition-all duration-200 hover:bg-[var(--color-primary-dark)]"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" weight="bold" />
                </a>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────── */}
      <section className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface-secondary)] px-8 py-24">
        <div className="mx-auto max-w-[800px]">
          <AnimateIn className="mb-14 text-center">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">FAQs</p>
            <h2 className="text-[32px] font-bold tracking-[-0.04em] text-[var(--color-foreground)] md:text-[44px]">
              Frequently asked questions
            </h2>
          </AnimateIn>
          <div className="flex flex-col gap-4">
            {[
              {
                q: 'How does pricing work?',
                a: 'Creating payment links and invoices is free. There are no monthly subscriptions. You pay a 1% fee only when you settle funds from your Hedwig treasury to your bank account. Exchange rates are market-based with no hidden markup.',
              },
              {
                q: 'How fast do payments arrive?',
                a: 'Payments land in your Hedwig treasury within minutes. Auto-settlement to your bank account runs daily, or you can withdraw on demand. Most bank settlements complete same-day.',
              },
              {
                q: 'Can I collect payments from international customers?',
                a: 'Yes. That is exactly what Hedwig is built for. Your customers can pay from anywhere in the world using a payment link or invoice. You see everything in your unified treasury.',
              },
              {
                q: 'Does Hedwig integrate with my existing tools?',
                a: 'Hedwig connects with Google Workspace for team access. QuickBooks, Slack, and Xero integrations are coming soon. You can also invite team members with role-based access and manage everything from one account.',
              },
              {
                q: 'Which countries can settle to bank accounts?',
                a: 'We currently support settlement in Nigeria, Tanzania, Malawi, Kenya, Uganda, and Brazil. We are adding more countries and currencies regularly.',
              },
              {
                q: 'Can my team use Hedwig too?',
                a: 'Yes. You can invite team members with role-based access. Control who can send payments, view balances, and manage settings — all from one account.',
              },
            ].map((faq, i) => (
              <AnimateIn key={faq.q} delay={i * 60}>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-6">
                  <p className="text-[15px] font-semibold text-[var(--color-foreground)]">{faq.q}</p>
                  <p className="mt-2 text-[14px] leading-7 text-[var(--color-text-muted)]">{faq.a}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface)] px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn>
            <div className="relative overflow-hidden rounded-[32px] bg-[var(--color-foreground)] px-10 py-20 text-center shadow-[0_24px_80px_rgba(24,29,39,0.18)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.35),transparent_55%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(37,99,235,0.20),transparent_55%)]" />
              <div className="relative">
                <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">Get started</p>
                <h2 className="text-[32px] font-bold tracking-[-0.04em] text-white md:text-[48px]">
                  Move money across borders<br className="hidden md:block" /> without the overhead.
                </h2>
                <p className="mx-auto mt-5 max-w-lg text-[15px] leading-7 text-[var(--color-text-placeholder)]">
                  Set up your treasury in minutes. Free to start. No card needed.
                </p>
                <a
                  href="/api/auth/exit-demo"
                  className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-surface)] px-8 text-[14px] font-semibold text-[var(--color-foreground)] transition-all duration-200 hover:bg-[var(--color-accent-soft)] hover:shadow-lg"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" weight="bold" />
                </a>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface)] px-8 py-10">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-5 sm:flex-row">
          <Link href="/">
            <HedwigLogo width={32} height={32} />
          </Link>
          <p className="text-[12px] text-[var(--color-text-muted)]">&copy; {new Date().getFullYear()} Hedwig. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="text-[13px] text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)]">Privacy</Link>
            <Link href="/terms" className="text-[13px] text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)]">Terms</Link>
            <Link href="/returns" className="text-[13px] text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)]">Returns</Link>
            <a href="https://help.hedwigbot.xyz" target="_blank" rel="noreferrer" className="text-[13px] text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)]">Help</a>
            <a href="/api/auth/exit-demo" className="text-[13px] text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)]">Sign in</a>
            <a href="mailto:support@hedwigbot.xyz" className="text-[13px] text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)]">Support</a>
            <a href="https://x.com/hedwigagent" target="_blank" rel="noreferrer" className="text-[13px] text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)]">X</a>
            <a href="https://t.me/hedwigofficial" target="_blank" rel="noreferrer" className="text-[13px] text-[var(--color-text-tertiary)] transition-colors duration-200 hover:text-[var(--color-foreground)]">Telegram</a>
          </div>
        </div>
      </footer>
    </div>
    </ForceLightTheme>
  );
}

/* ── App store buttons ────────────────────────────────────────── */

function AppStoreButton() {
  return (
    <a
      href="https://testflight.apple.com/join/aKXnyjP4"
      target="_blank"
      rel="noreferrer"
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--color-foreground)] bg-[var(--color-foreground)] px-5 transition-all duration-200 hover:bg-[var(--color-foreground)] sm:w-auto"
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
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--color-foreground)] bg-[var(--color-foreground)] px-5 transition-all duration-200 hover:bg-[var(--color-foreground)] sm:w-auto"
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
