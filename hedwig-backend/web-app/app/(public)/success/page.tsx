import Link from 'next/link';
import { CheckCircle, WarningCircle } from '@/components/ui/lucide-icons';
import { PublicDocumentFrame } from '@/components/public/public-document-frame';

export default async function PublicSuccessPage({
  searchParams
}: {
  searchParams: Promise<{ txHash?: string; amount?: string; symbol?: string; status?: string; message?: string }>;
}) {
  const params = await searchParams;
  const isError = params.status === 'failed';

  return (
    <PublicDocumentFrame title={isError ? 'Payment update required' : 'Payment complete'}>
      <div className="mx-auto max-w-md">
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
          {/* Colored band */}
          <div className={`h-1.5 w-full ${isError ? 'bg-[#f04438]' : 'bg-[#12b76a]'}`} />

          <div className="px-8 py-8 text-center">
            <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${isError ? 'bg-[#fef3f2]' : 'bg-[#ecfdf3]'}`}>
              {isError ? (
                <WarningCircle className="h-9 w-9 text-[#717680]" weight="fill" />
              ) : (
                <CheckCircle className="h-9 w-9 text-[#717680]" weight="fill" />
              )}
            </div>

            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">
              {isError ? 'Payment needs attention' : 'Payment successful'}
            </h1>

            {params.amount ? (
              <p className="mt-2 text-[15px] font-semibold text-[#414651]">
                {params.amount} {params.symbol || ''}
              </p>
            ) : null}

            <p className="mt-3 text-[13px] leading-relaxed text-[#717680]">
              {params.message || (isError
                ? 'Your transaction may have been submitted, but Hedwig could not finish updating the payment state automatically.'
                : 'Your payment has been processed successfully.')}
            </p>

            {params.txHash ? (
              <div className="mt-4 rounded-2xl border border-[#e9eaeb] bg-[#fafafa] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Transaction ref</p>
                <p className="mt-1 break-all font-mono text-[11px] text-[#717680]">{params.txHash}</p>
              </div>
            ) : null}

            <div className="mt-6">
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
    </PublicDocumentFrame>
  );
}
