'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { ArrowDown, ArrowSquareOut, ArrowUp, Check, Copy, Globe, XLogo, X } from '@/components/ui/lucide-icons';
import type { WalletAsset } from '@/lib/models/entities';

const TIMEFRAMES = ['1D', '7D', '1M', '3M', '1Y'] as const;
type Timeframe = typeof TIMEFRAMES[number];

const TOKEN_ICON: Record<string, string> = {
  'Base:ETH':    '/icons/tokens/eth.png',
  'Base:USDC':   '/icons/tokens/usdc.png',
  'Solana:SOL':  '/icons/networks/solana.png',
  'Solana:USDC': '/icons/tokens/usdc.png'
};
const CHAIN_ICON: Record<string, string> = {
  Base:   '/icons/networks/base.png',
  Solana: '/icons/networks/solana.png'
};
const EXPLORER_BASE = (addr: string) => `https://basescan.org/token/${addr}`;
const EXPLORER_SOL  = (addr: string) => `https://solscan.io/token/${addr}`;

type ChartPoint = { t: number; p: number };
type MarketData = {
  prices: ChartPoint[];
  currentPrice: number | null;
  change24h: number | null;
  high24h: number | null;
  low24h: number | null;
  marketCap: number | null;
  rank: number | null;
  circulatingSupply: number | null;
  description: string | null;
  contractAddress: string | null;
  website: string | null;
  twitter: string | null;
};

// ── formatters ────────────────────────────────────────────────────────────────

function fmtUsd(n: number | null | undefined, decimals = 2) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: decimals }).format(n);
}

function fmtSupply(n: number | null, symbol: string) {
  if (n == null) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ${symbol}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ${symbol}`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K ${symbol}`;
  return `${n.toFixed(2)} ${symbol}`;
}

