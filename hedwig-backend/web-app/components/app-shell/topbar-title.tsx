'use client';

import { usePathname } from 'next/navigation';

const pageTitles: Array<{ match: RegExp; title: string }> = [
  { match: /^\/dashboard(?:\/|$)/, title: 'Dashboard' },
  { match: /^\/calendar(?:\/|$)/, title: 'Calendar' },
  { match: /^\/clients(?:\/|$)/, title: 'Clients' },
  { match: /^\/projects(?:\/|$)/, title: 'Projects' },
  { match: /^\/contracts(?:\/|$)/, title: 'Contracts' },
  { match: /^\/payments(?:\/|$)/, title: 'Payments' },
  { match: /^\/wallet(?:\/|$)/, title: 'Wallet' },
  { match: /^\/accounts(?:\/|$)/, title: 'USD Accounts' },
  { match: /^\/offramp(?:\/|$)/, title: 'Offramp' },
  { match: /^\/settings(?:\/|$)/, title: 'Settings' }
];

export function TopbarTitle() {
  const pathname = usePathname();
  const matched = pageTitles.find((item) => item.match.test(pathname));

  return <h2 className="text-[14px] font-semibold text-[#181d27]">{matched?.title || 'Hedwig'}</h2>;
}
