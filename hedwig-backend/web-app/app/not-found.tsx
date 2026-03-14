import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-md rounded-[15px] border border-border bg-card/80 p-8 shadow-panel">
        <p className="text-xs uppercase tracking-[0.24em] text-primary">Missing route</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">This workspace view does not exist</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The requested Hedwig page is not part of the scaffold or the resource ID does not exist in the mock dataset.
        </p>
        <Link className="mt-6 inline-flex rounded-[15px] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href="/dashboard">
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
