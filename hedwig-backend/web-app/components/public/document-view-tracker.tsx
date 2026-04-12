'use client';

import { useEffect } from 'react';
import { backendConfig } from '@/lib/auth/config';

export function DocumentViewTracker({
  documentId,
}: {
  documentId: string;
}) {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await fetch(`${backendConfig.apiBaseUrl}/api/documents/${documentId}/viewed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewer: 'public_web' }),
          cache: 'no-store',
        });
      } catch {
        // Non-blocking tracking call.
      }
    };

    if (!cancelled) {
      void run();
    }

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return null;
}
