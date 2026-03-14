'use client';

import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';

/**
 * Silently refreshes the hedwig_access_token cookie so server components
 * always have a valid Privy access token. Runs every 20 minutes.
 *
 * Privy access tokens expire after ~6 hours; getAccessToken() auto-refreshes
 * the underlying Privy token, so this just keeps the cookie in sync.
 */
const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

export function TokenRefresher() {
  const { authenticated, ready, getAccessToken } = usePrivy();

  useEffect(() => {
    if (!ready || !authenticated) return;

    async function refresh() {
      try {
        const token = await getAccessToken();
        if (!token) return;
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
      } catch {
        // Non-critical — the user will just hit an auth error on the next server request
      }
    }

    // Refresh immediately on mount, then on interval
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ready, authenticated]);

  return null;
}
