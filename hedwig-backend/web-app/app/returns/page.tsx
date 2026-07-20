export default function ReturnsPage() {
 return (
 <main className="min-h-screen bg-[var(--color-background)]">
 <div className="mx-auto w-full max-w-[980px] px-5 pb-16 pt-14 md:px-8">
 <header className="space-y-3 border-b border-[var(--color-border)] pb-8">
 <p className="text-[12px] font-semibold text-[var(--color-text-muted)]">Legal</p>
 <h1 className="text-[32px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">Return Policy</h1>
 <p className="text-[14px] text-[var(--color-text-tertiary)]">Last updated April 12, 2026</p>
 <p className="max-w-[760px] text-[14px] leading-7 text-[var(--color-text-secondary)]">
 Thank you for your purchase. If you are not completely satisfied, you may request a return in line with the policy below.
 </p>
 </header>

 <div className="mt-10 space-y-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 md:p-8">
 <section id="returns" className="space-y-3">
 <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">Returns</h2>
 <p className="text-[14px] leading-7 text-[var(--color-text-secondary)]">
 Returns must be initiated within seven (7) days of purchase. Items must be new and unused with original tags and labels.
 </p>
 </section>

 <section id="process" className="space-y-3">
 <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">Return Process</h2>
 <p className="text-[14px] leading-7 text-[var(--color-text-secondary)]">
 To request a return, email
 <a className="mx-1 text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]" href="mailto:nonso@hedwig.riftlabs.xyz">
 nonso@hedwig.riftlabs.xyz
 </a>
 to receive an RMA number before shipping.
 </p>
 <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-[14px] leading-7 text-[var(--color-text-secondary)]">
 <p><strong>Return address</strong></p>
 <p>Rift Labs</p>
 <p>Attn: Returns</p>
 <p>No 10b press lane achara layout enugu</p>
 <p>Enugu, Enugu 400105, Nigeria</p>
 </div>
 </section>

 <section id="refunds" className="space-y-3">
 <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">Refunds</h2>
 <p className="text-[14px] leading-7 text-[var(--color-text-secondary)]">
 After we receive and inspect your return, processing may take up to seven (7) days. Refunds may take one to two
 billing cycles to appear, depending on your payment provider.
 </p>
 </section>

 <section id="exceptions" className="space-y-3">
 <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">Exceptions</h2>
 <p className="text-[14px] leading-7 text-[var(--color-text-secondary)]">
 For defective or damaged items, contact support to arrange a refund or exchange.
 </p>
 </section>

 <section id="questions" className="space-y-3">
 <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">Questions</h2>
 <p className="text-[14px] leading-7 text-[var(--color-text-secondary)]">
 If you have any questions about this policy, contact
 <a className="mx-1 text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]" href="mailto:nonso@hedwig.riftlabs.xyz">
 nonso@hedwig.riftlabs.xyz
 </a>
 .
 </p>
 </section>
 </div>

 <footer className="mt-8 text-[13px] text-[var(--color-text-tertiary)]">
 This Return Policy was created using Termly&apos;s
 <a
 className="ml-1 text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
 href="https://termly.io/products/refund-return-policy-generator/"
 target="_blank"
 rel="noopener noreferrer"
 >
 Return and Refund Policy Generator
 </a>
 .
 </footer>
 </div>
 </main>
 );
}
