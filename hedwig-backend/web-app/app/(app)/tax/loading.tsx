function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-[#f2f4f7] ${className}`} />;
}

export default function TaxLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-28" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        <SkeletonBlock className="h-10 w-40 rounded-full" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-[122px] w-full" />
        <SkeletonBlock className="h-[122px] w-full" />
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb] md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-white p-5">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="mt-4 h-8 w-28" />
            <SkeletonBlock className="mt-3 h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SkeletonBlock className="h-[360px] w-full" />
        <SkeletonBlock className="h-[360px] w-full" />
      </div>

      <SkeletonBlock className="h-[320px] w-full" />
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <SkeletonBlock className="h-[240px] w-full" />
        <SkeletonBlock className="h-[240px] w-full" />
      </div>
    </div>
  );
}
