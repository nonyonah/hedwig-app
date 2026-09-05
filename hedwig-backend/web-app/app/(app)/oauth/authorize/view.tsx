'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

function ConsentInner({ accessToken }: { accessToken: string | null }) {
  const params = useSearchParams();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const clientId = params.get('client_id') ?? 'unknown client';

  const decide = async (allow: boolean) => {
    if (!allow) {
      window.location.href = '/dashboard';
      return;
    }
    setWorking(true);
    setError('');
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
      const body: Record<string, string> = {};
      params.forEach((v, k) => {
        body[k] = v;
      });
      const res = await fetch(`${apiBase}/oauth/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.redirect_to) throw new Error(json?.error ?? 'consent failed');
      window.location.href = json.redirect_to as string;
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6 py-16">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Authorize access</h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
          <span className="font-mono">{clientId}</span> is requesting read-only access to your Hedwig account
          (profile, agents, approvals, cards, ledger summary).
        </p>
      </div>
      {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={() => decide(true)} disabled={working || !accessToken}>
          {working ? 'Authorizing…' : 'Authorize'}
        </Button>
        <Button variant="ghost" onClick={() => decide(false)}>
          Deny
        </Button>
      </div>
    </div>
  );
}

export function OAuthConsentClient({ accessToken }: { accessToken: string | null }) {
  return (
    <Suspense>
      <ConsentInner accessToken={accessToken} />
    </Suspense>
  );
}
