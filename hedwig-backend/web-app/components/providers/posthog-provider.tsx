'use client';

import posthog from 'posthog-js';
import { PostHogProvider, usePostHog } from 'posthog-js/react';
import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

function PostHogIdentify() {
  const { user, authenticated } = usePrivy();
  const ph = usePostHog();

  useEffect(() => {
    if (!ph) return;
    if (authenticated && user?.id) {
      ph.identify(user.id, {
        email: user.email?.address,
        wallet: user.wallet?.address,
      });
    } else {
      ph.reset();
    }
  }, [authenticated, user, ph]);

  return null;
}

export function HedwigPostHogProvider({ children }: { children: React.ReactNode }) {
  const enabledInLocalDev = process.env.NEXT_PUBLIC_ENABLE_POSTHOG_LOCAL === 'true';
  const enabled = Boolean(POSTHOG_KEY) && (process.env.NODE_ENV !== 'development' || enabledInLocalDev);

  useEffect(() => {
    if (!enabled) return;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
    });
  }, [enabled]);

  if (!enabled) return <>{children}</>;

  return (
    <PostHogProvider client={posthog}>
      <PostHogIdentify />
      {children}
    </PostHogProvider>
  );
}
