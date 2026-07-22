'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { X } from '@/components/ui/lucide-icons';

/* ── Exit-intent hook ─────────────────────────────────────────── */

function useExitIntent() {
  const [showExit, setShowExit] = useState(false);
  const dismissed = useRef(false);

  useEffect(() => {
    if (dismissed.current) return;
    const handler = (e: MouseEvent) => {
      if (dismissed.current) return;
      if (e.clientY <= 5) {
        dismissed.current = true;
        setShowExit(true);
      }
    };
    document.addEventListener('mouseleave', handler);
    return () => document.removeEventListener('mouseleave', handler);
  }, []);

  const dismiss = useCallback(() => {
    setShowExit(false);
  }, []);

  return { showExit, dismiss, setShowExit };
}

/* ── Email capture dialog ─────────────────────────────────────── */

function EmailCaptureDialog({
  open,
  onClose,
  title = 'Get product updates',
  submitLabel = 'Subscribe',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  submitLabel?: string;
}) {
  const posthog = usePostHog();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email');
      return;
    }
    posthog?.capture?.('email_captured', { email: trimmed, source: 'landing_page' });
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6 shadow-2xl ring-1 ring-[var(--color-border)]">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[16px] font-semibold text-[var(--color-foreground)]">{title}</h3>
          <button type="button" onClick={onClose} className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-foreground)]">
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>
        {submitted ? (
          <p className="mt-4 text-[13px] text-[var(--color-text-tertiary)]">You&rsquo;re on the list. We&rsquo;ll keep you posted.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)]"
              autoFocus
            />
            {error && <p className="text-[12px] text-[var(--color-danger)]">{error}</p>}
            <button
              type="button"
              onClick={handleSubmit}
              className="w-full rounded-full bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--color-primary-dark)]"
            >
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Exit survey dialog ───────────────────────────────────────── */

