export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-surface)] px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-surface-tertiary)]">
        <svg className="h-8 w-8 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 15.53l9-9.31 9 9.31M4.5 10.5V18a1.5 1.5 0 001.5 1.5h3.75v-5.25a.75.75 0 01.75-.75h2.25a.75.75 0 01.75.75V19.5h3.75A1.5 1.5 0 0019.5 18v-7.5" />
        </svg>
      </div>
      <h1 className="text-[20px] font-bold text-[var(--color-foreground)]">You are offline</h1>
      <p className="mt-2 max-w-sm text-[14px] text-[var(--color-text-muted)]">
        Connect to the internet to access Hedwig. Your data will sync once you are back online.
      </p>
    </div>
  );
}
