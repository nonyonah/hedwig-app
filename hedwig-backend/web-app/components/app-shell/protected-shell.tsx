import { ReactNode } from 'react';
import { AppSidebar } from '@/components/app-shell/sidebar';
import { AppTopbar } from '@/components/app-shell/topbar';

export function ProtectedShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <AppSidebar />
        <div className="min-w-0 flex-1">
          <AppTopbar />
          <main className="px-4 py-6 xl:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
