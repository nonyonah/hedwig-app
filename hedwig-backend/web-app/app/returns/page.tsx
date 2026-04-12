export default function ReturnsPage() {
  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto w-full max-w-[980px] px-5 pb-16 pt-14 md:px-8">
        <header className="space-y-3 border-b border-[#e9eaeb] pb-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Legal</p>
          <h1 className="text-[32px] font-bold tracking-[-0.03em] text-[#181d27]">Return Policy</h1>
          <p className="text-[14px] text-[#717680]">Last updated April 12, 2026</p>
          <p className="max-w-[760px] text-[14px] leading-7 text-[#535862]">
            Thank you for your purchase. If you are not completely satisfied, you may request a return in line with the policy below.
          </p>
        </header>

        <div className="mt-10 space-y-10 rounded-2xl border border-[#e9eaeb] bg-white p-6 md:p-8">
          <section id="returns" className="space-y-3">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#181d27]">Returns</h2>
            <p className="text-[14px] leading-7 text-[#535862]">
              Returns must be initiated within seven (7) days of purchase. Items must be new and unused with original tags and labels.
            </p>
          </section>

          <section id="process" className="space-y-3">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#181d27]">Return Process</h2>
            <p className="text-[14px] leading-7 text-[#535862]">
              To request a return, email
              <a className="mx-1 text-[#2563eb] hover:text-[#1d4ed8]" href="mailto:nonso@hedwigbot.xyz">
                nonso@hedwigbot.xyz
              </a>
              to receive an RMA number before shipping.
            </p>
            <div className="rounded-xl border border-[#e9eaeb] bg-[#fcfcfd] p-4 text-[14px] leading-7 text-[#535862]">
              <p><strong>Return address</strong></p>
              <p>Rift Labs</p>
              <p>Attn: Returns</p>
              <p>No 10b press lane achara layout enugu</p>
              <p>Enugu, Enugu 400105, Nigeria</p>
            </div>
          </section>

          <section id="refunds" className="space-y-3">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#181d27]">Refunds</h2>
            <p className="text-[14px] leading-7 text-[#535862]">
              After we receive and inspect your return, processing may take up to seven (7) days. Refunds may take one to two
              billing cycles to appear, depending on your payment provider.
            </p>
          </section>

          <section id="exceptions" className="space-y-3">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#181d27]">Exceptions</h2>
            <p className="text-[14px] leading-7 text-[#535862]">
              For defective or damaged items, contact support to arrange a refund or exchange.
            </p>
          </section>

          <section id="questions" className="space-y-3">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#181d27]">Questions</h2>
            <p className="text-[14px] leading-7 text-[#535862]">
              If you have any questions about this policy, contact
              <a className="mx-1 text-[#2563eb] hover:text-[#1d4ed8]" href="mailto:nonso@hedwigbot.xyz">
                nonso@hedwigbot.xyz
              </a>
              .
            </p>
          </section>
        </div>

        <footer className="mt-8 text-[13px] text-[#717680]">
          This Return Policy was created using Termly&apos;s
          <a
            className="ml-1 text-[#2563eb] hover:text-[#1d4ed8]"
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
