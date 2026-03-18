import Image from 'next/image';

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-white">
      <Image src="/hedwig-logo.png" alt="Hedwig" width={44} height={44} priority />

      <div
        className="h-5 w-5 animate-spin rounded-full border-2 border-[#e9eaeb] border-t-[#2563eb]"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
