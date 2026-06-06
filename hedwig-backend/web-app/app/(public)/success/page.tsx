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
        <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
          {/* Colored band */}
          <div className={`h-1.5 w-full ${isError ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-success)]'}`} />

          <div className="px-8 py-8 text-center">
            <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${isError ? 'bg-[var(--color-danger-soft)]' : 'bg-[var(--color-success-soft)]'}`}>
              {isError ? (
                <WarningCircle className="h-9 w-9 text-[var(--color-text-tertiary)]" weight="fill" />
              ) : (
                <CheckCircle className="h-9 w-9 text-[var(--color-text-tertiary)]" weight="fill" />
              )}
            </div>

            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">
              {isError ? 'Payment needs attention' : 'Payment successful'}
            </h1>

            {params.amount ? (
              <p className="mt-2 text-[15px] font-semibold text-[var(--color-text-secondary)]">
                {params.amount} {params.symbol || ''}
              </p>
            ) : null}

            <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-text-tertiary)]">
              {params.message || (isError
                ? 'Your transaction may have been submitted, but Hedwig could not finish updating the payment state automatically.'
                : 'Your payment has been processed successfully.')}
            </p>

            {params.txHash ? (
              <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Transaction ref</p>
                <p className="mt-1 break-all font-mono text-[11px] text-[var(--color-text-tertiary)]">{params.txHash}</p>
              </div>
            ) : null}

            <div className="mt-6">
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--color-primary)] px-5 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[var(--color-primary-dark)]"
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
