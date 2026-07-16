'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  CaretRight,
  Key,
  SignOut,
  Trash,
  WarningCircle
} from '@/components/ui/lucide-icons';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/providers/toast-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { AutoSettlementSection } from '@/components/preferences/auto-settlement-section';
import { SettingsSection } from '@/components/preferences/settings-section';
import { SettingsRow } from '@/components/preferences/settings-row';
import { useCurrency } from '@/components/providers/currency-provider';
import { hedwigApi, type BillingStatusSummary } from '@/lib/api/client';
import { backendConfig } from '@/lib/auth/config';
import { isProPlan, isOnPaidPlan } from '@/lib/billing/feature-gates';
import { billingSwitchErrorMessage, friendlyErrorMessage } from '@/lib/api/errors';

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

const resolveSubscriptionProvider = (billing: BillingStatusSummary | null): SubscriptionProvider | null => {
  const provider = billing?.subscriptionProvider;
  if (provider === 'polar' || provider === 'revenue_cat') return provider;
  const store = String(billing?.entitlement?.store || '').trim().toUpperCase();
  if (!store) return null;
  if (store === 'POLAR') return 'polar';
  return 'revenue_cat';
};


const planLabel = (plan: string | undefined): string => {
  if (plan === 'pro') return 'Pro';
  if (plan === 'starter') return 'Starter';
  return 'Free plan';
};

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

  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'backup' | 'warn' | 'confirm'>('backup');
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
  const isProUser = isOnPaidPlan(billingStatus);
  const subscriptionProvider = useMemo(() => resolveSubscriptionProvider(billingStatus), [billingStatus]);
  const billingInterval = billingStatus?.entitlement.billingInterval ?? null;

  useEffect(() => {
    if (!accessToken) return;
    void loadUserProfile();
    void loadBillingStatus();
    void handleConnectionDiagnostics();
    void loadPreferences();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void loadAsstPrefs();
  }, [accessToken]);

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
        message: error?.message || 'Please try again.'
      });
      router.push('/dashboard');
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
      const resp = await fetch('/api/assistant/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!resp.ok) throw new Error('Preference update failed');
    } catch {
      setAsstPrefs((prev) => ({ ...prev, [key]: !value }));
      toast({ type: 'error', title: 'Could not save preference', message: 'Please try again.' });
    } finally {
      setIsSavingAsstPref(null);
    }
  };

  const openDeleteDialog = () => {
    setDeleteStep('backup');
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
          <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Settings</h1>
          <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Manage your workspace preferences and security controls.</p>
        </div>

        <section className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
          <div className="flex items-center gap-4 border-b border-[var(--color-surface-tertiary)] px-5 py-4">
            <Avatar className="h-12 w-12 text-[14px]" label={fullName} src={avatarUrl} />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[16px] font-semibold text-[var(--color-foreground)]">{fullName}</p>
                {isProUser ? <Badge variant="success">{planLabel(billingStatus?.plan)}</Badge> : null}
              </div>
              <p className="text-[13px] text-[var(--color-text-tertiary)]">{email}</p>
            </div>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-3">
            <label className="md:col-span-1">
              <span className="mb-1 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">First name</span>
              <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" />
            </label>
            <label className="md:col-span-1">
              <span className="mb-1 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Last name</span>
              <Input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" />
            </label>
            <label className="md:col-span-1">
              <span className="mb-1 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Email</span>
              <Input value={email} disabled />
            </label>
          </div>
          <div className="border-t border-[var(--color-surface-tertiary)] px-5 py-4">
            <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
              {isSavingProfile ? 'Saving profile…' : 'Save profile'}
            </Button>
          </div>
        </section>

        <SettingsSection title="General Settings" description="Match web behavior with your app preferences.">
          <SettingsRow
            label="Display currency"
            description="USD-stored amounts (revenue, balances, expenses) are converted to this currency at current rates."
          >
            <select
              value={displayCurrency}
              onChange={(event) => setDisplayCurrency(event.target.value)}
              className="rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-secondary)] shadow-xs transition hover:bg-[var(--color-background)] focus:border-[var(--color-accent)] focus:outline-none"
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
              className="rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-secondary)] shadow-xs transition hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-60"
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
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-text-secondary)] transition hover:text-[var(--color-foreground)]"
            >
              Replay
              <CaretRight className="h-4 w-4 text-[var(--color-text-muted)]" />
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
                clientRemindersEnabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-input)]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--color-surface)] shadow-xs transition-transform ${
                  clientRemindersEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </SettingsRow>

          {([{
              key: 'dailyBriefEmail',
              label: 'Daily brief',
              description: 'Morning email and in-app summary of unpaid invoices, overdue items, and deadlines.'
            }, {
              key: 'weeklySummaryEmail',
              label: 'Weekly summary',
              description: 'Monday email and in-app summary of revenue, top clients, and AI insights.'
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
                    asstPrefs[key] ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-input)]'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--color-surface)] shadow-xs transition-transform ${
                      asstPrefs[key] ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </SettingsRow>
            ))}
        </SettingsSection>

        <AutoSettlementSection accessToken={accessToken} />

        <ComposioIntegrations />

        <SettingsSection title="Billing" description="Manage your Hedwig Pro plan on web.">
          <SettingsRow
            label="Plan"
            description="Your current subscription status."
          >
            <div className="flex items-center gap-2">
              {billingInterval ? (
                <span className="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
                  {billingInterval === 'annual' ? 'Yearly' : 'Monthly'}
                </span>
              ) : null}
              <Badge variant={isProUser ? 'success' : 'neutral'}>
                {isLoadingBilling ? 'Checking…' : planLabel(billingStatus?.plan)}
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
              <div className="flex items-center rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] p-1">
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
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] disabled:opacity-60'
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
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isOpeningSubscriptionManagement
                ? 'Opening…'
                : 'Manage'}
              <CaretRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            </button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Security" description="Protect your wallet and account.">
          <SettingsRow
            label="Export private key"
            description="Back up your embedded wallet before deleting your account or switching devices."
          >
            <Link
              href="/export-wallet"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background)]"
            >
              <Key className="h-3.5 w-3.5" weight="bold" />
              Export
              <CaretRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            </Link>
          </SettingsRow>
        </SettingsSection>

        <section className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
          <div className="border-b border-[var(--color-surface-tertiary)] px-5 py-4">
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">Account</h2>
            <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Session and account lifecycle actions.</p>
          </div>
          <div className="flex flex-wrap gap-3 px-5 py-4">
            <Button size="sm" variant="secondary" onClick={() => router.push('/sign-out')}>
              <SignOut className="h-4 w-4" weight="bold" />
              Log out
            </Button>
            <Button size="sm" variant="destructive" onClick={openDeleteDialog}>
              <Trash className="h-4 w-4" weight="bold" />
              Delete account
            </Button>
          </div>
        </section>
      </div>

      {/* Account deletion — 3-step dialog: backup → warn → confirm */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!isDeletingAccount) setDeleteOpen(open); }} size="md">
        <DialogContent>
          {deleteStep === 'backup' && (
            <>
              <DialogHeader>
                <DialogTitle>Back up your wallet first</DialogTitle>
                <DialogDescription>
                  Your account has an embedded crypto wallet. Deleting your account will permanently remove access to it.
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] px-4 py-3">
                  <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" weight="fill" />
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--color-warning)]">You will lose access to your funds</p>
                    <p className="mt-0.5 text-[12px] leading-5 text-[var(--color-warning)]">
                      If you have USDC or other tokens in your Hedwig wallet, export your private key now so you can access them later. Hedwig cannot recover this key for you.
                    </p>
                  </div>
                </div>
              </DialogBody>
              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button variant="outline" onClick={() => { setDeleteOpen(false); window.location.href = '/export-wallet'; }}>
                  <Key className="h-4 w-4 shrink-0" weight="bold" />
                  Export private key
                </Button>
                <Button variant="destructive" onClick={() => setDeleteStep('warn')}>
                  I have backed up — continue
                </Button>
              </DialogFooter>
            </>
          )}

          {deleteStep === 'warn' && (
            <>
              <DialogHeader>
                <DialogTitle>Before you delete your account</DialogTitle>
                <DialogDescription>This action is permanent and cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] px-4 py-3">
                  <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" weight="fill" />
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--color-warning)]">Final confirmation</p>
                    <p className="mt-0.5 text-[12px] leading-5 text-[var(--color-warning)]">
                      Deleting your account permanently removes your web workspace, invoices, payment links, projects, and contracts.
                    </p>
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDeleteStep('backup')}>Back</Button>
                <Button variant="destructive" onClick={() => setDeleteStep('confirm')}>
                  Continue to delete
                </Button>
              </DialogFooter>
            </>
          )}

          {deleteStep === 'confirm' && (
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
