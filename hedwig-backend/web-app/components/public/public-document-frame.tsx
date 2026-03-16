import Image from 'next/image';
import Link from 'next/link';

export function PublicDocumentFrame({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* Sticky top nav */}
      <nav className="sticky top-0 z-10 border-b border-[#e9eaeb] bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/hedwig-logo.png" alt="Hedwig" width={30} height={30} className="rounded-[9px]" />
            <span className="text-[14px] font-semibold text-[#181d27]">Hedwig</span>
          </Link>
          <span className="rounded-full bg-[#f5f5f5] px-3 py-1 text-[12px] font-medium text-[#717680]">{title}</span>
        </div>
      </nav>

      {/* Page content */}
      <div className="mx-auto max-w-5xl px-5 py-8">
        {children}
      </div>

      {/* Footer */}
      <div className="pb-10 pt-2 text-center">
        <p className="text-[12px] text-[#a4a7ae]">
          Powered by{' '}
          <Link href="/" className="font-medium text-[#717680] hover:text-[#414651]">
            Hedwig
          </Link>{' '}
          — payments for independent professionals
        </p>
      </div>
    </div>
  );
}
