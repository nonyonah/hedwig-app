export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="rounded-[15px] border border-border bg-card/80 px-8 py-6 shadow-panel">
        <p className="text-sm text-muted-foreground">Loading Hedwig workspace...</p>
      </div>
    </div>
  );
}
