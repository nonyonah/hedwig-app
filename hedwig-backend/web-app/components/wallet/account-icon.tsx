import Image from 'next/image';

const CURRENCY_FLAG: Record<string, string> = {
  USD: '🇺🇸',
  NGN: '🇳🇬',
  EUR: '🇪🇺',
  MXN: '🇲🇽',
};

/** Rounded currency mark: USDC logo for stablecoin, flag disc for fiat. */
export function AccountIcon({ currency, size = 38 }: { currency: string; size?: number }) {
  const cur = String(currency ?? '').toUpperCase();
  if (cur === 'USDC') {
    return (
      <Image
        src="/icons/tokens/usdc.png"
        alt="USDC"
        width={size}
        height={size}
        className="shrink-0 rounded-full"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-secondary)]"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {CURRENCY_FLAG[cur] ?? '¤'}
    </span>
  );
}
