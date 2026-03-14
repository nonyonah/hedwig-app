import { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode; }) {
  return (
    <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{eyebrow}</p> : null}
        <h1 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.03em] text-foreground xl:text-[2.1rem]">{title}</h1>
        <p className="mt-2.5 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
