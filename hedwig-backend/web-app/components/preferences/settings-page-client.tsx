'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Purchases } from '@revenuecat/purchases-js';
import {
  ArrowsClockwise,
  CalendarBlank,
  CaretRight,
  CheckCircle,
  Info,
  Shield,
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
import { hedwigApi, type BillingStatusSummary, type KycStatusSummary } from '@/lib/api/client';
import { backendConfig } from '@/lib/auth/config';
import { isProPlan } from '@/lib/billing/feature-gates';
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

type KycStatus = KycStatusSummary['status'];

type KycBadgeConfig = {
  label: string;
  variant: 'neutral' | 'warning' | 'success' | 'error';
};

const KYC_BADGE: Record<KycStatus, KycBadgeConfig> = {
  approved: { label: 'Verified', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  not_started: { label: 'Unverified', variant: 'neutral' },
  rejected: { label: 'Unverified', variant: 'error' },
  retry_required: { label: 'Needs retry', variant: 'error' }
};

const THEME_OPTIONS: Array<{ value: WebThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
];

const WEB_BILLING_SANDBOX_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_WEB_BILLING_SANDBOX_API_KEY?.trim() || '';
const WEB_BILLING_PROD_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_WEB_BILLING_API_KEY?.trim() || '';
const WEB_BILLING_USE_SANDBOX = process.env.NEXT_PUBLIC_REVENUECAT_USE_SANDBOX !== 'false';
const WEB_BILLING_API_KEY = WEB_BILLING_USE_SANDBOX
  ? WEB_BILLING_SANDBOX_API_KEY || WEB_BILLING_PROD_API_KEY
  : WEB_BILLING_PROD_API_KEY || WEB_BILLING_SANDBOX_API_KEY;


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
  const { toast } = useToast();
  const { resetTutorial } = useTutorial();

  const [firstName, setFirstName] = useState(initialUser.firstName);
  const [lastName, setLastName] = useState(initialUser.lastName);
  const [email, setEmail] = useState(initialUser.email);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUser.avatarUrl ?? null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [themePreference, setThemePreference] = useState<WebThemePreference>('system');
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  const [kycStatus, setKycStatus] = useState<KycStatus>('not_started');
  const [isKycApproved, setIsKycApproved] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);
  const [isStartingKyc, setIsStartingKyc] = useState(false);
  const [isRefreshingKyc, setIsRefreshingKyc] = useState(false);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarSubscribeUrl, setCalendarSubscribeUrl] = useState<string | null>(null);
  const [isFetchingCalendarLink, setIsFetchingCalendarLink] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'warn' | 'confirm'>('warn');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatusSummary | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [isOpeningSubscriptionManagement, setIsOpeningSubscriptionManagement] = useState(false);
  const [managementUrl, setManagementUrl] = useState<string | null>(null);

  const fullName = useMemo(() => `${firstName} ${lastName}`.trim() || email || 'User', [email, firstName, lastName]);
  const kycBadge = KYC_BADGE[kycStatus];
  const isProUser = isProPlan(billingStatus);

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
    void loadKycStatus();
    void loadBillingStatus();
  }, [accessToken]);

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

  const loadKycStatus = async () => {
    if (!accessToken) return;
    try {
      const status = await hedwigApi.getKycStatus({ accessToken, disableMockFallback: true });
      setKycStatus(status.status);
      setIsKycApproved(Boolean(status.isApproved));
    } catch {
      // Keep local defaults if status fetch fails.
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

  const resolveManagementUrl = async (appUserId: string): Promise<string | null> => {
    if (!WEB_BILLING_API_KEY) return null;

    let purchases: Purchases;
    if (!Purchases.isConfigured()) {
      purchases = Purchases.configure({
        apiKey: WEB_BILLING_API_KEY,
        appUserId
      });
    } else {
      purchases = Purchases.getSharedInstance();
      if (purchases.getAppUserId() !== appUserId) {
        await purchases.changeUser(appUserId);
      }
    }

    const customerInfo = await purchases.getCustomerInfo();
    return customerInfo.managementURL || null;
  };

  const openSubscriptionManagement = async () => {
    if (managementUrl) {
      window.open(managementUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (!billingStatus?.appUserId) {
      router.push('/pricing');
      return;
    }

    setIsOpeningSubscriptionManagement(true);
    try {
      const url = await resolveManagementUrl(billingStatus.appUserId);
      if (url) {
        setManagementUrl(url);
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      toast({
        type: 'info',
        title: 'Subscription management',
        message: 'Management URL was unavailable. Opened pricing page instead.'
      });
      router.push('/pricing');
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

  const fetchCalendarSubscribeUrl = async () => {
    if (!accessToken) return;
    setIsFetchingCalendarLink(true);
    try {
      const data = await hedwigApi.calendarIcsToken({ accessToken, disableMockFallback: true });
      setCalendarSubscribeUrl(data.subscribeUrl);
    } catch (error: any) {
      toast({ type: 'error', title: 'Could not fetch calendar link', message: error?.message || 'Please try again.' });
    } finally {
      setIsFetchingCalendarLink(false);
    }
  };

  const openCalendarDialog = () => {
    setCalendarOpen(true);
    if (!calendarSubscribeUrl && !isFetchingCalendarLink) {
      void fetchCalendarSubscribeUrl();
    }
  };

  const openGoogleCalendar = () => {
    if (!calendarSubscribeUrl) return;
    const webcalUrl = calendarSubscribeUrl.replace(/^https?:\/\//i, 'webcal://');
    const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
    window.open(googleUrl, '_blank', 'noopener,noreferrer');
  };

  const openAppleCalendar = () => {
    if (!calendarSubscribeUrl) return;
    const webcalUrl = calendarSubscribeUrl.replace(/^https?:\/\//i, 'webcal://');
    window.open(webcalUrl, '_blank', 'noopener,noreferrer');
  };

  const startKycFlow = async () => {
    if (!accessToken) return;
    setIsStartingKyc(true);
    try {
      const response = await hedwigApi.startKyc({ accessToken, disableMockFallback: true });
      setKycStatus(response.status);
      setIsKycApproved(response.status === 'approved');
      if (response.url) {
        window.open(response.url, '_blank', 'noopener,noreferrer');
      }
      toast({
        type: 'success',
        title: response.url ? 'Verification window opened' : 'Verification started',
        message: response.message
      });
    } catch (error: any) {
      toast({ type: 'error', title: 'Could not start verification', message: error?.message || 'Please try again.' });
    } finally {
      setIsStartingKyc(false);
    }
  };

  const refreshKycStatus = async () => {
    if (!accessToken) return;
    setIsRefreshingKyc(true);
    try {
      const response = await hedwigApi.checkKycStatus({ accessToken, disableMockFallback: true });
      setKycStatus(response.status);
      setIsKycApproved(Boolean(response.isApproved));
      toast({ type: 'info', title: 'Verification status refreshed' });
    } catch (error: any) {
      toast({ type: 'error', title: 'Could not refresh status', message: error?.message || 'Please try again.' });
    } finally {
      setIsRefreshingKyc(false);
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

          <SettingsRow label="Connect calendar" description="Subscribe to invoice reminders in your calendar app.">
            <button
              type="button"
              onClick={openCalendarDialog}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#414651] transition hover:text-[#181d27]"
            >
              Open
              <CaretRight className="h-4 w-4 text-[#a4a7ae]" />
            </button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Billing" description="Manage your Hedwig Pro plan across web and mobile.">
          <SettingsRow
            label="Plan"
            description="Your current subscription status."
          >
            <Badge variant={isProUser ? 'success' : 'neutral'}>
              {isLoadingBilling ? 'Checking…' : isProUser ? 'Pro active' : 'Free plan'}
            </Badge>
          </SettingsRow>

          <SettingsRow
            label="Cancel or change plan"
            description="Open RevenueCat subscription management."
          >
            <button
              type="button"
              onClick={() => {
                void openSubscriptionManagement();
              }}
              disabled={isOpeningSubscriptionManagement}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#d5d7da] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#414651] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isOpeningSubscriptionManagement ? 'Opening…' : 'Manage'}
              <CaretRight className="h-3.5 w-3.5 text-[#a4a7ae]" />
            </button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Security" description="Protect account access and verification status.">
          <SettingsRow label="Identity Verification" description="Manage your verification session status.">
            <button
              type="button"
              onClick={() => setKycOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#414651] transition hover:bg-[#fafafa]"
            >
              <Badge variant={kycBadge.variant}>{kycBadge.label}</Badge>
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

      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Connect calendar</DialogTitle>
            <DialogDescription>Subscribe to Hedwig reminders in Google Calendar or Apple Calendar.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {isFetchingCalendarLink ? (
              <div className="rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] px-4 py-3 text-[13px] text-[#717680]">
                Fetching your calendar link…
              </div>
            ) : null}

            {!isFetchingCalendarLink && calendarSubscribeUrl ? (
              <>
                <button
                  type="button"
                  onClick={openGoogleCalendar}
                  className="flex w-full items-center justify-between rounded-2xl border border-[#e9eaeb] bg-white px-4 py-3 text-left transition hover:bg-[#fafafa]"
                >
                  <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#181d27]">
                    <CalendarBlank className="h-4 w-4 text-[#717680]" weight="regular" />
                    Connect Google Calendar
                  </span>
                  <CaretRight className="h-4 w-4 text-[#a4a7ae]" />
                </button>
                <button
                  type="button"
                  onClick={openAppleCalendar}
                  className="flex w-full items-center justify-between rounded-2xl border border-[#e9eaeb] bg-white px-4 py-3 text-left transition hover:bg-[#fafafa]"
                >
                  <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#181d27]">
                    <CalendarBlank className="h-4 w-4 text-[#717680]" weight="regular" />
                    Connect Apple Calendar
                  </span>
                  <CaretRight className="h-4 w-4 text-[#a4a7ae]" />
                </button>
                <div className="rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] px-4 py-3">
                  <p className="text-[12px] text-[#717680]">Raw subscribe URL</p>
                  <p className="mt-1 break-all text-[12px] font-medium text-[#414651]">{calendarSubscribeUrl}</p>
                </div>
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCalendarOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={kycOpen} onOpenChange={setKycOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Identity Verification</DialogTitle>
            <DialogDescription>Complete KYC to unlock full account functionality.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f5]">
                {isKycApproved ? (
                  <CheckCircle className="h-4 w-4 text-[#717680]" weight="fill" />
                ) : kycStatus === 'pending' ? (
                  <Info className="h-4 w-4 text-[#717680]" weight="regular" />
                ) : (
                  <WarningCircle className="h-4 w-4 text-[#717680]" weight="regular" />
                )}
              </div>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2">
                  <p className="text-[14px] font-semibold text-[#181d27]">Status</p>
                  <Badge variant={kycBadge.variant}>{kycBadge.label}</Badge>
                </div>
                <p className="mt-1 text-[13px] leading-5 text-[#717680]">
                  {isKycApproved
                    ? 'Your identity is verified.'
                    : kycStatus === 'pending'
                      ? 'Your verification is under review.'
                      : 'Start verification to access full payouts and account features.'}
                </p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="justify-between">
            <Button variant="secondary" onClick={refreshKycStatus} disabled={isRefreshingKyc}>
              <ArrowsClockwise className="h-4 w-4" weight="bold" />
              {isRefreshingKyc ? 'Refreshing…' : 'Refresh status'}
            </Button>
            {!isKycApproved ? (
              <Button onClick={startKycFlow} disabled={isStartingKyc}>
                <Shield className="h-4 w-4" weight="bold" />
                {isStartingKyc ? 'Opening…' : kycStatus === 'pending' ? 'Continue verification' : 'Start verification'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setKycOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