function fmtCrypto(n: number, symbol: string) {
  if (n <= 0) return `0 ${symbol}`;
  const dec = symbol === 'USDC' || symbol === 'USDT' ? 2 : n >= 1 ? 4 : 6;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: dec })} ${symbol}`;
}

function fmtTime(ts: number, tf: Timeframe) {
  const d = new Date(ts);
  if (tf === '1D') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── sub-components ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, timeframe }: any) {
  if (!active || !payload?.length) return null;
  const { t, p } = payload[0].payload as ChartPoint;
  return (
    <div className="rounded-xl border border-[#e9eaeb] bg-white px-3 py-2 shadow-lg">
      <p className="text-[11px] text-[#a4a7ae]">{fmtTime(t, timeframe)}</p>
      <p className="text-[14px] font-bold text-[#181d27]">{fmtUsd(p)}</p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#e9eaeb] text-[#a4a7ae] transition hover:border-[#d0d5dd] hover:text-[#717680]"
    >
      {copied
        ? <Check className="h-3 w-3 text-[#12b76a]" weight="bold" />
        : <Copy className="h-3 w-3" weight="bold" />
      }
    </button>
  );
}

function LinkPill({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px] font-medium text-[#414651] transition hover:bg-[#f5f5f5]"
    >
      {icon}
      {label}
    </a>
  );
}

function StatCell({ label, value, loading, colSpan }: {
  label: string;
  value: string | null;
  loading?: boolean;
  colSpan?: boolean;
}) {
  return (
    <div className={`bg-white px-4 py-3.5 ${colSpan ? 'col-span-2' : ''}`}>
      <p className="text-[11px] text-[#a4a7ae]">{label}</p>
      {loading
        ? <div className="mt-1.5 h-4 w-20 animate-pulse rounded-lg bg-[#f2f4f7]" />
        : <p className="mt-0.5 text-[14px] font-semibold text-[#181d27]">{value ?? '—'}</p>
      }
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function TokenDetailPanel({ asset, onClose }: { asset: WalletAsset; onClose: () => void }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [market, setMarket]       = useState<MarketData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const prevKey = useRef<string | null>(null);

  const fetchData = useCallback(async (sym: string, tf: Timeframe) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/market/chart?symbol=${sym}&chain=${asset.chain}&timeframe=${tf}`);
      if (res.ok) setMarket(await res.json());
    } finally {
      setLoading(false);
    }
  }, [asset.chain]);

  useEffect(() => {
    const key = `${asset.symbol}:${timeframe}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    fetchData(asset.symbol, timeframe);
  }, [asset.symbol, timeframe, fetchData]);

  const tokenIcon  = TOKEN_ICON[`${asset.chain}:${asset.symbol}`];
  const chainIcon  = CHAIN_ICON[asset.chain];
  const displayPrice = hoverPrice ?? market?.currentPrice ?? null;
  const change       = market?.change24h ?? asset.changePct24h ?? 0;
  const isPositive   = change >= 0;
  const chartColor   = loading ? '#e9eaeb' : isPositive ? '#12b76a' : '#f04438';
  const priceDecimals = asset.symbol === 'USDC' || asset.symbol === 'USDT' ? 4 : 2;

  const contractAddr = market?.contractAddress ?? null;
  const explorerLink = contractAddr
    ? (asset.chain === 'Solana' ? EXPLORER_SOL(contractAddr) : EXPLORER_BASE(contractAddr))
    : null;
  const shortAddr = contractAddr
    ? `${contractAddr.slice(0, 10)}…${contractAddr.slice(-6)}`
    : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 border-b border-[#e9eaeb] px-5 py-4">
          <div className="relative shrink-0">
            {tokenIcon
              ? <Image src={tokenIcon} alt={asset.name} width={44} height={44} className="rounded-full" />
              : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f4f7] text-[13px] font-bold text-[#667085]">{asset.symbol.slice(0, 3)}</div>
            }
            {chainIcon && (
              <Image src={chainIcon} alt={asset.chain} width={18} height={18}
                className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[16px] font-bold text-[#181d27]">{asset.name}</p>
              {market?.rank && (
                <span className="inline-flex items-center rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[11px] font-semibold text-[#717680]">
                  #{market.rank}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[12px] text-[#a4a7ae]">{asset.symbol}</span>
              <span className="text-[#e9eaeb]">·</span>
              <span className="text-[12px] text-[#a4a7ae]">{asset.chain}</span>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e9eaeb] text-[#717680] transition hover:bg-[#f5f5f5]">
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Balance hero */}
          <div className="border-b border-[#f2f4f7] bg-[#fafafa] px-5 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Your balance</p>
            <p className="mt-1 text-[26px] font-bold tracking-[-0.04em] leading-none text-[#181d27]">
              {fmtCrypto(asset.balance, asset.symbol)}
            </p>
            <p className="mt-1.5 text-[13px] font-medium text-[#717680]">
              {fmtUsd(asset.valueUsd)}{' '}
              <span className="text-[11px] font-normal text-[#a4a7ae]">portfolio value</span>
            </p>
          </div>

          {/* Market price */}
          <div className="px-5 pt-5 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
              {hoverPrice ? 'Price at cursor' : 'Market price'}
            </p>
            <div className="mt-1 flex items-end gap-3">
              <p className="text-[30px] font-bold tracking-[-0.04em] leading-none text-[#181d27]">
                {loading
                  ? <span className="inline-block h-8 w-32 animate-pulse rounded-xl bg-[#f2f4f7]" />
                  : fmtUsd(displayPrice, priceDecimals)
                }
              </p>
              {!loading && change !== null && (
                <span className={`mb-0.5 flex items-center gap-1 text-[13px] font-semibold ${isPositive ? 'text-[#12b76a]' : 'text-[#f04438]'}`}>
                  {isPositive ? <ArrowUp className="h-3.5 w-3.5" weight="bold" /> : <ArrowDown className="h-3.5 w-3.5" weight="bold" />}
                  {Math.abs(change).toFixed(2)}%
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[#a4a7ae]">24h change</p>
          </div>

          {/* Timeframe pills */}
          <div className="px-5 py-3">
            <div className="flex items-center gap-1 rounded-full border border-[#e9eaeb] bg-[#f5f5f5] p-1">
              {TIMEFRAMES.map((tf) => (
                <button key={tf} type="button" onClick={() => setTimeframe(tf)}
                  className={`flex-1 rounded-full py-1.5 text-[12px] font-semibold transition duration-100 ${
                    timeframe === tf ? 'bg-white text-[#181d27] shadow-xs' : 'text-[#717680] hover:text-[#414651]'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="h-[200px] px-2">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-1 w-24 animate-pulse rounded-full bg-[#e9eaeb]" />
              </div>
            ) : market?.prices?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={market.prices} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  onMouseLeave={() => setHoverPrice(null)}>
                  <defs>
                    <linearGradient id={`pg-${asset.symbol}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={chartColor} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#f2f4f7" />
                  <XAxis dataKey="t" tickFormatter={(v) => fmtTime(v, timeframe)}
                    tick={{ fontSize: 10, fill: '#a4a7ae' }} axisLine={false} tickLine={false}
                    interval="preserveStartEnd" minTickGap={60} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#a4a7ae' }}
                    axisLine={false} tickLine={false} width={46}
                    tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${Number(v).toFixed(0)}`} />
                  <Tooltip content={<CustomTooltip timeframe={timeframe} />}
                    cursor={{ stroke: chartColor, strokeWidth: 1.5, strokeDasharray: '4 2' }} />
                  <Area type="monotone" dataKey="p" stroke={chartColor} strokeWidth={2}
                    fill={`url(#pg-${asset.symbol})`} dot={false}
                    activeDot={{ r: 4, fill: chartColor, stroke: 'white', strokeWidth: 2 }}
                    onMouseMove={(point: any) => {
                      const p = point?.activePayload?.[0]?.payload?.p;
                      if (p != null) setHoverPrice(p);
                    }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-[12px] text-[#a4a7ae]">No price data</p>
              </div>
            )}
          </div>

          {/* Stats grid: 2×3 */}
          <div className="mx-5 mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
            <StatCell label="24h high"             value={fmtUsd(market?.high24h)}    loading={loading} />
            <StatCell label="24h low"              value={fmtUsd(market?.low24h)}     loading={loading} />
            <StatCell label="Market cap"           value={fmtUsd(market?.marketCap)}  loading={loading} />
            <StatCell label="Rank"                 value={market?.rank ? `#${market.rank}` : null} loading={loading} />
            <StatCell label="Circulating supply"   value={fmtSupply(market?.circulatingSupply ?? null, asset.symbol)} loading={loading} colSpan />
          </div>

          {/* Links: website + X */}
          {(!loading && (market?.website || market?.twitter)) && (
            <div className="mx-5 mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Links</p>
              <div className="flex flex-wrap gap-2">
                {market.website && (
                  <LinkPill
                    href={market.website}
                    icon={<Globe className="h-3.5 w-3.5 text-[#717680]" weight="bold" />}
                    label="Website"
                  />
                )}
                {market.twitter && (
                  <LinkPill
                    href={market.twitter}
                    icon={<XLogo className="h-3.5 w-3.5 text-[#717680]" weight="bold" />}
                    label="X / Twitter"
                  />
                )}
              </div>
            </div>
          )}

          {/* Contract address */}
          <div className="mx-5 mt-4 overflow-hidden rounded-2xl border border-[#e9eaeb]">
            <div className="border-b border-[#f2f4f7] bg-[#fafafa] px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Contract address</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              {chainIcon && (
                <Image src={chainIcon} alt={asset.chain} width={18} height={18} className="shrink-0 rounded-full" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[12px] text-[#414651]">
                  {shortAddr ?? 'Native asset — no contract'}
                </p>
                <p className="mt-0.5 text-[11px] text-[#a4a7ae]">
                  {contractAddr
                    ? `${asset.symbol} on ${asset.chain}`
                    : `${asset.symbol} is native to ${asset.chain}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {contractAddr && <CopyButton text={contractAddr} />}
                {explorerLink && (
                  <a href={explorerLink} target="_blank" rel="noreferrer"
                    title={asset.chain === 'Base' ? 'View on BaseScan' : 'View on Solscan'}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-[#e9eaeb] text-[#a4a7ae] transition hover:border-[#d0d5dd] hover:text-[#717680]">
                    <ArrowSquareOut className="h-3 w-3" weight="bold" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* About */}
          {market?.description && (
            <div className="mx-5 mt-4 rounded-2xl border border-[#e9eaeb] px-4 py-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">About {asset.name}</p>
              <p className="text-[12px] leading-[1.7] text-[#717680] line-clamp-6">{market.description}</p>
            </div>
          )}

          <div className="h-8" />
        </div>
      </div>
    </>
  );
}
