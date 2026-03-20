'use client';

import Link from 'next/link';
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowSquareOut,
  CheckCircle,
  ClockCountdown,
  IdentificationCard,
  Lock,
  PencilSimple,
  Play,
  ShieldCheck,
  SpinnerGap,
  UploadSimple,
  Warning
} from '@phosphor-icons/react/dist/ssr';
import { usePrivy } from '@privy-io/react-auth';
import { hedwigApi, type KycStatusSummary, type UpdateUserProfileInput } from '@/lib/api/client';
import type { User } from '@/lib/models/entities';
import { PageHeader } from '@/components/data/page-header';
import { Avatar } from '@/components/ui/avatar';
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
import { useToast } from '@/components/providers/toast-provider';
import { useTutorial } from '@/components/tutorial/tutorial-provider';
import { cn } from '@/lib/utils';

const NOTIFICATION_STORAGE_KEY = 'hedwig-web-settings-notifications';

type NotificationPreferences = {
  paymentAlerts: boolean;
  deadlineAlerts: boolean;
  securityAlerts: boolean;
};

const defaultNotifications: NotificationPreferences = {
  paymentAlerts: true,
  deadlineAlerts: true,
  securityAlerts: true
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read selected image.'));
    };
    reader.onerror = () => reject(new Error('Could not read selected image.'));
    reader.readAsDataURL(file);
  });
}

function SurfaceCard({
  eyebrow,
  title,
  description,
  children,
  className
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]', className)}>
      <div className="border-b border-[#f2f4f7] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">{eyebrow}</p>
        <h2 className="mt-2 text-[17px] font-semibold text-[#181d27]">{title}</h2>
        <p className="mt-1 text-[13px] leading-5 text-[#717680]">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SettingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">{label}</p>
      <p className="mt-1.5 text-[14px] font-semibold text-[#181d27]">{value}</p>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-5 rounded-2xl border border-[#f2f4f7] bg-[#fcfcfd] px-4 py-3.5">
      <div>
        <p className="text-[14px] font-semibold text-[#181d27]">{label}</p>
        <p className="mt-1 text-[13px] leading-5 text-[#717680]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'group relative mt-0.5 inline-flex h-10 w-[92px] shrink-0 items-center rounded-full border px-1.5 shadow-xs transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2',
          checked
            ? 'border-[#bfd2ff] bg-[#eff4ff] text-[#1d4ed8]'
            : 'border-[#d5d7da] bg-white text-[#717680]'
        )}
      >
        <span
          className={cn(
            'pointer-events-none absolute inset-y-1 left-1.5 flex w-[44px] items-center justify-center rounded-full shadow-sm transition-all duration-200',
            checked
              ? 'translate-x-[36px] bg-[#2563eb] text-white'
              : 'translate-x-0 bg-[#181d27] text-white'
          )}
        >
          <span className="text-[11px] font-semibold">{checked ? 'On' : 'Off'}</span>
        </span>
        <span
          className={cn(
            'relative z-[1] flex w-1/2 items-center justify-center text-[11px] font-semibold transition-colors duration-200',
            checked ? 'text-[#98a2b3]' : 'text-transparent'
          )}
        >
          Off
        </span>
        <span
          className={cn(
            'relative z-[1] flex w-1/2 items-center justify-center text-[11px] font-semibold transition-colors duration-200',
            checked ? 'text-transparent' : 'text-[#98a2b3]'
          )}
        >
          On
        </span>
      </button>
    </div>
  );
}

function statusBadge(status: KycStatusSummary['status']) {
  if (status === 'approved') return { label: 'Verified', variant: 'success' as const };
  if (status === 'pending') return { label: 'Pending review', variant: 'warning' as const };
  if (status === 'rejected' || status === 'retry_required') return { label: 'Needs attention', variant: 'error' as const };
  return { label: 'Not started', variant: 'neutral' as const };
}

function statusCopy(status: KycStatusSummary['status']) {
  if (status === 'approved') {
    return 'Your identity verification is complete. You can continue using USD accounts, withdrawals, and other regulated flows.';
  }
  if (status === 'pending') {
    return 'Your identity review is in progress. Once the review is complete, we’ll reflect that here.';
  }
  if (status === 'rejected' || status === 'retry_required') {
    return 'Your verification needs another attempt with clearer information or updated documents.';
  }
  return 'Start identity verification to unlock regulated flows like USD accounts and off-ramping.';
}

