import { getCurrentSession } from '@/lib/auth/session';
import { SettingsClient } from './view';

export default async function SettingsPage() {
  const session = await getCurrentSession();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Settings</h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Categorization rules and tax configuration.</p>
      </div>
      <SettingsClient accessToken={session.accessToken} />
    </div>
  );
}
