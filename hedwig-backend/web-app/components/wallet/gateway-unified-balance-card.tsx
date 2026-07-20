'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { encodeFunctionData } from 'viem';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ArrowsLeftRight, ArrowSquareOut, SpinnerGap } from '@/components/ui/lucide-icons';
import { useToast } from '@/components/providers/toast-provider';
import {
  hedwigApi,
  type GatewayBalancesResponseSummary,
  type GatewayChainConfigSummary,
  type GatewayConfigSummary,
} from '@/lib/api/client';

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const gatewayMinterAbi = [
  {
    type: 'function',
    name: 'gatewayMint',
    inputs: [
      { name: 'attestationPayload', type: 'bytes' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export function GatewayUnifiedBalanceCard({ accessToken }: { accessToken: string | null }) {
  const { toast } = useToast();
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const evmWallet = wallets.find((wallet) => wallet.walletClientType === 'privy') ?? wallets[0];

  const [config, setConfig] = useState<GatewayConfigSummary | null>(null);
  const [balances, setBalances] = useState<GatewayBalancesResponseSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  const [sourceChainKey, setSourceChainKey] = useState('');
  const [destinationChainKey, setDestinationChainKey] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amountUsdc, setAmountUsdc] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);

  const getFreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await getAccessToken();
      return token ?? accessToken;
    } catch {
      return accessToken;
    }
  }, [accessToken, getAccessToken]);

  const refreshBalances = useCallback(async (announce = false) => {
    const token = await getFreshToken();
    if (!token) throw new Error('Session expired. Please sign in again.');
    if (!evmWallet?.address) throw new Error('No EVM wallet connected.');

    const nextBalances = await hedwigApi.gatewayBalances(
      { depositorAddress: evmWallet.address },
      { accessToken: token, disableMockFallback: true }
    );
    setBalances(nextBalances);

    if (announce) {
      toast({
        type: 'success',
        title: 'Gateway balance updated',
        message: `Unified balance: ${nextBalances.unifiedBalance} USDC`,
      });
    }
  }, [evmWallet?.address, getFreshToken, toast]);

  const loadGatewayState = useCallback(async () => {
    const token = await getFreshToken();
    if (!token || !evmWallet?.address) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [nextConfig, nextBalances] = await Promise.all([
        hedwigApi.gatewayConfig({ accessToken: token, disableMockFallback: true }),
        hedwigApi.gatewayBalances(
          { depositorAddress: evmWallet.address },
          { accessToken: token, disableMockFallback: true }
        ),
      ]);

      setConfig(nextConfig);
      setBalances(nextBalances);

      const chainKeys = nextConfig.supportedChains.map((chain) => chain.key);
      setSourceChainKey((current) => current || chainKeys[0] || '');
      setDestinationChainKey((current) => current || chainKeys[1] || chainKeys[0] || '');
      setRecipient((current) => current || evmWallet.address);
    } catch (error) {
      toast({
        type: 'error',
        title: 'Gateway unavailable',
        message: error instanceof Error ? error.message : 'Failed to load Gateway configuration.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [evmWallet?.address, getFreshToken, toast]);

  useEffect(() => {
    loadGatewayState();
  }, [loadGatewayState]);

  const chainByKey = useMemo(() => {
    const map = new Map<string, GatewayChainConfigSummary>();
    for (const chain of config?.supportedChains || []) map.set(chain.key, chain);
    return map;
  }, [config?.supportedChains]);

  const sourceChain = chainByKey.get(sourceChainKey) || null;
  const destinationChain = chainByKey.get(destinationChainKey) || null;

  const balanceRows = useMemo(() => {
    if (!balances || !config) return [];
    const byDomain = new Map<number, string>(
      config.supportedChains.map((chain) => [chain.domain, chain.label])
    );

    return balances.balances.map((item) => ({
      domain: item.domain,
      chainLabel: byDomain.get(item.domain) || `Domain ${item.domain}`,
      amount: item.balance,
    }));
  }, [balances, config]);

  const ensureChain = useCallback(async (provider: Eip1193, chain: GatewayChainConfigSummary) => {
    const currentChainRaw = await provider.request({ method: 'eth_chainId' });
    const currentChainId = typeof currentChainRaw === 'string'
      ? parseInt(currentChainRaw, 16)
      : Number(currentChainRaw);

    if (currentChainId === chain.chainId) return;

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chain.chainIdHex }],
      });
      return;
    } catch (switchError) {
      const switchCode = typeof switchError === 'object' && switchError !== null && 'code' in switchError
        ? Number((switchError as { code: unknown }).code)
        : undefined;

      if (switchCode !== 4902) {
        throw switchError;
      }
    }

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chain.chainIdHex,
        chainName: chain.label,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: [chain.rpcUrl],
        blockExplorerUrls: [chain.blockExplorerUrl],
      }],
    });

    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.chainIdHex }],
    });
  }, []);

  const handleTransfer = useCallback(async () => {
    if (!sourceChain || !destinationChain) {
      toast({ type: 'error', title: 'Chain selection required', message: 'Choose both source and destination chains.' });
      return;
    }
    if (sourceChain.key === destinationChain.key) {
      toast({ type: 'error', title: 'Invalid route', message: 'Source and destination chains must differ.' });
      return;
    }
    if (!amountUsdc || Number(amountUsdc) <= 0) {
      toast({ type: 'error', title: 'Amount required', message: 'Enter a valid USDC amount.' });
      return;
    }
    if (!evmWallet?.address) {
      toast({ type: 'error', title: 'Wallet unavailable', message: 'Connect your EVM wallet first.' });
      return;
    }

    const token = await getFreshToken();
    if (!token) {
      toast({ type: 'error', title: 'Session expired', message: 'Please sign in again.' });
      return;
    }

    setIsTransferring(true);
    try {
      const provider = await evmWallet.getEthereumProvider() as Eip1193;
      await ensureChain(provider, sourceChain);

      const prepared = await hedwigApi.gatewayPrepareEvmTransfer(
        {
          sourceChainKey: sourceChain.key,
          destinationChainKey: destinationChain.key,
          amountUsdc: amountUsdc.trim(),
          depositorAddress: evmWallet.address,
          destinationRecipient: recipient.trim() || evmWallet.address,
        },
        { accessToken: token, disableMockFallback: true }
      );

      const signatureRaw = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [evmWallet.address, JSON.stringify(prepared.typedData)],
      });
      const signature = String(signatureRaw);

      const attestation = await hedwigApi.gatewayRequestAttestation(
        {
          requests: [{ burnIntent: prepared.burnIntent, signature }],
        },
        { accessToken: token, disableMockFallback: true }
      );

      await ensureChain(provider, destinationChain);
      const mintData = encodeFunctionData({
        abi: gatewayMinterAbi,
        functionName: 'gatewayMint',
        args: [attestation.attestation as `0x${string}`, attestation.signature as `0x${string}`],
      });

      const tx = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: evmWallet.address,
          to: destinationChain.gatewayMinterAddress,
          data: mintData,
          chainId: destinationChain.chainIdHex,
        }],
      });

      setTxHash(String(tx));
      await refreshBalances(false);
      toast({
        type: 'success',
        title: 'Gateway transfer submitted',
        message: `${amountUsdc} USDC transfer from unified balance has been minted on ${destinationChain.label}.`,
      });
    } catch (error) {
      toast({
        type: 'error',
        title: 'Gateway transfer failed',
        message: error instanceof Error ? error.message : 'Transfer request failed.',
      });
    } finally {
      setIsTransferring(false);
    }
  }, [
    amountUsdc,
    destinationChain,
    ensureChain,
    evmWallet,
    getFreshToken,
    recipient,
    refreshBalances,
    sourceChain,
    toast,
  ]);

  const handleRefreshBalances = useCallback(async () => {
    setIsRefreshingBalances(true);
    try {
      await refreshBalances(true);
    } catch (error) {
      toast({
        type: 'error',
        title: 'Could not refresh balances',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsRefreshingBalances(false);
    }
  }, [refreshBalances, toast]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <p className="text-[15px] font-semibold text-[var(--color-foreground)]">Gateway unified balance</p>
          <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
            Crosschain USDC with instant burn/mint.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefreshBalances}
          disabled={isRefreshingBalances || isLoading}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-foreground)] transition hover:bg-[var(--color-surface-secondary)] disabled:opacity-60"
        >
          {isRefreshingBalances ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" weight="bold" /> : null}
          Refresh
        </button>
      </div>

      <div className="space-y-5 px-5 py-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)]">
            <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
            Loading Gateway data…
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
              <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Unified balance</p>
              <p className="mt-1 text-[24px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">
                {balances?.unifiedBalance || '0.000000'} USDC
              </p>
            </div>

            <div className="space-y-2">
              {balanceRows.length === 0 ? (
                <p className="text-[12px] text-[var(--color-text-muted)]">No Gateway balances yet. Deposit USDC into Gateway Wallet first.</p>
              ) : (
                balanceRows.map((row) => (
                  <div key={`${row.domain}-${row.chainLabel}`} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
                    <span className="text-[12px] font-medium text-[var(--color-foreground)]">{row.chainLabel}</span>
                    <span className="text-[12px] font-semibold text-[var(--color-foreground)]">{Number(row.amount).toFixed(6)} USDC</span>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--color-border)] p-4">
              <div className="flex items-center gap-2">
                <ArrowsLeftRight className="h-4 w-4 text-[var(--color-text-tertiary)]" weight="bold" />
                <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Transfer from unified balance</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Source chain</span>
                  <select
                    value={sourceChainKey}
                    onChange={(event) => setSourceChainKey(event.target.value)}
                    className="w-full appearance-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 pr-8 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                  >
                    {(config?.supportedChains || []).map((chain) => (
                      <option key={chain.key} value={chain.key}>{chain.label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Destination chain</span>
                  <select
                    value={destinationChainKey}
                    onChange={(event) => setDestinationChainKey(event.target.value)}
                    className="w-full appearance-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 pr-8 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                  >
                    {(config?.supportedChains || []).map((chain) => (
                      <option key={chain.key} value={chain.key}>{chain.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Amount (USDC)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.000001"
                    value={amountUsdc}
                    onChange={(event) => setAmountUsdc(event.target.value)}
                    placeholder="0.500000"
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)]"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Recipient (EVM address)</span>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    placeholder="0x..."
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)]"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={handleTransfer}
                disabled={isTransferring || isLoading}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
              >
                {isTransferring ? <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" /> : null}
                Transfer
              </button>

              {txHash ? (
                <a
                  href={`${destinationChain?.blockExplorerUrl || '#'}${destinationChain?.blockExplorerUrl?.includes('/tx/') ? '' : '/tx/'}${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-primary)] hover:underline"
                >
                  View mint transaction
                  <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" />
                </a>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
