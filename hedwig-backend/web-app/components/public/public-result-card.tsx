import Link from 'next/link';
import { CheckCircle, WarningCircle } from '@/components/ui/lucide-icons';

export function PublicResultCard({
  kind,
  title,
  message,
  amountLabel,
  txHash,
  explorerUrl
}: {
  kind: 'success' | 'error';
  title: string;
  message: string;
  amountLabel?: string | null;
  txHash?: string | null;
  explorerUrl?: string | null;
}) {
  const isSuccess = kind === 'success';

  return (
    <div className="mx-auto max-w-md">
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        {/* Colored band */}
        <div className={`h-1.5 w-full ${isSuccess ? 'bg-[#12b76a]' : 'bg-[#f04438]'}`} />

        <div className="px-8 py-8 text-center">
          <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${isSuccess ? 'bg-[#ecfdf3]' : 'bg-[#fef3f2]'}`}>
            {isSuccess ? (
              <CheckCircle className="h-9 w-9 text-[#717680]" weight="fill" />
            ) : (
              <WarningCircle className="h-9 w-9 text-[#717680]" weight="fill" />
            )}
          </div>

          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{title}</h1>

          {amountLabel ? (
            <p className="mt-2 text-[15px] font-semibold text-[#414651]">{amountLabel}</p>
          ) : null}

          <p className="mt-3 text-[13px] leading-relaxed text-[#717680]">{message}</p>

          {txHash ? (
            <div className="mt-4 rounded-2xl border border-[#e9eaeb] bg-[#fafafa] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Transaction ref</p>
              <p className="mt-1 break-all font-mono text-[11px] text-[#717680]">{txHash}</p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col items-center gap-3">
            {explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-full border border-[#d5d7da] bg-white px-5 text-[13px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#fafafa]"
              >
                View on explorer
              </a>
            ) : null}
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-full bg-[#2563eb] px-5 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#1d4ed8]"
            >
              Back to Hedwig
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
