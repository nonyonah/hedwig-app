import { ReactNode } from 'react';
import { AppSidebar } from '@/components/app-shell/sidebar';
import { AppTopbar } from '@/components/app-shell/topbar';
import { TokenRefresher } from '@/components/app-shell/token-refresher';

export function ProtectedShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fafafa] text-foreground">
      <TokenRefresher />
      <div className="flex min-h-screen">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar />
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
