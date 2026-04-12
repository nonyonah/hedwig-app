import type { ReactNode } from 'react';

const TOC = [
  { id: 'infocollect', title: '1. WHAT INFORMATION DO WE COLLECT?' },
  { id: 'infouse', title: '2. HOW DO WE PROCESS YOUR INFORMATION?' },
  { id: 'whoshare', title: '3. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?' },
  { id: 'cookies', title: '4. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?' },
  { id: 'ai', title: '5. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?' },
  { id: 'sociallogins', title: '6. HOW DO WE HANDLE YOUR SOCIAL LOGINS?' },
  { id: 'inforetain', title: '7. HOW LONG DO WE KEEP YOUR INFORMATION?' },
  { id: 'infosafe', title: '8. HOW DO WE KEEP YOUR INFORMATION SAFE?' },
  { id: 'privacyrights', title: '9. WHAT ARE YOUR PRIVACY RIGHTS?' },
  { id: 'dnt', title: '10. CONTROLS FOR DO-NOT-TRACK FEATURES' },
  { id: 'policyupdates', title: '11. DO WE MAKE UPDATES TO THIS NOTICE?' },
  { id: 'contact', title: '12. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?' },
  { id: 'request', title: '13. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?' },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#181d27]">{title}</h2>
      <div className="space-y-3 text-[14px] leading-7 text-[#535862]">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto w-full max-w-[980px] px-5 pb-16 pt-14 md:px-8">
        <header className="space-y-3 border-b border-[#e9eaeb] pb-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Legal</p>
          <h1 className="text-[32px] font-bold tracking-[-0.03em] text-[#181d27]">Privacy Policy</h1>
          <p className="text-[14px] text-[#717680]">Last updated April 02, 2026</p>
          <p className="max-w-[760px] text-[14px] leading-7 text-[#535862]">
            This Privacy Notice for <strong>Rift Labs</strong> (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) explains how we access,
            collect, store, use, and share your personal information when you use Hedwig services, including
            <a className="mx-1 text-[#2563eb] hover:text-[#1d4ed8]" href="https://www.hedwigbot.xyz" target="_blank" rel="noopener noreferrer">
              www.hedwigbot.xyz
            </a>
            and the Hedwig mobile application.
          </p>
          <p className="text-[14px] leading-7 text-[#535862]">
            Questions or concerns? Contact us at
            <a className="mx-1 text-[#2563eb] hover:text-[#1d4ed8]" href="mailto:nonyonah@gmail.com">
              nonyonah@gmail.com
            </a>
            .
          </p>
        </header>

        <section className="mt-10 space-y-3 rounded-2xl border border-[#e9eaeb] bg-white p-6">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#181d27]">Summary Of Key Points</h2>
          <ul className="list-disc space-y-2 pl-5 text-[14px] leading-7 text-[#535862]">
            <li>We collect personal information you provide directly to us, including names and email addresses.</li>
            <li>We do not process sensitive personal information.</li>
            <li>We may process personal data to provide services, maintain accounts, secure our platform, and comply with law.</li>
            <li>We may share information with affiliates, business partners, and service providers where needed.</li>
            <li>You can submit a data subject request to review, update, or delete your personal data.</li>
          </ul>
        </section>

        <section className="mt-8 space-y-2 rounded-2xl border border-[#e9eaeb] bg-white p-6">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#181d27]">Table Of Contents</h2>
          <div className="flex flex-col gap-1">
            {TOC.map((entry) => (
              <a
                key={entry.id}
                href={`#${entry.id}`}
                className="text-[14px] text-[#2563eb] hover:text-[#1d4ed8]"
              >
                {entry.title}
              </a>
            ))}
          </div>
        </section>

        <div className="mt-10 space-y-10 rounded-2xl border border-[#e9eaeb] bg-white p-6 md:p-8">
          <Section id="infocollect" title="1. WHAT INFORMATION DO WE COLLECT?">
            <h3 className="text-[16px] font-semibold text-[#181d27]">Personal information you disclose to us</h3>
            <p>We collect personal information that you voluntarily provide when you register on our services, request support, or contact us directly.</p>
            <p>The information we collect may include names and email addresses.</p>
            <p>We do not process sensitive personal information.</p>
            <p>
              If you register with social login providers, we may receive certain profile information from the provider,
              such as your name and email address.
            </p>
            <p>
              If you use our mobile application, we may request access to device features like calendar and notifications
              so features work as expected.
            </p>
          </Section>

          <Section id="infouse" title="2. HOW DO WE PROCESS YOUR INFORMATION?">
            <p>We process personal information to create and manage accounts, provide requested services, and respond to support inquiries.</p>
            <p>We also process data for security, fraud prevention, legal compliance, and service communications.</p>
            <p>Where required, we process information for marketing only in line with your communication preferences.</p>
          </Section>

          <Section id="whoshare" title="3. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?">
            <p>We may share information in limited and necessary situations, including business transfers and corporate reorganizations.</p>
            <p>We may share information with affiliates and business partners when required to provide or improve services.</p>
          </Section>

          <Section id="cookies" title="4. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?">
            <p>Yes. We use cookies and similar technologies to support core site functionality, security, analytics, and reliability.</p>
            <p>
              Third-party providers may use tracking technologies for analytics and service optimization based on your settings
              and applicable laws.
            </p>
          </Section>

          <Section id="ai" title="5. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?">
            <p>Yes. Hedwig includes AI features such as AI bots and AI insights.</p>
            <p>
              We may use third-party AI providers, including Google Cloud AI, to process relevant inputs and outputs needed
              to deliver these features.
            </p>
          </Section>

          <Section id="sociallogins" title="6. HOW DO WE HANDLE YOUR SOCIAL LOGINS?">
            <p>If you log in using a third-party social account, we may receive profile information from that provider.</p>
            <p>We use that information only for account authentication and service access as described in this notice.</p>
          </Section>

          <Section id="inforetain" title="7. HOW LONG DO WE KEEP YOUR INFORMATION?">
            <p>We keep information only as long as needed for the purposes in this notice, unless longer retention is required by law.</p>
            <p>When data is no longer needed, we delete or anonymize it where feasible.</p>
          </Section>

          <Section id="infosafe" title="8. HOW DO WE KEEP YOUR INFORMATION SAFE?">
            <p>We apply appropriate technical and organizational security measures to protect personal information.</p>
            <p>
              No internet transmission or storage system can be guaranteed fully secure, and you should use services in secure
              environments whenever possible.
            </p>
          </Section>

          <Section id="privacyrights" title="9. WHAT ARE YOUR PRIVACY RIGHTS?">
            <p>Depending on your location, you may have rights to access, correct, delete, or restrict processing of your personal data.</p>
            <p>You may also withdraw consent where consent is the legal basis for processing.</p>
          </Section>

          <Section id="dnt" title="10. CONTROLS FOR DO-NOT-TRACK FEATURES">
            <p>
              Most browsers include a Do-Not-Track feature. Because there is no uniform standard, we do not currently respond
              to DNT signals automatically.
            </p>
          </Section>

          <Section id="policyupdates" title="11. DO WE MAKE UPDATES TO THIS NOTICE?">
            <p>Yes. We may update this Privacy Notice to reflect legal, operational, or product changes.</p>
            <p>When updated, we revise the date at the top of this page.</p>
          </Section>

          <Section id="contact" title="12. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?">
            <p>
              Email:
              <a className="mx-1 text-[#2563eb] hover:text-[#1d4ed8]" href="mailto:nonso@hedwigbot.xyz">
                nonso@hedwigbot.xyz
              </a>
            </p>
            <p>Rift Labs, No 10b Press Lane Achara Layout, Enugu, Enugu 400105, Nigeria</p>
          </Section>

          <Section id="request" title="13. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?">
            <p>
              To submit a data access, update, or deletion request, use our form:
              <a
                className="mx-1 text-[#2563eb] hover:text-[#1d4ed8]"
                href="https://app.termly.io/dsar/8b850757-c4c8-4c8c-8ea2-1b460a42c38d"
                target="_blank"
                rel="noopener noreferrer"
              >
                data subject access request
              </a>
              .
            </p>
          </Section>
        </div>

        <footer className="mt-8 text-[13px] text-[#717680]">
          This Privacy Policy was created using Termly&apos;s
          <a
            className="ml-1 text-[#2563eb] hover:text-[#1d4ed8]"
            href="https://termly.io/products/privacy-policy-generator/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy Generator
          </a>
          .
        </footer>
      </div>
    </main>
  );
}
