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
      <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
        {/* Colored band */}
        <div className={`h-1.5 w-full ${isSuccess ? 'bg-[var(--color-success)]' : 'bg-[var(--color-danger)]'}`} />

        <div className="px-8 py-8 text-center">
            <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${isSuccess ? 'bg-[var(--color-success-soft)]' : 'bg-[var(--color-danger-soft)]'}`}>
            {isSuccess ? (
              <CheckCircle className="h-9 w-9 text-[var(--color-text-tertiary)]" weight="fill" />
            ) : (
              <WarningCircle className="h-9 w-9 text-[var(--color-text-tertiary)]" weight="fill" />
            )}
          </div>

          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{title}</h1>

          {amountLabel ? (
            <p className="mt-2 text-[15px] font-semibold text-[var(--color-text-secondary)]">{amountLabel}</p>
          ) : null}

          <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-text-tertiary)]">{message}</p>

          {txHash ? (
            <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Transaction ref</p>
              <p className="mt-1 break-all font-mono text-[11px] text-[var(--color-text-tertiary)]">{txHash}</p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col items-center gap-3">
            {explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-5 text-[13px] font-semibold text-[var(--color-text-secondary)] shadow-xs transition hover:bg-[var(--color-background)]"
              >
                View on explorer
              </a>
            ) : null}
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
  );
}
