import { Bell, Command, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getCurrentSession } from '@/lib/auth/session';
import { hedwigApi } from '@/lib/api/client';

export async function AppTopbar() {
  const session = await getCurrentSession();
  const shell = await hedwigApi.shell({ accessToken: session.accessToken });
  const unread = shell.unreadCount;
  const user = shell.currentUser;

  return (
    <div className="sticky top-0 z-20 border-b border-white/5 bg-slate-950/65 px-4 py-4 backdrop-blur xl:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{shell.workspace.name}</p>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Operate your client work and money from one place</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted-foreground md:flex">
            <Search className="h-4 w-4" />
            Search clients, invoices, wallets
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400"><Command className="mr-1 inline h-3 w-3" />K</span>
          </div>
          <Button variant="ghost" size="icon" className="relative border border-white/10 bg-white/5">
            <Bell className="h-4 w-4" />
            {unread > 0 ? <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-primary" /> : null}
          </Button>
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2">
            <Avatar label={`${user.firstName} ${user.lastName}`.trim() || user.email} />
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-semibold text-foreground">{user.firstName} {user.lastName}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
