import type { ReactNode } from 'react';

const TOC = [
  { id: 'services', title: '1. OUR SERVICES' },
  { id: 'ip', title: '2. INTELLECTUAL PROPERTY RIGHTS' },
  { id: 'userreps', title: '3. USER REPRESENTATIONS' },
  { id: 'userreg', title: '4. USER REGISTRATION' },
  { id: 'purchases', title: '5. PURCHASES AND PAYMENT' },
  { id: 'subscriptions', title: '6. SUBSCRIPTIONS' },
  { id: 'prohibited', title: '7. PROHIBITED ACTIVITIES' },
  { id: 'ugc', title: '8. USER GENERATED CONTRIBUTIONS' },
  { id: 'license', title: '9. CONTRIBUTION LICENSE' },
  { id: 'mobile', title: '10. MOBILE APPLICATION LICENSE' },
  { id: 'management', title: '11. SERVICES MANAGEMENT' },
  { id: 'privacy', title: '12. PRIVACY POLICY' },
  { id: 'term', title: '13. TERM AND TERMINATION' },
  { id: 'modifications', title: '14. MODIFICATIONS AND INTERRUPTIONS' },
  { id: 'law', title: '15. GOVERNING LAW' },
  { id: 'disputes', title: '16. DISPUTE RESOLUTION' },
  { id: 'corrections', title: '17. CORRECTIONS' },
  { id: 'disclaimer', title: '18. DISCLAIMER' },
  { id: 'liability', title: '19. LIMITATIONS OF LIABILITY' },
  { id: 'indemnification', title: '20. INDEMNIFICATION' },
  { id: 'userdata', title: '21. USER DATA' },
  { id: 'electronic', title: '22. ELECTRONIC COMMUNICATIONS, TRANSACTIONS, AND SIGNATURES' },
  { id: 'california', title: '23. CALIFORNIA USERS AND RESIDENTS' },
  { id: 'misc', title: '24. MISCELLANEOUS' },
  { id: 'contact', title: '25. CONTACT US' },
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

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto w-full max-w-[980px] px-5 pb-16 pt-14 md:px-8">
        <header className="space-y-3 border-b border-[#e9eaeb] pb-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Legal</p>
          <h1 className="text-[32px] font-bold tracking-[-0.03em] text-[#181d27]">Terms Of Service</h1>
          <p className="text-[14px] text-[#717680]">Last updated April 12, 2026</p>
          <p className="text-[14px] leading-7 text-[#535862]">
            These Legal Terms form a legally binding agreement between you and <strong>Rift Labs LTD</strong> concerning your use
            of Hedwig web and mobile services.
          </p>
          <p className="text-[14px] leading-7 text-[#535862]">
            Company details: Rift Labs LTD, No 10b press lane achara layout enugu, Enugu, Enugu 400105, Nigeria.
          </p>
          <p className="text-[14px] leading-7 text-[#535862]">
            Contact:
            <a className="mx-1 text-[#2563eb] hover:text-[#1d4ed8]" href="mailto:nonso@hedwigbot.xyz">
              nonso@hedwigbot.xyz
            </a>
            · 09114109308
          </p>
          <p className="text-[14px] leading-7 text-[#535862]">
            The Services are intended for users who are at least 18 years old. If you do not agree with these terms,
            you must discontinue use immediately.
          </p>
        </header>

        <section className="mt-8 space-y-2 rounded-2xl border border-[#e9eaeb] bg-white p-6">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#181d27]">Table Of Contents</h2>
          <div className="flex flex-col gap-1">
            {TOC.map((entry) => (
              <a key={entry.id} href={`#${entry.id}`} className="text-[14px] text-[#2563eb] hover:text-[#1d4ed8]">
                {entry.title}
              </a>
            ))}
          </div>
        </section>

        <div className="mt-10 space-y-10 rounded-2xl border border-[#e9eaeb] bg-white p-6 md:p-8">
          <Section id="services" title="1. OUR SERVICES">
            <p>
              We operate the website
              <a className="mx-1 text-[#2563eb] hover:text-[#1d4ed8]" href="https://www.hedwigbot.xyz" target="_blank" rel="noopener noreferrer">
                www.hedwigbot.xyz
              </a>
              and the Hedwig mobile app, plus related services.
            </p>
            <p>
              Hedwig enables freelancers and small businesses to manage clients, projects, contracts, invoicing, and payments.
              Use of the Services in prohibited jurisdictions is not allowed.
            </p>
          </Section>

          <Section id="ip" title="2. INTELLECTUAL PROPERTY RIGHTS">
            <h3 className="text-[16px] font-semibold text-[#181d27]">Our intellectual property</h3>
            <p>
              We own or license all intellectual property in the Services, including code, designs, databases, text, graphics,
              and trademarks. Content is protected by copyright and trademark law.
            </p>
            <h3 className="text-[16px] font-semibold text-[#181d27]">Your use of our Services</h3>
            <p>
              Subject to these terms, we grant a limited, revocable, non-exclusive, non-transferable license to access and use
              the Services for internal business or personal non-commercial use.
            </p>
            <p>
              You may not copy, distribute, republish, sell, or exploit Service content for commercial use without prior written permission.
            </p>
          </Section>

          <Section id="userreps" title="3. USER REPRESENTATIONS">
            <p>By using the Services, you represent that the registration information you submit is true, accurate, current, and complete.</p>
            <p>You agree to keep your account information updated and to use Services in compliance with applicable law.</p>
            <p>You will not use bots, scripts, or non-human methods to access the Services.</p>
          </Section>

          <Section id="userreg" title="4. USER REGISTRATION">
            <p>You may be required to create an account. You are responsible for account security and all activities under your credentials.</p>
            <p>We reserve the right to remove or change usernames that are inappropriate, obscene, or otherwise objectionable.</p>
          </Section>

          <Section id="purchases" title="5. PURCHASES AND PAYMENT">
            <p>Accepted methods include Visa and Mastercard. Prices and charges are billed in US dollars unless stated otherwise.</p>
            <p>
              You agree to provide complete and current payment details and authorize charges for purchases, taxes, and recurring fees.
            </p>
            <p>We reserve the right to refuse, limit, or cancel orders at our discretion, including suspected reseller activity.</p>
          </Section>

          <Section id="subscriptions" title="6. SUBSCRIPTIONS">
            <h3 className="text-[16px] font-semibold text-[#181d27]">Billing and renewal</h3>
            <p>Subscriptions renew automatically unless canceled. Billing cadence depends on your selected plan.</p>
            <h3 className="text-[16px] font-semibold text-[#181d27]">Free trial</h3>
            <p>We offer a 14-day free trial for eligible new users. At the end of trial, selected subscription charges apply.</p>
            <h3 className="text-[16px] font-semibold text-[#181d27]">Cancellation and fee changes</h3>
            <p>
              You can cancel from your account settings. Cancellation takes effect at end of current paid term.
              We may adjust subscription fees and will notify you in line with applicable law.
            </p>
          </Section>

          <Section id="prohibited" title="7. PROHIBITED ACTIVITIES">
            <p>You may not use Services for unlawful or abusive conduct, including fraud, credential abuse, malware, scraping, reverse engineering, or harassment.</p>
            <p>You may not attempt to bypass security controls or use Services to compete with Hedwig by extracting content or functionality.</p>
          </Section>

          <Section id="ugc" title="8. USER GENERATED CONTRIBUTIONS">
            <p>
              If you submit contributions, you are responsible for ensuring they do not infringe third-party rights and do not violate law.
            </p>
            <p>
              Contributions must not be false, misleading, defamatory, obscene, abusive, discriminatory, or unlawful.
            </p>
          </Section>

          <Section id="license" title="9. CONTRIBUTION LICENSE">
            <p>
              You grant us rights to access, store, process, and use submitted information and feedback as needed to operate and improve Services,
              consistent with your settings and our Privacy Policy.
            </p>
          </Section>

          <Section id="mobile" title="10. MOBILE APPLICATION LICENSE">
            <p>
              Mobile app usage is subject to a limited, revocable, non-transferable license. You must comply with Apple App Store
              and Google Play platform rules where applicable.
            </p>
          </Section>

          <Section id="management" title="11. SERVICES MANAGEMENT">
            <p>We may monitor Services for abuse, enforce these terms, remove harmful content, and limit access to protect platform integrity.</p>
          </Section>

          <Section id="privacy" title="12. PRIVACY POLICY">
            <p>
              Your use of Services is governed by our
              <a className="mx-1 text-[#2563eb] hover:text-[#1d4ed8]" href="/privacy">Privacy Policy</a>,
              which is incorporated into these terms.
            </p>
          </Section>

          <Section id="term" title="13. TERM AND TERMINATION">
            <p>These terms remain effective while you use Services. We may suspend or terminate access for any breach of these terms or law.</p>
            <p>We may deny future access, including new account creation, where misuse or violations are identified.</p>
          </Section>

          <Section id="modifications" title="14. MODIFICATIONS AND INTERRUPTIONS">
            <p>We may modify, suspend, or discontinue Services or features at any time without prior notice.</p>
            <p>We do not guarantee uninterrupted availability and are not liable for downtime-related loss or inconvenience.</p>
          </Section>

          <Section id="law" title="15. GOVERNING LAW">
            <p>These terms are governed by the laws of Nigeria. Courts in Nigeria have jurisdiction unless otherwise required by applicable law.</p>
          </Section>

          <Section id="disputes" title="16. DISPUTE RESOLUTION">
            <p>
              Disputes may be referred to arbitration as set out in these terms. Class actions and representative actions are excluded where permitted.
            </p>
            <p>Certain claims such as intellectual property or injunctive relief may proceed in court.</p>
          </Section>

          <Section id="corrections" title="17. CORRECTIONS">
            <p>Services may contain errors or omissions. We reserve the right to correct information at any time without notice.</p>
          </Section>

          <Section id="disclaimer" title="18. DISCLAIMER">
            <p>
              SERVICES ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; TO THE MAXIMUM EXTENT PERMITTED BY LAW,
              WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED.
            </p>
          </Section>

          <Section id="liability" title="19. LIMITATIONS OF LIABILITY">
            <p>
              TO THE FULLEST EXTENT PERMITTED BY LAW, WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
              OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS OR DATA.
            </p>
          </Section>

          <Section id="indemnification" title="20. INDEMNIFICATION">
            <p>
              You agree to defend, indemnify, and hold harmless Rift Labs LTD and affiliates from third-party claims arising from your use
              of Services, your content, or your breach of these terms.
            </p>
          </Section>

          <Section id="userdata" title="21. USER DATA">
            <p>
              We keep data needed to provide Services and perform backups, but you remain responsible for data transmitted through your account.
            </p>
          </Section>

          <Section id="electronic" title="22. ELECTRONIC COMMUNICATIONS, TRANSACTIONS, AND SIGNATURES">
            <p>
              You consent to electronic communications, records, notices, signatures, and contracts and agree these satisfy writing requirements.
            </p>
          </Section>

          <Section id="california" title="23. CALIFORNIA USERS AND RESIDENTS">
            <p>
              California complaints may be directed to the Complaint Assistance Unit, Division of Consumer Services,
              California Department of Consumer Affairs.
            </p>
          </Section>

          <Section id="misc" title="24. MISCELLANEOUS">
            <p>These terms, together with posted policies, are the full agreement between you and us regarding Services.</p>
            <p>
              If any provision is invalid, remaining provisions remain in effect. Our failure to enforce any provision is not a waiver.
            </p>
          </Section>

          <Section id="contact" title="25. CONTACT US">
            <p><strong>Rift Labs LTD</strong></p>
            <p>No 10b press lane achara layout enugu, Enugu, Enugu 400105, Nigeria</p>
            <p>Phone: 09114109308</p>
            <p>
              Email:
              <a className="mx-1 text-[#2563eb] hover:text-[#1d4ed8]" href="mailto:nonso@hedwigbot.xyz">
                nonso@hedwigbot.xyz
              </a>
            </p>
          </Section>
        </div>

        <footer className="mt-8 text-[13px] text-[#717680]">
          This Terms and Conditions was created using Termly&apos;s
          <a
            className="ml-1 text-[#2563eb] hover:text-[#1d4ed8]"
            href="https://termly.io/products/terms-and-conditions-generator/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms and Conditions Generator
          </a>
          .
        </footer>
      </div>
    </main>
  );
}
