import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { OnboardingBankAccountClient } from './view';

export default async function OnboardingBankAccountPage() {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    redirect('/');
  }

  const existing = await hedwigApi.listBankAccounts({ accessToken: session.accessToken }).catch(() => [] as Awaited<ReturnType<typeof hedwigApi.listBankAccounts>>);

  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      <header className="border-b border-[#e9eaeb] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/hedwig-logo.png" alt="Hedwig" width={28} height={28} priority />
            <span className="text-[14px] font-semibold text-[#181d27]">Hedwig</span>
          </Link>
          <Link href="/dashboard" className="text-[12px] text-[#717680] hover:text-[#414651]">
            Skip for now
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-6 text-center">
          <span className="inline-flex rounded-full bg-[#eff4ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[#2563eb]">
            One last step
          </span>
          <h1 className="mt-3 text-[24px] font-bold tracking-[-0.03em] text-[#181d27]">
            Add your payout bank
          </h1>
          <p className="mt-2 text-[13px] text-[#717680]">
            Clients see this on every invoice and payment link, so they can pay you by bank transfer in addition to crypto.
            You can change this later in Settings.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xs ring-1 ring-[#e9eaeb]">
          <OnboardingBankAccountClient
            accessToken={session.accessToken}
            initial={existing}
          />
        </div>
      </div>
    </main>
  );
}
