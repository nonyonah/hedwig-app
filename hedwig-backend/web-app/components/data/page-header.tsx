import { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode; }) {
  return (
    <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        {eyebrow ? <p className="text-xs uppercase tracking-[0.24em] text-primary">{eyebrow}</p> : null}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
