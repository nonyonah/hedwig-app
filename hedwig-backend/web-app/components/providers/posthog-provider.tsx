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
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
    });
  }, []);

  if (!POSTHOG_KEY) return <>{children}</>;

  return (
    <PostHogProvider client={posthog}>
      <PostHogIdentify />
      {children}
    </PostHogProvider>
  );
}
