'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  CaretRight,
  Key,
  PencilSimple,
  SignOut,
  Trash,
  WarningCircle
} from '@/components/ui/lucide-icons';
import { Alert, AlertDialog, Switch } from '@heroui/react';
import { Avatar } from '@/components/ui/avatar';
import { AvatarEditDialog, type AvatarValue } from '@/components/ui/avatar-edit-dialog';
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
import { FinanceSettingsSections } from '@/components/preferences/finance-settings-sections';
import { SettingsSection } from '@/components/preferences/settings-section';
import { SettingsRow } from '@/components/preferences/settings-row';
import { useCurrency } from '@/components/providers/currency-provider';
import { hedwigApi, type BillingStatusSummary } from '@/lib/api/client';
import { backendConfig } from '@/lib/auth/config';
import { isProPlan, isOnPaidPlan } from '@/lib/billing/feature-gates';


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

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'backup' | 'warn' | 'confirm'>('backup');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatusSummary | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [isOpeningSubscriptionManagement, setIsOpeningSubscriptionManagement] = useState(false);
  const [clientRemindersEnabled, setClientRemindersEnabled] = useState(true);
  const [isSavingReminders, setIsSavingReminders] = useState(false);

  const [asstPrefs, setAsstPrefs] = useState({
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
      // Auto-refresh the connection status so it transitions from "pending" to "active"
      fetch(`/api/integrations/composio/refresh/${connected}`, { method: 'POST' }).catch(() => null);
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

  const handleSaveAvatar = async (avatar: AvatarValue) => {
    if (!accessToken) return;
    setSavingAvatar(true);
    try {
      let value: string;
      if (avatar.type === 'emoji') {
        value = `emoji:${avatar.value}`;
      } else if (avatar.type === 'icon') {
        value = `icon:${avatar.value}:${avatar.color}`;
      } else {
        value = avatar.value;
      }
      const updated = await hedwigApi.updateUserProfile({ avatar: value }, { accessToken, disableMockFallback: true });
      setAvatarUrl(updated.avatarUrl || null);
      setAvatarDialogOpen(false);
      toast({ type: 'success', title: 'Avatar updated' });
    } catch (error: any) {
      toast({ type: 'error', title: 'Could not update avatar', message: error?.message || 'Please try again.' });
    } finally {
      setSavingAvatar(false);
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

        <section className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
          <div className="flex items-center gap-4 border-b border-[var(--color-surface-tertiary)] px-5 py-4">
            <button type="button" onClick={() => setAvatarDialogOpen(true)} className="group relative shrink-0">
              <Avatar label={fullName} src={avatarUrl} size="xl" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-accent)] text-[9px] text-white opacity-0 shadow-xs transition-opacity group-hover:opacity-100">
                <PencilSimple className="h-2.5 w-2.5" weight="bold" />
              </span>
            </button>
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
              <Input fullWidth value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" />
            </label>
            <label className="md:col-span-1">
              <span className="mb-1 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Last name</span>
              <Input fullWidth value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" />
            </label>
            <label className="md:col-span-1">
              <span className="mb-1 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Email</span>
              <Input fullWidth value={email} disabled />
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
            <div className="relative">
              <select
                value={displayCurrency}
                onChange={(event) => setDisplayCurrency(event.target.value)}
                className="w-full appearance-none rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-1.5 pr-8 text-[12px] font-semibold text-[var(--color-text-secondary)] shadow-xs transition hover:bg-[var(--color-background)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {currencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.flag} {option.code} · {option.label}
                  </option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-muted)]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4.5L6 7.5L9 4.5" />
              </svg>
            </div>
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
            <Switch isSelected={clientRemindersEnabled} isDisabled={isSavingReminders} onChange={() => void handleToggleReminders(!clientRemindersEnabled)}>
              <Switch.Control><Switch.Thumb /></Switch.Control>
            </Switch>
          </SettingsRow>

          {([{
              key: 'invoiceAlerts',
              label: 'Invoice alerts',
              description: 'In-app alert when invoices become overdue.'
            }, {
              key: 'deadlineAlerts',
              label: 'Deadline alerts',
              description: 'In-app alert when a project deadline is within 3 days.'
            }] as Array<{ key: keyof typeof asstPrefs; label: string; description: string }>).map(({ key, label, description }) => (
              <SettingsRow key={key} label={label} description={description}>
                <Switch isSelected={asstPrefs[key]} isDisabled={isSavingAsstPref === key} onChange={() => void handleAsstPrefToggle(key, !asstPrefs[key])}>
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                </Switch>
              </SettingsRow>
            ))}
        </SettingsSection>

        {/* Gateway aggregation hidden — unified USDC is not user-facing yet. */}
        {/* <AutoSettlementSection accessToken={accessToken} /> */}

        <FinanceSettingsSections accessToken={accessToken} />

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

        <section className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
          <div className="border-b border-[var(--color-surface-tertiary)] px-5 py-4">
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">Account</h2>
            <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Session and account lifecycle actions.</p>
          </div>
          <div className="flex flex-wrap gap-3 px-5 py-4">
            <Button size="sm" variant="secondary" onClick={() => setShowLogoutConfirm(true)}>
              <SignOut className="h-4 w-4" weight="bold" />
              Log out
            </Button>
            <Button size="sm" variant="destructive" onClick={openDeleteDialog}>
              <Trash className="h-4 w-4" weight="bold" />
              Delete account
            </Button>
          </div>
        </section>

        <AlertDialog.Backdrop isOpen={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="warning" />
                <AlertDialog.Heading>Log out?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                  Are you sure you want to log out? You will need to sign in again to access your account.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="secondary" onClick={() => setShowLogoutConfirm(false)}>Cancel</Button>
                <Button variant="destructive" onClick={() => router.push('/sign-out')}>Log out</Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
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
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <WarningCircle className="h-4 w-4 shrink-0 text-[var(--color-warning)]" weight="fill" />
                    <Alert.Title>You will lose access to your funds</Alert.Title>
                    <Alert.Description>
                      If you have USDC or other tokens in your Hedwig wallet, export your private key now so you can access them later. Hedwig cannot recover this key for you.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
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
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <WarningCircle className="h-4 w-4 shrink-0 text-[var(--color-warning)]" weight="fill" />
                    <Alert.Title>Final confirmation</Alert.Title>
                    <Alert.Description>
                      Deleting your account permanently removes your web workspace, invoices, payment links, projects, and contracts.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
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

      <AvatarEditDialog
        open={avatarDialogOpen}
        onOpenChange={setAvatarDialogOpen}
        currentSrc={avatarUrl}
        onSave={handleSaveAvatar}
        saving={savingAvatar}
      />
    </>
  );
}
