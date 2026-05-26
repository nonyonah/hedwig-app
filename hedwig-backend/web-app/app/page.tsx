import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight } from '@/components/ui/lucide-icons';
import { getCurrentSession } from '@/lib/auth/session';
import { FeaturesShowcase } from './features-showcase';
import { AnimateIn } from './animate-in';

export default async function IndexPage() {
  const session = await getCurrentSession();
  if (session.accessToken && !session.isMockSession) {
    redirect('/dashboard');
  }
  return <LandingPage />;
}

/* ─────────────────────────────────────────────────────────────── */

const NAV_GROUPS = [
  { label: 'Overview', items: ['Dashboard', 'Insights', 'Calendar'] },
  { label: 'Workspace', items: ['Clients', 'Projects', 'Contracts'] },
  { label: 'Money', items: ['Payments'] },
];

/* ─────────────────────────────────────────────────────────────── */

function LandingPage() {
  const showRemoteProductHuntBadge = process.env.NODE_ENV !== 'development';

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
              href="/sign-in"
              className="text-[13px] font-semibold text-[#717680] transition-colors duration-200 hover:text-[#181d27]"
            >
              Sign in
            </Link>
            <a
              href="/api/auth/exit-demo"
              className="inline-flex h-9 items-center justify-center rounded-full bg-[#2563eb] px-5 text-[13px] font-semibold text-white transition-all duration-200 hover:bg-[#1d4ed8]"
            >
              Try it free
            </a>
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
                Freelance invoicing and payments, built for Africa and beyond
              </span>
            </div>
            <h1
              className="animate-fade-up text-[52px] font-bold leading-[0.97] tracking-[-0.055em] text-[#181d27] md:text-[68px] lg:text-[80px]"
              style={{ animationDelay: '80ms' }}
            >
              Invoice your clients. Get Paid. Convert when you need to
            </h1>
            <p
              className="animate-fade-up mx-auto mt-6 max-w-xl text-[17px] leading-[1.75] text-[#667085]"
              style={{ animationDelay: '160ms' }}
            >
              Hedwig is the financial workspace for freelancers in Nigeria and everywhere else. Create invoices, collect USDC payments, and withdraw to your local bank — all in one place.
            </p>
            <p
              className="animate-fade-up mt-4 text-[13px] font-medium text-[#667085]"
              style={{ animationDelay: '200ms' }}
            >
              Used by freelancers across Africa, Europe, and the Americas.
            </p>
            <div
              className="animate-fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: '240ms' }}
            >
              <a
                href="/api/auth/exit-demo"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#2563eb] px-8 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.22)] transition-all duration-200 hover:bg-[#1d4ed8] hover:shadow-[0_12px_32px_rgba(37,99,235,0.32)]"
              >
                Try it free
                <ArrowRight className="h-4 w-4" weight="bold" />
              </a>
              <a
                href="/api/auth/demo"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d5d7da] bg-white px-8 text-[14px] font-semibold text-[#181d27] transition-all duration-200 hover:bg-[#f8f9fb]"
              >
                See how it works
              </a>
            </div>
            <p
              className="animate-fade-up mt-3 text-[12px] font-medium text-[#a4a7ae]"
              style={{ animationDelay: '280ms' }}
            >
              No card required. First invoice in under 2 minutes.
            </p>

            {/* Product Hunt badge */}
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1138206&theme=neutral&t=1777895408783"
                    alt="Hedwig - The fastest way for freelancers to get paid. | Product Hunt"
                    width={250}
                    height={54}
                  />
                </a>
              </div>
            ) : null}
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
                      { label: 'Collected', value: '$12,480', sub: 'Paid invoices and links' },
                      { label: 'Payment rate', value: '94%', sub: '17 of 18 requests paid' },
                      { label: 'Still owed', value: '$3,200', sub: '2 clients to follow up' },
                      { label: 'Active clients', value: '6', sub: '3 projects in progress' },
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
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Earnings</p>
                        <p className="mt-2 text-[22px] font-bold leading-none tracking-[-0.03em] text-[#181d27]">$8,240</p>
                        <p className="mt-1 text-[10px] text-[#717680]">Paid via invoices and payment links</p>
                        <div className="mt-3 flex gap-1.5">
                          {['Invoices', 'Payment links'].map((item) => (
                            <div key={item} className="flex items-center gap-1 rounded-full border border-[#e9eaeb] bg-[#f9fafb] px-2 py-1">
                              <span className="text-[10px] font-semibold text-[#344054]">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-2xl bg-white p-4 ring-1 ring-[#e9eaeb]">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Subscription</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#17b26a]" />
                          <p className="text-[12px] font-semibold text-[#181d27]">Pro plan active</p>
                        </div>
                        <p className="mt-1 text-[10px] text-[#717680]">Billing synced across web and mobile</p>
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
      <section className="border-t border-[#f1f2f4] bg-white px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn className="mb-14 text-center">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a4a7ae]">Trusted by freelancers worldwide</p>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              {[
                { value: '12,000+', label: 'Active freelancers' },
                { value: '$4.2M+', label: 'Invoices sent' },
                { value: '30+', label: 'Countries' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-[36px] font-bold tracking-[-0.03em] text-[#181d27]">{stat.value}</p>
                  <p className="text-[13px] text-[#667085]">{stat.label}</p>
                </div>
              ))}
            </div>
          </AnimateIn>

          <div className="grid gap-px overflow-hidden rounded-[28px] border border-[#e9eaeb] bg-[#e9eaeb] md:grid-cols-3">
            {[
              {
                name: 'Chinedu O.',
                city: 'Lagos',
                quote: 'I used to explain international bank transfers to clients in London. Now I send a Hedwig invoice, they pay in USDC, and I convert to naira the same day.',
              },
              {
                name: 'Ama K.',
                city: 'Accra',
                quote: 'The wallet changed everything. My money lives in one place — not scattered across apps, exchanges, and spreadsheets.',
              },
              {
                name: 'Marco B.',
                city: 'Lisbon',
                quote: 'I hire designers in Nigeria and Kenya. Hedwig makes it feel local for them and dead simple for me.',
              },
            ].map((t, i) => (
              <AnimateIn key={t.name} delay={i * 80}>
                <div className="flex h-full flex-col bg-white px-8 py-10">
                  <p className="text-[15px] leading-7 text-[#667085]">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-5">
                    <p className="text-[14px] font-semibold text-[#181d27]">{t.name}</p>
                    <p className="text-[13px] text-[#a4a7ae]">{t.city}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Payment Flow ──────────────────────────────────────── */}
      <section className="border-t border-[#f1f2f4] bg-[#f8f9fb] px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn className="mb-14 text-center">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a4a7ae]">How you get paid</p>
            <h2 className="text-[32px] font-bold tracking-[-0.04em] text-[#181d27] md:text-[44px]">
              From invoice sent to money in your bank.
            </h2>
          </AnimateIn>
          <div className="grid gap-px overflow-hidden rounded-[28px] border border-[#e9eaeb] bg-[#e9eaeb] md:grid-cols-4">
            {[
              { step: '01', label: 'Send the invoice', desc: 'Create a professional invoice with a built-in payment link. Your client gets a clean, branded bill they can pay in seconds.', accent: 'bg-[#eff4ff] text-[#717680]' },
              { step: '02', label: 'Client pays', desc: 'They pay in USDC from any wallet, anywhere in the world. No routing numbers, no currency confusion.', accent: 'bg-[#ecfdf3] text-[#717680]' },
              { step: '03', label: 'Funds land', desc: 'Money hits your Hedwig wallet in minutes. Not days. No middlemen holding your cash.', accent: 'bg-[#fffaeb] text-[#717680]' },
              { step: '04', label: 'You decide', desc: 'Convert to naira, cedis, or your local currency. Or hold USDC and spend it later. You control the timing.', accent: 'bg-[#f4f3ff] text-[#717680]' },
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

      {/* ── Wallet ────────────────────────────────────────────── */}
      <section id="download" className="border-t border-[#f1f2f4] bg-white px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn>
            <div className="overflow-hidden rounded-[32px] border border-[#e9eaeb] bg-[#f8f9fb]">
              <div className="grid md:grid-cols-2">
                {/* Text side */}
                <div className="flex flex-col justify-center px-10 py-14 md:px-14">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a4a7ae]">Your wallet</p>
                  <h2 className="text-[30px] font-bold tracking-[-0.04em] text-[#181d27] md:text-[38px]">
                    Your payments don&apos;t just arrive — they land in your wallet.
                  </h2>
                  <p className="mt-4 max-w-sm text-[15px] leading-7 text-[#667085]">
                    No more checking five apps to see if you got paid. Your Hedwig wallet holds your USDC balance, tracks your earnings, and moves money to your bank when you&apos;re ready.
                  </p>
                  <div className="mt-9 flex flex-col gap-6">
                    {[
                      {
                        title: 'Your balance, visible',
                        desc: 'See exactly what you\'ve earned, what\'s pending, and what\'s available to withdraw. In USDC and your local currency.',
                      },
                      {
                        title: 'Convert on your terms',
                        desc: 'Swap USDC to naira, cedis, or another currency when the rate works for you. Not when a platform decides.',
                      },
                      {
                        title: 'Withdraw to your bank',
                        desc: 'Cash out straight to your local bank account. No hidden routing, no third-party forms.',
                      },
                    ].map((f) => (
                      <div key={f.title}>
                        <p className="text-[14px] font-semibold text-[#181d27]">{f.title}</p>
                        <p className="mt-1 text-[14px] leading-7 text-[#667085]">{f.desc}</p>
                      </div>
                    ))}
                  </div>
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

      {/* ── USDC Explainer ────────────────────────────────────── */}
      <section className="bg-white px-8 pb-16">
        <div className="mx-auto max-w-2xl rounded-[20px] bg-[#eff4ff] px-8 py-6 text-center">
          <p className="text-[17px] font-medium text-[#181d27]">
            <span className="font-semibold">USDC is a digital dollar.</span> It lands in your wallet. You convert it to naira, cedis, or whatever you need.
          </p>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <FeaturesShowcase />

      {/* ── How it works ──────────────────────────────────────── */}
      <section id="how-it-works" className="border-t border-[#f1f2f4] bg-[#f8f9fb] px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn className="mb-14 text-center">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a4a7ae]">How it works</p>
            <h2 className="text-[32px] font-bold tracking-[-0.04em] text-[#181d27] md:text-[44px]">
              From agreement to payout,<br className="hidden md:block" /> without the mess.
            </h2>
          </AnimateIn>
          <div className="grid gap-px overflow-hidden rounded-[28px] border border-[#e9eaeb] bg-[#e9eaeb] md:grid-cols-3">
            {[
              { step: '01', label: 'Set up in 2 minutes', desc: 'Create your account, connect your bank details, and you are ready to bill. No paperwork, no waiting period.', accent: 'bg-[#eff4ff] text-[#717680]' },
              { step: '02', label: 'Send an invoice, get paid in hours', desc: 'Build an invoice with your branding, send it to any client anywhere, and receive USDC directly into your Hedwig wallet — usually within minutes.', accent: 'bg-[#ecfdf3] text-[#717680]' },
              { step: '03', label: 'Convert or cash out same-day', desc: 'Withdraw to your local bank account or hold USDC in your wallet. You control the timing, and most withdrawals settle same day.', accent: 'bg-[#fffaeb] text-[#717680]' },
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

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="border-t border-[#f1f2f4] px-8 py-24">
        <div className="mx-auto max-w-[1400px]">
          <AnimateIn>
            <div className="relative overflow-hidden rounded-[32px] bg-[#181d27] px-10 py-20 text-center shadow-[0_24px_80px_rgba(24,29,39,0.18)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.35),transparent_55%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(37,99,235,0.20),transparent_55%)]" />
              <div className="relative">
                <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#717680]">Try it now</p>
                <h2 className="text-[32px] font-bold tracking-[-0.04em] text-white md:text-[48px]">
                  Send your first invoice.<br className="hidden md:block" /> Watch the money land.
                </h2>
                <p className="mx-auto mt-5 max-w-lg text-[15px] leading-7 text-[#94a3b8]">
                  Join freelancers who have stopped chasing payments and started getting paid. Free to start. No card needed.
                </p>
                <a
                  href="/api/auth/exit-demo"
                  className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-white px-8 text-[14px] font-semibold text-[#181d27] transition-all duration-200 hover:bg-[#f1f5ff] hover:shadow-lg"
                >
                  Try it free
                  <ArrowRight className="h-4 w-4" weight="bold" />
                </a>
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
          <p className="text-[12px] text-[#a4a7ae]">&copy; {new Date().getFullYear()} Hedwig. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Privacy</Link>
            <Link href="/terms" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Terms</Link>
            <Link href="/returns" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Returns</Link>
            <a href="https://help.hedwigbot.xyz" target="_blank" rel="noreferrer" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Help</a>
            <a href="/api/auth/exit-demo" className="text-[13px] text-[#717680] transition-colors duration-200 hover:text-[#181d27]">Sign in</a>
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
