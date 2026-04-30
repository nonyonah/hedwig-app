'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  CaretRight,
  SignOut,
  Trash,
  WarningCircle
} from '@/components/ui/lucide-icons';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/providers/toast-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProLockCard } from '@/components/billing/pro-lock-card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTutorial } from '@/components/tutorial/tutorial-provider';
import { ComposioIntegrations } from '@/components/preferences/composio-integrations';
import { useCurrency } from '@/components/providers/currency-provider';
import { hedwigApi, type BillingStatusSummary } from '@/lib/api/client';
import { backendConfig } from '@/lib/auth/config';
import { isProPlan } from '@/lib/billing/feature-gates';
import { billingSwitchErrorMessage, friendlyErrorMessage } from '@/lib/api/errors';
import {
  applyThemePreference,
  getStoredThemePreference,
  setStoredThemePreference,
  subscribeToSystemTheme,
  THEME_EVENT,
  type WebThemePreference
} from '@/lib/settings/preferences';

type SettingsClientProps = {
  accessToken: string | null;
  initialUser: {
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl?: string | null;
  };
};

type SubscriptionProvider = 'polar' | 'revenue_cat';

const THEME_OPTIONS: Array<{ value: WebThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
];

const resolveSubscriptionProvider = (billing: BillingStatusSummary | null): SubscriptionProvider | null => {
  const provider = billing?.subscriptionProvider;
  if (provider === 'polar' || provider === 'revenue_cat') return provider;
  const store = String(billing?.entitlement?.store || '').trim().toUpperCase();
  if (!store) return null;
  if (store === 'POLAR') return 'polar';
  return 'revenue_cat';
};


function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
      <div className="border-b border-[#f2f4f7] px-5 py-4">
        <h2 className="text-[16px] font-semibold text-[#181d27]">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-[#717680]">{description}</p> : null}
      </div>
      <div className="divide-y divide-[#f2f4f7]">{children}</div>
    </section>
  );
}

