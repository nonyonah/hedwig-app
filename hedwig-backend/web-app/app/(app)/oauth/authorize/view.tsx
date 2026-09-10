'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

function ConsentInner({ accessToken }: { accessToken: string | null }) {
  const params = useSearchParams();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const clientId = params.get('client_id') ?? 'unknown client';
  const requestedScopes = (params.get('scope') ?? 'read').split(' ').filter(Boolean);
  const scopeDescriptions: Record<string, string> = {
    read: 'View profile, agents, approvals, cards, invoices, and ledger (read-only).',
    payments: 'Match receipts to invoices and record invoice payments (two-step confirmed).',
    cards: 'View and manage virtual cards.',
    kyc: 'Start identity verification sessions.',
  };

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
          <span className="font-mono">{clientId}</span> is requesting access to your Hedwig account with these
          permissions:
        </p>
      </div>
      <ul className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        {requestedScopes.map((s) => (
          <li key={s} className="text-[13px]">
            <span className="font-mono font-semibold text-[var(--color-foreground)]">{s}</span>
            <span className="text-[var(--color-text-tertiary)]"> — {scopeDescriptions[s] ?? 'Unknown permission.'}</span>
          </li>
        ))}
      </ul>
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
