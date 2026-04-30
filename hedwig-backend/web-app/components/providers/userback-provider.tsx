'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import Userback, { getUserback, type UserbackOptions, type UserbackWidget } from '@userback/widget';

type UserbackIdentity = {
  id: string;
  info: {
    name: string;
    email: string;
  };
};

function resolveIdentity(user: any): UserbackIdentity | null {
  if (!user) return null;

  const email = String(
    user?.email?.address ||
    user?.google?.email ||
    user?.apple?.email ||
    (Array.isArray(user?.linkedAccounts)
      ? user.linkedAccounts.find((account: any) => account?.type === 'email')?.address
      : '') ||
    ''
  ).trim();
  if (!email) return null;

  const name = String(
    user?.google?.name ||
    [user?.apple?.firstName, user?.apple?.lastName].filter(Boolean).join(' ') ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    email
  ).trim();
  const id = String(user?.id || email).trim();
  if (!id || !name) return null;

  return {
    id,
    info: {
      name,
      email
    }
  };
}

export function UserbackProvider() {
  const token = (process.env.NEXT_PUBLIC_USERBACK_TOKEN || '').trim();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname || ''}?${searchParams?.toString() || ''}`;
  const { user, ready, authenticated } = usePrivy();
  const identity = useMemo(() => resolveIdentity(user), [user]);
  const widgetRef = useRef<UserbackWidget | null>(null);
  const didInitRef = useRef(false);

  useEffect(() => {
    if (!token || didInitRef.current) return;

    let cancelled = false;
    const options: UserbackOptions = {
      ...(identity ? { user_data: identity } : {}),
      autohide: true,
      widget_settings: {
        trigger_type: 'api'
      }
    };

    Userback(token, options)
      .then((instance) => {
        if (cancelled) return;
        widgetRef.current = instance;
        didInitRef.current = true;
        instance.hideLauncher?.();
      })
      .catch(() => {
        didInitRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [token, identity]);

  useEffect(() => {
    if (!ready || !authenticated || !identity) return;
    const widget = widgetRef.current || getUserback();
    if (!widget) return;
    widget.identify(identity.id, identity.info);
  }, [authenticated, identity, ready]);

  useEffect(() => {
    const widget = widgetRef.current || getUserback();
    if (!widget) return;
    widget.refresh();
  }, [routeKey]);

  return null;
}
