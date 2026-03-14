import { AccountMenu } from '@/components/app-shell/account-menu';
import { NotificationBell } from '@/components/app-shell/notification-bell';
import { TopbarTitle } from '@/components/app-shell/topbar-title';
import { getCurrentSession } from '@/lib/auth/session';
import { hedwigApi } from '@/lib/api/client';

export async function AppTopbar() {
  const session = await getCurrentSession();
  const shell = await hedwigApi.shell({ accessToken: session.accessToken });
  const unread = shell.unreadCount;
  const user = shell.currentUser;

  return (
    <div className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#e9eaeb] bg-white px-4 lg:px-8">
      <TopbarTitle />

      <div className="flex items-center gap-1">
        <NotificationBell unreadCount={unread} />
        <AccountMenu email={user.email} fullName={`${user.firstName} ${user.lastName}`.trim() || user.email} />
      </div>
    </div>
  );
}