function statusActionLabel(status: KycStatusSummary['status']) {
  if (status === 'approved') return 'Verified';
  if (status === 'pending') return 'Check status';
  if (status === 'rejected' || status === 'retry_required') return 'Retry verification';
  return 'Start verification';
}

export default function SettingsPage() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { toast } = useToast();
  const { resetTutorial } = useTutorial();

  const [profile, setProfile] = useState<User | null>(null);
  const [kyc, setKyc] = useState<KycStatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isKycBusy, setIsKycBusy] = useState(false);
  const [notifications, setNotifications] = useState<NotificationPreferences>(defaultNotifications);
  const [profileDraft, setProfileDraft] = useState<UpdateUserProfileInput>({ firstName: '', lastName: '', avatar: null });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as NotificationPreferences;
      setNotifications({ ...defaultNotifications, ...parsed });
    } catch {
      // Ignore malformed local settings.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    if (!ready || !authenticated) {
      if (ready) setLoading(false);
      return;
    }

    let isActive = true;

    async function loadSettings() {
      setLoading(true);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('Please sign in again to manage settings.');

        const [nextProfile, nextKyc] = await Promise.all([
          hedwigApi.getUserProfile({ accessToken, disableMockFallback: true }),
          hedwigApi.getKycStatus({ accessToken, disableMockFallback: true })
        ]);

        if (!isActive) return;
        setProfile(nextProfile);
        setKyc(nextKyc);
      } catch (error: any) {
        if (!isActive) return;
        toast({
          type: 'error',
          title: 'Failed to load settings',
          message: error?.message || 'Please refresh the page and try again.'
        });
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadSettings();
    return () => { isActive = false; };
  }, [ready, authenticated, getAccessToken, toast]);

  const fullName = useMemo(() => {
    if (!profile) return 'Hedwig user';
    return `${profile.firstName} ${profile.lastName}`.trim() || profile.email;
  }, [profile]);

  const currentKyc = kyc?.status || 'not_started';
  const kycBadge = statusBadge(currentKyc);

  const openEditProfile = () => {
    if (!profile) return;
    setProfileDraft({
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      avatar: profile.avatarUrl || null
    });
    setAvatarPreview(profile.avatarUrl || null);
    setIsProfileDialogOpen(true);
  };

  const handleAvatarSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ type: 'error', title: 'Unsupported file', message: 'Please choose an image file.' });
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAvatarPreview(dataUrl);
      setProfileDraft((current) => ({ ...current, avatar: dataUrl }));
    } catch (error: any) {
      toast({ type: 'error', title: 'Image upload failed', message: error?.message || 'Please try another image.' });
    } finally {
      event.target.value = '';
    }
  };

  const handleSaveProfile = async () => {
    if (!profileDraft.firstName?.trim()) {
      toast({ type: 'error', title: 'First name required', message: 'Please add your first name before saving.' });
      return;
    }

    if (!ready || !authenticated) {
      toast({ type: 'error', title: 'Session expired', message: 'Please sign in again.' });
      return;
    }

    setIsSavingProfile(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Please sign in again to update your profile.');

      const updated = await hedwigApi.updateUserProfile(
        {
          firstName: profileDraft.firstName?.trim(),
          lastName: profileDraft.lastName?.trim() || '',
          avatar: profileDraft.avatar ?? null
        },
        { accessToken, disableMockFallback: true }
      );

      setProfile(updated);
      setIsProfileDialogOpen(false);
      toast({ type: 'success', title: 'Profile updated', message: 'Your name and profile image are now up to date.' });
    } catch (error: any) {
      toast({ type: 'error', title: 'Could not update profile', message: error?.message || 'Please try again.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleStartOrCheckKyc = async () => {
    if (!ready || !authenticated) {
      toast({ type: 'error', title: 'Session expired', message: 'Please sign in again.' });
      return;
    }

    setIsKycBusy(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Please sign in again to continue verification.');

      if (currentKyc === 'pending') {
        const checked = await hedwigApi.checkKycStatus({ accessToken, disableMockFallback: true });
        setKyc((current) => ({
          status: checked.status,
          isApproved: checked.isApproved,
          reviewedAt: current?.reviewedAt || null,
          sessionId: current?.sessionId || null
        }));

        toast({
          type: checked.isApproved ? 'success' : checked.status === 'pending' ? 'info' : 'warning',
          title: checked.isApproved ? 'Identity verified' : checked.status === 'pending' ? 'Still under review' : 'Verification needs attention',
          message: checked.isApproved
            ? 'Your verification is complete.'
            : checked.status === 'pending'
              ? 'Your submission is still under review.'
              : 'Please restart the flow and resubmit your documents.'
        });
        return;
      }

      const started = await hedwigApi.startKyc({ accessToken, disableMockFallback: true });

      if (started.status === 'approved') {
        setKyc({ status: 'approved', isApproved: true, reviewedAt: kyc?.reviewedAt || null, sessionId: kyc?.sessionId || null });
        toast({ type: 'success', title: 'Identity already verified', message: 'No further action is needed.' });
        return;
      }

      setKyc((current) => ({
        status: started.status,
        isApproved: started.status === 'approved',
        sessionId: started.sessionId ?? current?.sessionId ?? null,
        reviewedAt: current?.reviewedAt ?? null
      }));

      if (started.url) {
        const popup = window.open(started.url, '_blank', 'noopener,noreferrer');
        if (!popup) window.location.assign(started.url);
        toast({
          type: 'info',
          title: 'Verification opened',
          message: 'Complete the verification flow, then come back here and check your status.'
        });
      } else if (started.message) {
        toast({ type: 'info', title: 'Verification updated', message: started.message });
      }
    } catch (error: any) {
      toast({ type: 'error', title: 'Verification unavailable', message: error?.message || 'Please try again in a moment.' });
    } finally {
      setIsKycBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Profile & security"
          description="Manage your Hedwig identity, verification status, and wallet security in one place."
        />
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="h-[220px] rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]" />
            <div className="h-[220px] rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]" />
          </div>
          <div className="space-y-6">
            <div className="h-[260px] rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]" />
            <div className="h-[180px] rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Profile & security"
          description="Manage your Hedwig identity, verification status, and wallet security in one place."
        />

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <SurfaceCard
              eyebrow="Profile"
              title="Personal details"
              description="Keep your name and profile image current across Hedwig."
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 text-lg" label={fullName} src={profile?.avatarUrl || undefined} />
                  <div>
                    <p className="text-[18px] font-semibold text-[#181d27]">{fullName}</p>
                    <p className="mt-1 text-[14px] text-[#717680]">{profile?.email || 'No email available'}</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={openEditProfile}>
                  <PencilSimple className="h-4 w-4" weight="bold" />
                  Edit profile
                </Button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <SettingStat label="First name" value={profile?.firstName || 'Not set'} />
                <SettingStat label="Last name" value={profile?.lastName || 'Not set'} />
                <SettingStat label="Profile photo" value={profile?.avatarUrl ? 'Added' : 'Not added'} />
              </div>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Notifications"
              title="Stay in sync"
              description="Control the on-screen reminders that help you keep work and money moving."
            >
              <div className="space-y-3">
                <ToggleRow
                  label="Payment activity"
                  description="Show confirmations when invoices, links, or wallet transactions settle."
                  checked={notifications.paymentAlerts}
                  onChange={(value) => setNotifications((current) => ({ ...current, paymentAlerts: value }))}
                />
                <ToggleRow
                  label="Deadlines and reminders"
                  description="Keep upcoming milestones, invoices, and reminder alerts visible while you work."
                  checked={notifications.deadlineAlerts}
                  onChange={(value) => setNotifications((current) => ({ ...current, deadlineAlerts: value }))}
                />
                <ToggleRow
                  label="Security notices"
                  description="Highlight sign-in changes, identity verification updates, and wallet-sensitive actions."
                  checked={notifications.securityAlerts}
                  onChange={(value) => setNotifications((current) => ({ ...current, securityAlerts: value }))}
                />
              </div>
            </SurfaceCard>
          </div>

          <div className="space-y-6">
            <SurfaceCard
              eyebrow="Identity verification"
              title="Verification status"
              description="Use your live verification status to unlock regulated Hedwig flows."
            >
              <div className="rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eff4ff] text-[#2563eb]">
                      {currentKyc === 'approved' ? (
                        <CheckCircle className="h-5 w-5" weight="fill" />
                      ) : currentKyc === 'pending' ? (
                        <ClockCountdown className="h-5 w-5" weight="fill" />
                      ) : (
                        <ShieldCheck className="h-5 w-5" weight="fill" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-semibold text-[#181d27]">Identity verification</p>
                        <Badge variant={kycBadge.variant}>{kycBadge.label}</Badge>
                      </div>
                      <p className="mt-1 text-[13px] leading-5 text-[#717680]">{statusCopy(currentKyc)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-1">
                  <SettingStat label="Session" value={kyc?.sessionId ? `${kyc.sessionId.slice(0, 8)}…` : 'Not started'} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={handleStartOrCheckKyc} disabled={isKycBusy || currentKyc === 'approved'}>
                    {isKycBusy ? <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" /> : <ShieldCheck className="h-4 w-4" weight="bold" />}
                    {statusActionLabel(currentKyc)}
                  </Button>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="App"
              title="Walkthrough"
              description="Replay the guided tour to explore any feature at your own pace."
            >
              <div className="flex items-center justify-between rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eff4ff] text-[#2563eb]">
                    <Play className="h-5 w-5" weight="fill" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#181d27]">Replay walkthrough</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#717680]">
                      Get a guided tour of every section of the app.
                    </p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={resetTutorial}>
                  <Play className="h-4 w-4" weight="bold" />
                  Replay
                </Button>
              </div>
            </SurfaceCard>

            <SurfaceCard
              eyebrow="Security"
              title="Wallet recovery"
              description="Export your embedded wallet only when you’re ready to store it securely offline."
            >
              <div className="rounded-2xl border border-[#fddcab] bg-[#fffaeb] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#b54708] ring-1 ring-[#fedf89]">
                    <Warning className="h-5 w-5" weight="fill" />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-[#7a2e0e]">Keep exported keys offline</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#934b16]">
                      Anyone with your private key has full control of your funds. Export only on a device you trust.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f5f5f5] text-[#525866]">
                    <Lock className="h-5 w-5" weight="fill" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#181d27]">Export wallet</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#717680]">
                      Open the secure export flow for your Base and Solana embedded wallets.
                    </p>
                  </div>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/export-wallet">
                    <ArrowSquareOut className="h-4 w-4" weight="bold" />
                    Open
                  </Link>
                </Button>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </div>

      <Dialog open={isProfileDialogOpen} onOpenChange={(open) => { if (!isSavingProfile) setIsProfileDialogOpen(open); }}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Update the name and photo that appear across your Hedwig workspace.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="flex flex-col gap-4 rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 text-base" label={fullName} src={avatarPreview || undefined} />
                <div>
                  <p className="text-[14px] font-semibold text-[#181d27]">Profile image</p>
                  <p className="mt-1 text-[13px] text-[#717680]">PNG or JPG works best. We’ll store it against your Hedwig profile.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <input ref={fileInputRef} className="hidden" type="file" accept="image/*" onChange={handleAvatarSelect} />
                <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <UploadSimple className="h-4 w-4" weight="bold" />
                  Upload
                </Button>
                {avatarPreview ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAvatarPreview(null);
                      setProfileDraft((current) => ({ ...current, avatar: null }));
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">First name</label>
                <Input
                  value={profileDraft.firstName || ''}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, firstName: event.target.value }))}
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Last name</label>
                <Input
                  value={profileDraft.lastName || ''}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, lastName: event.target.value }))}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[#f2f4f7] bg-[#fcfcfd] px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#f5f5f5] text-[#717680]">
                  <IdentificationCard className="h-4 w-4" weight="fill" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#181d27]">Email</p>
                  <p className="text-[13px] text-[#717680]">{profile?.email || 'No email available'}</p>
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsProfileDialogOpen(false)} disabled={isSavingProfile}>Cancel</Button>
            <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
              {isSavingProfile ? <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" /> : <PencilSimple className="h-4 w-4" weight="bold" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
