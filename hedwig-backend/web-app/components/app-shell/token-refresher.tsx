'use client';

import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

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
        // Non-critical
      }
    }

    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ready, authenticated, getAccessToken]);

  return null;
}
