'use client';

export function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
      <div className="border-b border-[var(--color-surface-tertiary)] px-5 py-4">
        <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">{description}</p> : null}
      </div>
      <div className="divide-y divide-[var(--color-surface-tertiary)]">{children}</div>
    </section>
  );
}