function SettingsRow({
  label,
  description,
  children
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-[#181d27]">{label}</p>
        {description ? <p className="mt-0.5 text-[12px] text-[#717680]">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsClient({ accessToken, initialUser }: SettingsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { resetTutorial } = useTutorial();
  const { currency: displayCurrency, setCurrency: setDisplayCurrency, options: currencyOptions } = useCurrency();

  const [firstName, setFirstName] = useState(initialUser.firstName);
  const [lastName, setLastName] = useState(initialUser.lastName);
  const [email, setEmail] = useState(initialUser.email);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUser.avatarUrl ?? null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [themePreference, setThemePreference] = useState<WebThemePreference>('system');
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'warn' | 'confirm'>('warn');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatusSummary | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [isOpeningSubscriptionManagement, setIsOpeningSubscriptionManagement] = useState(false);
  const [switchingBillingInterval, setSwitchingBillingInterval] = useState<'monthly' | 'annual' | null>(null);

  const [clientRemindersEnabled, setClientRemindersEnabled] = useState(true);
  const [isSavingReminders, setIsSavingReminders] = useState(false);

  const [asstPrefs, setAsstPrefs] = useState({
    dailyBriefEmail: false,
    weeklySummaryEmail: false,
    invoiceAlerts: true,
    deadlineAlerts: true,
  });
  const [isSavingAsstPref, setIsSavingAsstPref] = useState<string | null>(null);

  const fullName = useMemo(() => `${firstName} ${lastName}`.trim() || email || 'User', [email, firstName, lastName]);
  const isProUser = isProPlan(billingStatus);
  const subscriptionProvider = useMemo(() => resolveSubscriptionProvider(billingStatus), [billingStatus]);
  const billingInterval = billingStatus?.entitlement.billingInterval ?? null;

  useEffect(() => {
    const storedTheme = getStoredThemePreference();
    setThemePreference(storedTheme);
    applyThemePreference(storedTheme);
  }, []);

  useEffect(() => {
    const syncTheme = () => setThemePreference(getStoredThemePreference());
    window.addEventListener(THEME_EVENT, syncTheme);
    window.addEventListener('storage', syncTheme);
    return () => {
      window.removeEventListener(THEME_EVENT, syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  useEffect(() => {
    applyThemePreference(themePreference);
    return subscribeToSystemTheme(themePreference, () => applyThemePreference('system'));
  }, [themePreference]);

  useEffect(() => {
    if (!accessToken) return;
    void loadUserProfile();
    void loadBillingStatus();
    void handleConnectionDiagnostics();
    void loadPreferences();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !isProUser) return;
    void loadAsstPrefs();
  }, [accessToken, isProUser]);

  useEffect(() => {
    const connected = searchParams.get('integration_connected');
    const error = searchParams.get('integration_error');
    if (connected) {
      const label = connected
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      toast({ type: 'success', title: `${label} connected` });
      router.replace('/settings');
    } else if (error) {
      toast({ type: 'error', title: 'Integration error', message: decodeURIComponent(error) });
      router.replace('/settings');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const loadUserProfile = async () => {
    if (!accessToken) return;
    try {
      const profile = await hedwigApi.getUserProfile({ accessToken, disableMockFallback: true });
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      setEmail(profile.email || '');
      setAvatarUrl(profile.avatarUrl || null);
    } catch {
      // Keep server-provided values if profile fetch fails.
    }
  };

  const loadBillingStatus = async () => {
    if (!accessToken) return;
    setIsLoadingBilling(true);
    try {
      const billing = await hedwigApi.billingStatus({ accessToken, disableMockFallback: true });
      setBillingStatus(billing);
    } catch {
      setBillingStatus(null);
    } finally {
      setIsLoadingBilling(false);
    }
  };

  const openSubscriptionManagement = async () => {
    if (!accessToken) {
      router.push('/sign-in');
      return;
    }

    if (subscriptionProvider === 'revenue_cat') {
      toast({
        type: 'info',
        title: 'Subscription managed on mobile',
        message: 'You cannot make changes here because this subscription was purchased through the mobile app.',
      });
      return;
    }

    setIsOpeningSubscriptionManagement(true);
    try {
      window.location.assign('/api/billing/polar/portal');
    } catch (error: any) {
      toast({
        type: 'error',
        title: 'Could not open subscription management',
        message: error?.message || 'Please try again from pricing.'
      });
      router.push('/pricing');
    } finally {
      setIsOpeningSubscriptionManagement(false);
    }
  };

  const switchBillingInterval = async (interval: 'monthly' | 'annual') => {
    if (!accessToken) {
      router.push('/sign-in');
      return;
    }

    if (subscriptionProvider === 'revenue_cat') {
      toast({
        type: 'info',
        title: 'Subscription managed on mobile',
        message: 'Plan interval changes for this subscription need to be made from the mobile app store.',
      });
      return;
    }

    setSwitchingBillingInterval(interval);
    try {
      const response = await fetch('/api/billing/polar/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      });
      const data = await response.json().catch(() => null) as { success?: boolean; error?: string; code?: string; data?: { changed?: boolean } } | null;
      if (!response.ok || !data?.success) {
        throw new Error(billingSwitchErrorMessage(data));
      }
      toast({
        type: 'success',
        title: data.data?.changed === false ? 'Plan already active' : 'Billing plan updated',
        message: interval === 'annual'
          ? 'Your subscription is now set to yearly billing.'
          : 'Your subscription is now set to monthly billing.',
      });
      await loadBillingStatus();
    } catch (error: any) {
      toast({
        type: 'error',
        title: 'Could not switch billing',
        message: friendlyErrorMessage(error, 'Please open subscription management and try again.'),
      });
    } finally {
      setSwitchingBillingInterval(null);
    }
  };

  const handleThemeChange = (nextTheme: WebThemePreference) => {
    setThemePreference(nextTheme);
    applyThemePreference(nextTheme);
    setStoredThemePreference(nextTheme);
    toast({ type: 'success', title: `Theme set to ${nextTheme}` });
  };

  const handleSaveProfile = async () => {
    if (!accessToken) {
      toast({ type: 'error', title: 'You are not signed in' });
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await hedwigApi.updateUserProfile(
        {
          firstName: firstName.trim(),
          lastName: lastName.trim()
        },
        { accessToken, disableMockFallback: true }
      );

      setFirstName(updated.firstName || '');
      setLastName(updated.lastName || '');
      setEmail(updated.email || '');
      setAvatarUrl(updated.avatarUrl || null);
      toast({ type: 'success', title: 'Profile updated' });
    } catch (error: any) {
      toast({ type: 'error', title: 'Could not update profile', message: error?.message || 'Please try again.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleConnectionDiagnostics = async () => {
    if (!accessToken) return;

    setIsCheckingConnection(true);
    try {
      const health = await fetch(`${backendConfig.apiBaseUrl}/health`);
      if (health.ok) {
        setConnectionStatus('online');
        return;
      }

      await hedwigApi.getUserProfile({ accessToken, disableMockFallback: true });
      setConnectionStatus('online');
    } catch {
      setConnectionStatus('offline');
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const handleReplayTutorial = () => {
    resetTutorial();
    toast({ type: 'info', title: 'Tutorial restarted' });
  };

  const loadPreferences = async () => {
    if (!accessToken) return;
    try {
      const resp = await fetch(`${backendConfig.apiBaseUrl}/api/users/preferences`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json() as { success: boolean; data: { clientRemindersEnabled: boolean } };
      if (data.success) setClientRemindersEnabled(data.data.clientRemindersEnabled);
    } catch {
      // keep default
    }
  };

  const handleToggleReminders = async (enabled: boolean) => {
    if (!accessToken) return;
    setClientRemindersEnabled(enabled);
    setIsSavingReminders(true);
    try {
      await fetch(`${backendConfig.apiBaseUrl}/api/users/preferences`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientRemindersEnabled: enabled }),
      });
    } catch {
      setClientRemindersEnabled(!enabled);
      toast({ type: 'error', title: 'Could not save preference', message: 'Please try again.' });
    } finally {
      setIsSavingReminders(false);
    }
  };

  const loadAsstPrefs = async () => {
    if (!isProUser) return;
    try {
      const resp = await fetch('/api/assistant/preferences');
      const data = await resp.json() as { success: boolean; data: typeof asstPrefs };
      if (data.success) setAsstPrefs(data.data);
    } catch { /* keep defaults */ }
  };

  const handleAsstPrefToggle = async (key: keyof typeof asstPrefs, value: boolean) => {
    setAsstPrefs((prev) => ({ ...prev, [key]: value }));
    setIsSavingAsstPref(key);
    try {
      await fetch('/api/assistant/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      setAsstPrefs((prev) => ({ ...prev, [key]: !value }));
      toast({ type: 'error', title: 'Could not save preference', message: 'Please try again.' });
    } finally {
      setIsSavingAsstPref(null);
    }
  };

  const openDeleteDialog = () => {
    setDeleteStep('warn');
    setDeleteOpen(true);
  };

  const handleDeleteAccount = async () => {
    if (!accessToken) return;
    setIsDeletingAccount(true);
    try {
      const response = await fetch(`${backendConfig.apiBaseUrl}/api/users/account`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error?.message || 'Failed to delete account.');
      }

      setDeleteOpen(false);
      toast({
        type: 'success',
        title: 'Account deleted',
        message: 'Your account has been permanently removed. A confirmation email has been sent.'
      });
      setTimeout(() => router.push('/sign-out'), 2000);
    } catch (error: any) {
      toast({ type: 'error', title: 'Delete account failed', message: error?.message || 'Please try again.' });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5">
        <div>
          <h1 className="text-[18px] font-semibold text-[#181d27]">Settings</h1>
          <p className="mt-1 text-[13px] text-[#717680]">Manage your workspace preferences and security controls.</p>
        </div>

        <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
          <div className="flex items-center gap-4 border-b border-[#f2f4f7] px-5 py-4">
            <Avatar className="h-12 w-12 text-[14px]" label={fullName} src={avatarUrl} />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[16px] font-semibold text-[#181d27]">{fullName}</p>
                {isProUser ? <Badge variant="success">Pro</Badge> : null}
              </div>
              <p className="text-[13px] text-[#717680]">{email}</p>
            </div>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-3">
            <label className="md:col-span-1">
              <span className="mb-1 block text-[12px] font-semibold text-[#525866]">First name</span>
              <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" />
            </label>
            <label className="md:col-span-1">
              <span className="mb-1 block text-[12px] font-semibold text-[#525866]">Last name</span>
              <Input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" />
            </label>
            <label className="md:col-span-1">
              <span className="mb-1 block text-[12px] font-semibold text-[#525866]">Email</span>
              <Input value={email} disabled />
            </label>
          </div>
          <div className="border-t border-[#f2f4f7] px-5 py-4">
            <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
              {isSavingProfile ? 'Saving profile…' : 'Save profile'}
            </Button>
          </div>
        </section>

        <SettingsSection title="General Settings" description="Match web behavior with your app preferences.">
          <SettingsRow label="Theme" description="Choose light, dark, or follow your system theme.">
            <div className="flex items-center rounded-full border border-[#e9eaeb] bg-[#f5f5f5] p-1">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleThemeChange(option.value)}
                  className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
                    themePreference === option.value
                      ? 'bg-white text-[#181d27] shadow-xs'
                      : 'text-[#717680] hover:text-[#414651]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </SettingsRow>

          <SettingsRow
            label="Display currency"
            description="USD-stored amounts (revenue, balances, expenses) are converted to this currency at current rates."
          >
            <select
              value={displayCurrency}
              onChange={(event) => setDisplayCurrency(event.target.value)}
              className="rounded-full border border-[#d5d7da] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#fafafa] focus:border-[#2563eb] focus:outline-none"
            >
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.flag} {option.code} · {option.label}
                </option>
              ))}
            </select>
          </SettingsRow>

          <SettingsRow label="Connection diagnostics" description="Run a quick API reachability check.">
            <button
              type="button"
              onClick={handleConnectionDiagnostics}
              disabled={isCheckingConnection}
              className="rounded-full border border-[#d5d7da] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCheckingConnection
                ? 'Checking…'
                : connectionStatus === 'online'
                  ? 'Online'
                  : connectionStatus === 'offline'
                    ? 'Offline'
                    : 'Unknown'}
            </button>
          </SettingsRow>

          <SettingsRow label="Show app tutorial" description="Replay the onboarding flow.">
            <button
              type="button"
              onClick={handleReplayTutorial}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#414651] transition hover:text-[#181d27]"
            >
              Replay
              <CaretRight className="h-4 w-4 text-[#a4a7ae]" />
            </button>
          </SettingsRow>

        </SettingsSection>

        <SettingsSection title="Assistant Notifications" description="Choose how Hedwig keeps you informed about your workspace.">
          <SettingsRow label="Client reminders" description="Send automatic payment reminders to clients on due dates.">
            <button
              type="button"
              role="switch"
              aria-checked={clientRemindersEnabled}
              disabled={isSavingReminders}
              onClick={() => void handleToggleReminders(!clientRemindersEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                clientRemindersEnabled ? 'bg-[#2563eb]' : 'bg-[#d5d7da]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                  clientRemindersEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </SettingsRow>

          {isProUser ? (
            ([{
              key: 'dailyBriefEmail',
              label: 'Daily brief email',
              description: 'Morning summary of unpaid invoices, overdue items, and deadlines.'
            }, {
              key: 'weeklySummaryEmail',
              label: 'Weekly summary email',
              description: 'Revenue, top clients, and AI insights every Monday.'
            }, {
              key: 'invoiceAlerts',
              label: 'Invoice alerts',
              description: 'In-app alert when invoices become overdue.'
            }, {
              key: 'deadlineAlerts',
              label: 'Deadline alerts',
              description: 'In-app alert when a project deadline is within 3 days.'
            }] as Array<{ key: keyof typeof asstPrefs; label: string; description: string }>).map(({ key, label, description }) => (
              <SettingsRow key={key} label={label} description={description}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={asstPrefs[key]}
                  disabled={isSavingAsstPref === key}
                  onClick={() => void handleAsstPrefToggle(key, !asstPrefs[key])}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                    asstPrefs[key] ? 'bg-[#2563eb]' : 'bg-[#d5d7da]'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                      asstPrefs[key] ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </SettingsRow>
            ))
          ) : (
            <div className="p-5">
              <ProLockCard
                title="Assistant is on Pro"
                description="Unlock daily briefs, suggestion reviews, and assistant notifications."
                compact
              />
            </div>
          )}
        </SettingsSection>

        <ComposioIntegrations />

        <SettingsSection title="Billing" description="Manage your Hedwig Pro plan across web and mobile.">
          <SettingsRow
            label="Plan"
            description="Your current subscription status."
          >
            <div className="flex items-center gap-2">
              {billingInterval ? (
                <span className="rounded-full bg-[#eff4ff] px-2.5 py-1 text-[11px] font-semibold text-[#2563eb]">
                  {billingInterval === 'annual' ? 'Yearly' : 'Monthly'}
                </span>
              ) : null}
              <Badge variant={isProUser ? 'success' : 'neutral'}>
                {isLoadingBilling ? 'Checking…' : isProUser ? 'Pro' : 'Free plan'}
              </Badge>
            </div>
          </SettingsRow>

          {isProUser && subscriptionProvider !== 'revenue_cat' ? (
            <SettingsRow
              label="Billing cadence"
              description={
                billingInterval === 'annual'
                  ? 'Switch back to monthly billing if you prefer more flexibility.'
                  : 'Upgrade to yearly billing to lock in the annual discount.'
              }
            >
              <div className="flex items-center rounded-full border border-[#d5d7da] bg-white p-1">
                {(['monthly', 'annual'] as const).map((interval) => {
                  const active = billingInterval === interval;
                  const busy = switchingBillingInterval === interval;
                  return (
                    <button
                      key={interval}
                      type="button"
                      onClick={() => switchBillingInterval(interval)}
                      disabled={active || switchingBillingInterval !== null}
                      className={`rounded-full px-3 py-1 text-[12px] font-semibold transition disabled:cursor-not-allowed ${
                        active
                          ? 'bg-[#2563eb] text-white'
                          : 'text-[#414651] hover:bg-[#eff4ff] hover:text-[#2563eb] disabled:opacity-60'
                      }`}
                    >
                      {busy ? 'Opening…' : interval === 'annual' ? 'Yearly' : 'Monthly'}
                    </button>
                  );
                })}
              </div>
            </SettingsRow>
          ) : null}

          <SettingsRow
            label="Cancel or change plan"
            description={
              subscriptionProvider === 'revenue_cat'
                ? 'This subscription was purchased on mobile.'
                : 'Open web subscription management.'
            }
          >
            <button
              type="button"
              onClick={() => {
                void openSubscriptionManagement();
              }}
              disabled={isOpeningSubscriptionManagement}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#d5d7da] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#414651] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isOpeningSubscriptionManagement
                ? 'Opening…'
                : 'Manage'}
              <CaretRight className="h-3.5 w-3.5 text-[#a4a7ae]" />
            </button>
          </SettingsRow>
        </SettingsSection>

        <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
          <div className="border-b border-[#f2f4f7] px-5 py-4">
            <h2 className="text-[16px] font-semibold text-[#181d27]">Account</h2>
            <p className="mt-0.5 text-[13px] text-[#717680]">Session and account lifecycle actions.</p>
          </div>
          <div className="flex flex-wrap gap-3 px-5 py-4">
            <Button asChild size="sm" variant="secondary">
              <Link href="/sign-out">
                <SignOut className="h-4 w-4" weight="bold" />
                Log out
              </Link>
            </Button>
            <Button size="sm" variant="destructive" onClick={openDeleteDialog}>
              <Trash className="h-4 w-4" weight="bold" />
              Delete account
            </Button>
          </div>
        </section>
      </div>

      {/* Account deletion — 2-step dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!isDeletingAccount) setDeleteOpen(open); }}>
        <DialogContent className="max-w-[480px]">
          {deleteStep === 'warn' ? (
            <>
              <DialogHeader>
                <DialogTitle>Before you delete your account</DialogTitle>
                <DialogDescription>This action is permanent and cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3">
                  <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#92400e]" weight="fill" />
                  <div>
                    <p className="text-[13px] font-semibold text-[#92400e]">Final confirmation</p>
                    <p className="mt-0.5 text-[12px] leading-5 text-[#b45309]">
                      Deleting your account permanently removes your web workspace, invoices, payment links, projects, and contracts.
                    </p>
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={() => setDeleteStep('confirm')}>
                  Continue to delete
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Confirm account deletion</DialogTitle>
                <DialogDescription>
                  This will permanently delete <strong>{email || fullName}</strong> and all associated data. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDeleteStep('warn')} disabled={isDeletingAccount}>Back</Button>
                <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDeletingAccount}>
                  {isDeletingAccount ? 'Deleting…' : 'Delete my account'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
