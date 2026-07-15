'use client';

export function SettingsRow({
  label,
  description,
  children
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{label}</p>
        {description ? <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