function ExitSurveyDialog({ open, onClose, onFinish }: { open: boolean; onClose: () => void; onFinish: () => void }) {
  const posthog = usePostHog();
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  const options = [
    { value: 'pricing', label: 'Pricing' },
    { value: 'not_sure', label: "Wasn't sure how it works" },
    { value: 'not_ready', label: 'Not ready yet' },
    { value: 'browsing', label: 'Just browsing' },
    { value: 'other', label: 'Other' },
  ];

  const handleSubmit = () => {
    if (!selected) return;
    posthog?.capture?.('exit_survey', { reason: selected });
    setSubmitted(true);
    setTimeout(() => onFinish(), 1200);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6 shadow-2xl ring-1 ring-[var(--color-border)]">
        <button type="button" onClick={onClose} className="float-right text-[var(--color-text-muted)] hover:text-[var(--color-foreground)]">
          <X className="h-4 w-4" weight="bold" />
        </button>
        {submitted ? (
          <div className="pt-4">
            <p className="text-[13px] text-[var(--color-text-tertiary)]">Thanks for the feedback.</p>
          </div>
        ) : (
          <div className="pt-4">
            <h3 className="text-[16px] font-semibold text-[var(--color-foreground)]">What stopped you from signing up today?</h3>
            <div className="mt-4 space-y-2">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelected(opt.value)}
                  className={`w-full rounded-xl px-4 py-2.5 text-left text-[13px] transition ${
                    selected === opt.value
                      ? 'border border-[var(--color-primary)] bg-[var(--color-accent-soft)] font-semibold text-[var(--color-primary)]'
                      : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-input)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!selected}
              onClick={handleSubmit}
              className="mt-4 w-full rounded-full bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Demo sign-up prompt dialog ───────────────────────────────── */

function SignUpPromptDialog({
  open,
  onClose,
  onDismiss,
}: {
  open: boolean;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const posthog = usePostHog();
  if (!open) return null;

  const handleCreate = () => {
    posthog?.capture?.('signup_prompt_clicked', {});
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6 shadow-2xl ring-1 ring-[var(--color-border)]">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[16px] font-semibold text-[var(--color-foreground)]">
            Create your account to manage payments, invoicing, and books in one place
          </h3>
          <button type="button" onClick={onDismiss} className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-foreground)]">
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>
        <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
          Send invoices, receive payments in USDC, track time and expenses — all from one account.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <a
            href="/sign-in"
            onClick={handleCreate}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--color-primary)] px-4 text-[13px] font-semibold text-white transition hover:bg-[var(--color-primary-dark)]"
          >
            Create your account
          </a>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--color-border)] text-[13px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Demo event tracking ──────────────────────────────────────── */

const HIGH_INTENT_ACTIONS = new Set(['viewed_bookkeeping', 'tried_payment']);

export function useDemoTracking() {
  const posthog = usePostHog();
  const [promptOpen, setPromptOpen] = useState(false);
  const [emailFallbackOpen, setEmailFallbackOpen] = useState(false);
  const dismissedOnce = useRef(false);
  const actionsSinceDismiss = useRef(0);

  const trackDemoStart = useCallback(() => {
    posthog?.capture?.('demo_started');
  }, [posthog]);

  const trackDemoAction = useCallback(
    (actionName: string) => {
      posthog?.capture?.('demo_action', { action_name: actionName, timestamp: Date.now() });

      if (!HIGH_INTENT_ACTIONS.has(actionName)) return;

      if (dismissedOnce.current && actionsSinceDismiss.current < 1) {
        actionsSinceDismiss.current += 1;
        setPromptOpen(true);
        posthog?.capture?.('signup_prompt_shown', { trigger: 're-trigger', action: actionName });
      } else if (!dismissedOnce.current) {
        setPromptOpen(true);
        posthog?.capture?.('signup_prompt_shown', { trigger: 'first', action: actionName });
      }
    },
    [posthog],
  );

  const dismissPrompt = useCallback(() => {
    setPromptOpen(false);
    dismissedOnce.current = true;
    setEmailFallbackOpen(true);
  }, []);

  const closeEmailFallback = useCallback(() => {
    setEmailFallbackOpen(false);
  }, []);

  const closePrompt = useCallback(() => {
    setPromptOpen(false);
    dismissedOnce.current = true;
  }, []);

  return {
    promptOpen,
    emailFallbackOpen,
    trackDemoStart,
    trackDemoAction,
    dismissPrompt,
    closeEmailFallback,
    closePrompt,
  };
}

/* ── Main client mount — adds exit-intent, email capture, survey ── */

export function LandingPageClientMount({
  children,
  childrenForDemo,
}: {
  children: React.ReactNode;
  childrenForDemo?: React.ReactNode;
}) {
  const { showExit, dismiss: dismissExit, setShowExit } = useExitIntent();
  const [exitStage, setExitStage] = useState<'survey' | 'email' | null>(null);
  const posthog = usePostHog();

  useEffect(() => {
    if (showExit) {
      setExitStage('survey');
    }
  }, [showExit]);

  // Scroll-depth trigger: past features section
  useEffect(() => {
    const featuresEl = document.getElementById('features');
    if (!featuresEl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          posthog?.capture?.('scroll_depth_features', {});
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(featuresEl);
    return () => observer.disconnect();
  }, [posthog]);

  const closeSurvey = useCallback(() => {
    setExitStage(null);
    setShowExit(false);
  }, [setShowExit]);

  const finishSurvey = useCallback(() => {
    setExitStage('email');
  }, []);

  const closeEmail = useCallback(() => {
    setExitStage(null);
    setShowExit(false);
  }, [setShowExit]);

  const captureEmailOnly = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setExitStage('email');
    },
    [],
  );

  return (
    <>
      {children}

      {/* Exit survey (shown first on exit-intent) */}
      <ExitSurveyDialog
        open={exitStage === 'survey'}
        onFinish={finishSurvey}
        onClose={() => {
          closeSurvey();
          posthog?.capture?.('exit_survey_dismissed');
        }}
      />

      {/* Email capture (shown after survey submit or if dismissed) */}
      {exitStage === 'email' && (
        <EmailCaptureDialog
          open
          title="Get product updates"
          submitLabel="Subscribe"
          onClose={closeEmail}
        />
      )}

      {/* In-demo sign-up prompts rendered via useDemoTracking */}
      {childrenForDemo}
    </>
  );
}

/* ── Inline email field (for landing page bottom section) ── */

function EmailCaptureField() {
  const posthog = usePostHog();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email');
      return;
    }
    posthog?.capture?.('email_captured', { email: trimmed, source: 'landing_page_bottom' });
    setSubmitted(true);
  };

  if (submitted) {
    return <p className="mt-4 text-[13px] text-[var(--color-text-tertiary)]">You&rsquo;re on the list. We&rsquo;ll keep you posted.</p>;
  }

  return (
    <div className="mx-auto mt-6 flex max-w-[340px] gap-2">
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setError(''); }}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)]"
      />
      <button
        type="button"
        onClick={handleSubmit}
        className="shrink-0 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[var(--color-primary-dark)]"
      >
        Subscribe
      </button>
      {error && <p className="text-[12px] text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

export { EmailCaptureDialog, SignUpPromptDialog, EmailCaptureField };
