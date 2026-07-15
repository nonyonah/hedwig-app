'use client';

import { useEffect, useState, useRef } from 'react';
import { hedwigApi } from '@/lib/api/client';
import type { GatewayBalance, WalletAccount, WalletAsset, WalletTransaction } from '@/lib/models/entities';

export interface WalletData {
  walletAccounts: WalletAccount[];
  walletAssets: WalletAsset[];
  walletTransactions: WalletTransaction[];
}

const POLL_INTERVAL = 15_000;

export function useWalletData(
  initialData: WalletData,
  accessToken: string | null,
): { data: WalletData } {
  const [data, setData] = useState<WalletData>(initialData);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!accessToken) return;
    mountedRef.current = true;

    const poll = async () => {
      try {
        const fresh = await hedwigApi.wallet({ accessToken });
        if (mountedRef.current) setData(fresh);
      } catch {
        // keep current data on error
      }
    };

    const id = setInterval(poll, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [accessToken]);

  return { data };
}

export function useGatewayBalance(
  initialBalance: GatewayBalance,
  accessToken: string | null,
): { data: GatewayBalance } {
  const [data, setData] = useState<GatewayBalance>(initialBalance);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!accessToken) return;
    mountedRef.current = true;

    const poll = async () => {
      try {
        const fresh = await hedwigApi.gatewayBalance({ accessToken });
        if (mountedRef.current) setData(fresh);
      } catch {
        // keep current data on error
      }
    };

    const id = setInterval(poll, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [accessToken]);

  return { data };
}
