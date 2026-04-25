'use client';

import Image from 'next/image';
import { useLoginWithEmail, useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft, Minus, Plus, SpinnerGap } from '@/components/ui/lucide-icons';
import { backendConfig } from '@/lib/auth/config';

type Stage = 'landing' | 'otp' | 'loading' | 'profile' | 'goal' | 'error';

const PRESETS = [
  { label: 'Starter', value: 1000 },
  { label: 'Growing', value: 5000 },
  { label: 'Established', value: 10000 },
] as const;

function getIdentityDetails(user: any) {
  const email = user?.email?.address || user?.google?.email || user?.apple?.email || '';
  const firstName = user?.google?.name?.split?.(' ')?.[0] || user?.apple?.firstName || user?.firstName || '';
  const lastName = user?.google?.name?.split?.(' ')?.slice(1).join(' ') || user?.apple?.lastName || user?.lastName || '';
  return { email, firstName, lastName };
}

export default function SignInPage() {
  const { authenticated, ready, user, getAccessToken } = usePrivy();
  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail();
  const { initOAuth } = useLoginWithOAuth();
  const router = useRouter();

  const bootstrapped = useRef(false);

  const [stage, setStage] = useState<Stage>('landing');
  const [loadingLabel, setLoadingLabel] = useState('Please wait…');
  const [errorMessage, setErrorMessage] = useState('');

  // Landing form
  const [emailInput, setEmailInput] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);

  // OTP form
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Profile
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Goal
  const [target, setTarget] = useState(5000);
  const [selectedPreset, setSelectedPreset] = useState<string | null>('Growing');

  const identity = useMemo(() => getIdentityDetails(user), [user]);

  /* ── session helpers ── */
  const finalizeSession = async (accessToken: string) => {
    setStage('loading');
    setLoadingLabel('Please wait…');
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: accessToken }),
    });
    if (!res.ok) throw new Error('Could not finalize sign-in. Please try again.');
    router.replace('/dashboard');
  };

  const bootstrapUser = async () => {
    setErrorMessage('');
    setStage('loading');
    setLoadingLabel('Please wait…');

    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Unable to get an access token from Privy.');

    setToken(accessToken);
    setEmail(identity.email || '');
    setFirstName((p) => p || identity.firstName || '');
    setLastName((p) => p || identity.lastName || '');

    const meRes = await fetch(`${backendConfig.apiBaseUrl}/api/auth/me`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });

    if (meRes.status === 404) { setStage('profile'); return; }
    if (!meRes.ok) throw new Error('We could not load your account details.');

    const payload = await meRes.json().catch(() => ({}));
    const apiUser = payload?.data?.user;
    setEmail(String(apiUser?.email || identity.email || ''));
    setFirstName(String(apiUser?.firstName || identity.firstName || '').trim());
    setLastName(String(apiUser?.lastName || identity.lastName || '').trim());
    await finalizeSession(accessToken);
  };

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) { bootstrapped.current = false; return; }
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    void (async () => {
      try { await bootstrapUser(); }
      catch (err: any) { setStage('error'); setErrorMessage(err?.message || 'Sign-in failed. Please try again.'); }
    })();
  }, [authenticated, ready]);

  /* ── handlers ── */
  const handleSendCode = async () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return;
    setIsSendingCode(true);
    setErrorMessage('');
    try {
      await sendCode({ email: trimmed });
      setStage('otp');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not send code. Please try again.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.trim().length < 6) return;
    setIsVerifying(true);
    setErrorMessage('');
    try {
      await loginWithCode({ code: otp.trim() });
      // authenticated useEffect will fire and run bootstrapUser
    } catch (err: any) {
      setErrorMessage(err?.message || 'Invalid code. Please try again.');
      setIsVerifying(false);
    }
  };

  const handleOAuth = (provider: 'google' | 'apple') => {
    setErrorMessage('');
    initOAuth({ provider });
  };

  const setGoalFromValue = (value: number) => {
    const next = Math.max(0, Math.round(value));
    setTarget(next);
    setSelectedPreset(PRESETS.find((p) => p.value === next)?.label ?? null);
  };

  const submitProfile = async () => {
    if (!token) { setStage('error'); setErrorMessage('Session missing. Please sign in again.'); return; }
    if (!firstName.trim()) { setErrorMessage('First name is required.'); return; }
    if (!email.trim()) { setErrorMessage('No email found from your account provider.'); return; }
    setIsSubmitting(true); setErrorMessage('');
    try {
      const res = await fetch(`${backendConfig.apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      if (!res.ok) { const p = await res.json().catch(() => null); throw new Error(p?.error?.message || 'Could not save your profile.'); }
      setStage('goal');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save your profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitGoal = async () => {
    if (!token) { setStage('error'); setErrorMessage('Session missing. Please sign in again.'); return; }
    setIsSubmitting(true); setErrorMessage('');
    try {
      const res = await fetch(`${backendConfig.apiBaseUrl}/api/users/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monthlyTarget: target }),
      });
      if (!res.ok) { const p = await res.json().catch(() => null); throw new Error(p?.error?.message || 'Could not save your goal.'); }
      await finalizeSession(token);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not complete onboarding.');
      setStage('goal');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── layout shell ── */
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-16">
      <div className="w-full max-w-[340px]">

        {/* Logo mark */}
        <div className="mb-8">
          <Image src="/hedwig-logo.png" alt="Hedwig" width={32} height={32} priority />
        </div>

        {/* ── Landing ── */}
        {stage === 'landing' && (
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#181d27]">Sign in to Hedwig</h1>
            <p className="mt-2 text-[13px] text-[#717680]">
              Manage projects, invoices, and payments in one workspace.
            </p>

            <div className="mt-8 space-y-3">
              {/* Google */}
              <button
                type="button"
                onClick={() => handleOAuth('google')}
                className="flex w-full items-center justify-center gap-2.5 rounded-full border border-[#e9eaeb] bg-white px-4 py-2.5 text-[14px] font-medium text-[#181d27] transition hover:bg-[#fafafa]"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              {/* Apple */}
              <button
                type="button"
                onClick={() => handleOAuth('apple')}
                className="flex w-full items-center justify-center gap-2.5 rounded-full border border-[#e9eaeb] bg-white px-4 py-2.5 text-[14px] font-medium text-[#181d27] transition hover:bg-[#fafafa]"
              >
                <Image
                  src="/icons/apple-logo.svg"
                  alt=""
                  width={15}
                  height={18}
                  aria-hidden
                />
                Continue with Apple
              </button>
            </div>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#f2f4f7]" />
              <span className="text-[12px] text-[#c1c5cd]">or</span>
              <div className="h-px flex-1 bg-[#f2f4f7]" />
            </div>

            {/* Email */}
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#414651]">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                  className="h-10 w-full rounded-xl border border-[#e9eaeb] bg-white px-3.5 text-[14px] text-[#181d27] placeholder:text-[#c1c5cd] outline-none transition focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/10"
                />
              </div>

              {errorMessage && (
                <p className="rounded-lg border border-[#fda29b] bg-[#fef3f2] px-3 py-2 text-[12px] text-[#b42318]">
                  {errorMessage}
                </p>
              )}

              <button
                type="button"
                disabled={isSendingCode || !emailInput.trim()}
                onClick={handleSendCode}
                className="flex h-10 w-full items-center justify-center rounded-full bg-[#2563eb] text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSendingCode ? 'Sending…' : 'Continue'}
              </button>
            </div>

            <p className="mt-6 text-center text-[12px] text-[#c1c5cd]">
              By continuing, you agree to our{' '}
              <a href="/terms" className="underline hover:text-[#717680]">Terms</a>
              {' & '}
              <a href="/privacy" className="underline hover:text-[#717680]">Privacy</a>.
            </p>
          </div>
        )}

        {/* ── OTP ── */}
        {stage === 'otp' && (
          <div>
            <button
              type="button"
              onClick={() => { setStage('landing'); setOtp(''); setErrorMessage(''); }}
              className="mb-6 flex items-center gap-1.5 text-[13px] text-[#a4a7ae] transition hover:text-[#717680]"
            >
              <CaretLeft className="h-3.5 w-3.5" weight="bold" />
              Back
            </button>

            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#181d27]">Check your inbox</h1>
            <p className="mt-1.5 text-[14px] text-[#a4a7ae]">
              We sent a 6-digit code to{' '}
              <span className="font-medium text-[#535862]">{emailInput}</span>.
            </p>

            <div className="mt-8 space-y-3">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#414651]">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                  autoFocus
                  className="h-10 w-full rounded-xl border border-[#e9eaeb] bg-white px-3.5 text-center text-[18px] font-semibold tracking-[0.2em] text-[#181d27] placeholder:text-[#c1c5cd] outline-none transition focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/10"
                />
              </div>

              {errorMessage && (
                <p className="rounded-lg border border-[#fda29b] bg-[#fef3f2] px-3 py-2 text-[12px] text-[#b42318]">
                  {errorMessage}
                </p>
              )}

              <button
                type="button"
                disabled={isVerifying || otp.length < 6}
                onClick={handleVerifyOtp}
                className="flex h-10 w-full items-center justify-center rounded-full bg-[#2563eb] text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isVerifying ? 'Verifying…' : 'Continue'}
              </button>

              <button
                type="button"
                onClick={handleSendCode}
                disabled={isSendingCode}
                className="flex h-10 w-full items-center justify-center rounded-full border border-[#e9eaeb] text-[13px] font-medium text-[#717680] transition hover:bg-[#fafafa] disabled:opacity-50"
              >
                {isSendingCode ? 'Sending…' : 'Resend code'}
              </button>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {stage === 'loading' && (
          <div className="py-12 text-center">
            <SpinnerGap className="mx-auto h-6 w-6 animate-spin text-[#2563eb]" weight="bold" />
            <p className="mt-4 text-[14px] text-[#a4a7ae]">{loadingLabel}</p>
          </div>
        )}

        {/* ── Error ── */}
        {stage === 'error' && (
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#181d27]">Something went wrong</h1>
            <p className="mt-1.5 text-[14px] text-[#a4a7ae]">{errorMessage || 'Please try again.'}</p>
            <button
              type="button"
              onClick={() => { setStage('landing'); setErrorMessage(''); }}
              className="mt-8 flex h-10 w-full items-center justify-center rounded-full bg-[#2563eb] text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Profile ── */}
        {stage === 'profile' && (
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#181d27]">Tell us about yourself</h1>
            <p className="mt-1.5 text-[14px] text-[#a4a7ae]">This is how you'll appear in Hedwig.</p>

            <div className="mt-8 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#414651]">First name</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First"
                    className="h-10 w-full rounded-xl border border-[#e9eaeb] bg-white px-3.5 text-[14px] text-[#181d27] placeholder:text-[#c1c5cd] outline-none transition focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#414651]">Last name</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last"
                    className="h-10 w-full rounded-xl border border-[#e9eaeb] bg-white px-3.5 text-[14px] text-[#181d27] placeholder:text-[#c1c5cd] outline-none transition focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/10"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#414651]">Email</label>
                <input
                  value={email}
                  disabled
                  className="h-10 w-full rounded-xl border border-[#f2f4f7] bg-[#fafafa] px-3.5 text-[14px] text-[#a4a7ae]"
                />
              </div>

              {errorMessage && (
                <p className="rounded-lg border border-[#fda29b] bg-[#fef3f2] px-3 py-2 text-[12px] text-[#b42318]">
                  {errorMessage}
                </p>
              )}

              <button
                type="button"
                disabled={isSubmitting}
                onClick={submitProfile}
                className="flex h-10 w-full items-center justify-center rounded-full bg-[#2563eb] text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : 'Continue'}
              </button>

              <p className="text-center text-[12px] text-[#c1c5cd]">Step 1 of 2</p>
            </div>
          </div>
        )}

        {/* ── Goal ── */}
        {stage === 'goal' && (
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#181d27]">Set your monthly goal</h1>
            <p className="mt-1.5 text-[14px] text-[#a4a7ae]">How much do you want to earn each month?</p>

            <div className="mt-8 space-y-6">
              {/* Preset pills */}
              <div className="flex gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setGoalFromValue(preset.value)}
                    className={`flex-1 rounded-full py-1.5 text-[12px] font-semibold transition ${
                      selectedPreset === preset.label
                        ? 'bg-[#2563eb] text-white'
                        : 'border border-[#e9eaeb] text-[#717680] hover:bg-[#fafafa]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Stepper */}
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setGoalFromValue(target - 500)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e9eaeb] text-[#414651] transition hover:bg-[#fafafa]"
                >
                  <Minus className="h-4 w-4" weight="bold" />
                </button>
                <div className="text-center">
                  <p className="text-[40px] font-bold leading-none tracking-[-0.03em] text-[#181d27]">
                    ${target.toLocaleString('en-US')}
                  </p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-[#c1c5cd]">per month</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGoalFromValue(target + 500)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e9eaeb] text-[#414651] transition hover:bg-[#fafafa]"
                >
                  <Plus className="h-4 w-4" weight="bold" />
                </button>
              </div>

              {errorMessage && (
                <p className="rounded-lg border border-[#fda29b] bg-[#fef3f2] px-3 py-2 text-[12px] text-[#b42318]">
                  {errorMessage}
                </p>
              )}

              <button
                type="button"
                disabled={isSubmitting}
                onClick={submitGoal}
                className="flex h-10 w-full items-center justify-center rounded-full bg-[#2563eb] text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : 'Get started'}
              </button>

              <button
                type="button"
                onClick={() => setStage('profile')}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-[#e9eaeb] text-[13px] font-medium text-[#717680] transition hover:bg-[#fafafa]"
              >
                <CaretLeft className="h-3.5 w-3.5" weight="bold" />
                Back
              </button>

              <p className="text-center text-[12px] text-[#c1c5cd]">Step 2 of 2</p>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
