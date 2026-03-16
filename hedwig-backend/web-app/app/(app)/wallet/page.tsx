import Image from 'next/image';
import { ArrowsLeftRight, Bank, Coins, Wallet } from '@phosphor-icons/react/dist/ssr';
import { PageHeader } from '@/components/data/page-header';
import { ShareWalletDialog } from '@/components/wallet/share-wallet-dialog';
import { ChangeSettlementDialog } from '@/components/wallet/change-settlement-dialog';
import { WalletAssetsTable } from '@/components/wallet/wallet-assets-table';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import type { AccountTransaction, WalletAsset, WalletTransaction } from '@/lib/models/entities';
import { formatCurrency, formatShortDate } from '@/lib/utils';

const chainIconByName: Record<'Base' | 'Solana', string> = {
  Base: '/icons/networks/base.png',
  Solana: '/icons/networks/solana.png'
};

const tokenIconByKey: Record<string, string> = {
  'Base:ETH':     '/icons/tokens/eth.png',
  'Base:USDC':    '/icons/tokens/usdc.png',
  'Solana:SOL':   '/icons/networks/solana.png',
  'Solana:USDC':  '/icons/tokens/usdc.png'
};

const supportedAssets: Array<{ chain: WalletAsset['chain']; symbol: string; name: string }> = [
  { chain: 'Base',   symbol: 'ETH',  name: 'Ethereum' },
  { chain: 'Base',   symbol: 'USDC', name: 'USD Coin'  },
  { chain: 'Solana', symbol: 'SOL',  name: 'Solana'    },
  { chain: 'Solana', symbol: 'USDC', name: 'USD Coin'  },
];

const TX_KIND: Record<WalletTransaction['kind'], { dot: string; bg: string; text: string }> = {
  receive:    { dot: 'bg-[#12b76a]', bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  send:       { dot: 'bg-[#f04438]', bg: 'bg-[#fff1f0]', text: 'text-[#b42318]' },
  payment:    { dot: 'bg-[#2563eb]', bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  settlement: { dot: 'bg-[#f59e0b]', bg: 'bg-[#fffaeb]', text: 'text-[#92400e]' },
};

const USD_TX_STATUS: Record<AccountTransaction['status'], { dot: string; label: string }> = {
  pending:   { dot: 'bg-[#f59e0b]', label: 'Pending'   },
  completed: { dot: 'bg-[#12b76a]', label: 'Completed' },
  failed:    { dot: 'bg-[#f04438]', label: 'Failed'    },
};

export default async function WalletPage() {
  const session = await getCurrentSession();
  const [walletData, accountsData] = await Promise.all([
    hedwigApi.wallet({ accessToken: session.accessToken, disableMockFallback: true }),
    hedwigApi.accounts({ accessToken: session.accessToken, disableMockFallback: true })
  ]);

  const { walletAccounts, walletAssets, walletTransactions } = walletData;
  const { usdAccount, accountTransactions } = accountsData;

  const baseAccount   = walletAccounts.find((a) => a.chain === 'Base');
  const solanaAccount = walletAccounts.find((a) => a.chain === 'Solana');

  const allAssets = mergeSupportedAssets(walletAssets);
  const assetsByChain = groupAssetsByChain(allAssets);
  const totalCrypto = allAssets.reduce((s, a) => s + a.valueUsd, 0);
  const recentWalletTx = walletTransactions.slice(0, 6);
  const recentUsdTx = accountTransactions.slice(0, 6);

  const usdStatusLabel = usdAccount.status === 'active' ? 'Active' : usdAccount.status === 'pending_kyc' ? 'Pending KYC' : 'Not started';
  const usdStatusDot = usdAccount.status === 'active' ? 'bg-[#12b76a]' : usdAccount.status === 'pending_kyc' ? 'bg-[#f59e0b]' : 'bg-[#a4a7ae]';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Wallet"
          title="Wallet & USD account"
          description="Your crypto portfolio, USD banking details, and transaction history in one place."
        />
        <div className="shrink-0 pt-1">
          <ShareWalletDialog
            baseAddress={baseAccount?.address ?? null}
            solanaAddress={solanaAccount?.address ?? null}
          />
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
        <div className="bg-white px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-[#2563eb]" weight="bold" />
            <span className="text-[12px] font-medium text-[#717680]">Crypto portfolio</span>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{formatCurrency(totalCrypto)}</p>
          <p className="mt-1 text-[11px] text-[#a4a7ae]">Base + Solana</p>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Bank className="h-4 w-4 text-[#12b76a]" weight="bold" />
            <span className="text-[12px] font-medium text-[#717680]">USD account</span>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] text-[#12b76a]">{formatCurrency(usdAccount.balanceUsd)}</p>
          <p className="mt-1 text-[11px] text-[#a4a7ae]">{usdStatusLabel}</p>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Coins className="h-4 w-4 text-[#f59e0b]" weight="bold" />
            <span className="text-[12px] font-medium text-[#717680]">Assets tracked</span>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{allAssets.length}</p>
          <p className="mt-1 text-[11px] text-[#a4a7ae]">ETH, USDC, SOL, USDC</p>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowsLeftRight className="h-4 w-4 text-[#717680]" weight="bold" />
            <span className="text-[12px] font-medium text-[#717680]">Auto-settlement</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ChainIcon chain={usdAccount.settlementChain} size={20} />
            <p className="text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{usdAccount.settlementChain}</p>
          </div>
          <p className="mt-1 text-[11px] text-[#a4a7ae]">USD deposits settle here</p>
        </div>
      </div>

      {/* Asset portfolio — interactive client component */}
      <WalletAssetsTable assetsByChain={assetsByChain} totalCrypto={totalCrypto} />

      {/* Bottom row: USD account + Activity */}
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">

        {/* USD account — banking card */}
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
          <div className="border-b border-[#e9eaeb] px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold text-[#181d27]">USD account</p>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${usdAccount.status === 'active' ? 'bg-[#ecfdf3] text-[#027a48]' : 'bg-[#f2f4f7] text-[#717680]'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${usdStatusDot}`} />
                {usdStatusLabel}
              </span>
            </div>
          </div>

          {/* Balance hero */}
          <div className="border-b border-[#e9eaeb] bg-[#f8f9fc] px-5 py-5">
            <p className="text-[11px] font-medium text-[#a4a7ae] mb-1">Available balance</p>
            <p className="text-[32px] font-bold tracking-[-0.04em] text-[#181d27] leading-none">{formatCurrency(usdAccount.balanceUsd)}</p>
          </div>

          {/* Account details */}
          <div className="divide-y divide-[#f2f4f7] px-5">
            <DetailRow label="Bank" value={usdAccount.bankName ?? 'Bridge partner bank'} />
            <DetailRow label="Account number" value={usdAccount.accountNumberMasked ?? 'Pending assignment'} mono />
            <DetailRow label="Routing number" value={usdAccount.routingNumberMasked ?? 'Pending routing details'} mono />
            <DetailRow label="Deposit fee" value="0%" badge="green" />
            <div className="flex items-center justify-between py-3.5">
              <span className="text-[12px] text-[#717680]">Settlement chain</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <ChainIcon chain={usdAccount.settlementChain} size={16} />
                  <span className="text-[13px] font-semibold text-[#181d27]">{usdAccount.settlementChain}</span>
                </div>
                <ChangeSettlementDialog
                  currentChain={usdAccount.settlementChain}
                  accessToken={session.accessToken ?? ''}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Unified activity feed */}
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
          <div className="border-b border-[#e9eaeb] px-5 py-4">
            <p className="text-[15px] font-semibold text-[#181d27]">Recent activity</p>
            <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Wallet transactions and USD transfers</p>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_100px_100px_90px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Transaction</span>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Type</span>
            <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Amount</span>
            <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Date</span>
          </div>

          {recentWalletTx.length === 0 && recentUsdTx.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Wallet className="h-8 w-8 text-[#d0d5dd]" weight="duotone" />
              <p className="text-[13px] text-[#a4a7ae]">No activity yet. Transfers, payments, and settlements will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#f9fafb]">
              {/* Wallet transactions */}
              {recentWalletTx.map((tx) => {
                const k = TX_KIND[tx.kind] ?? TX_KIND.payment;
                return (
                  <div key={tx.id} className="grid grid-cols-[1fr_100px_100px_90px] items-center gap-3 px-5 py-3.5 hover:bg-[#fafafa] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <TokenIcon chain={tx.chain} symbol={tx.asset} label={tx.asset} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#181d27] capitalize">{tx.kind} · {tx.asset}</p>
                        <p className="truncate text-[11px] text-[#a4a7ae]">{tx.counterparty || tx.chain}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${k.bg} ${k.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${k.dot}`} />
                      <span className="capitalize">{tx.kind}</span>
                    </span>
                    <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">
                      {tx.amount} <span className="text-[11px] text-[#a4a7ae] font-normal">{tx.asset}</span>
                    </p>
                    <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(tx.createdAt)}</p>
                  </div>
                );
              })}

              {/* USD transfers */}
              {recentUsdTx.map((tx) => {
                const s = USD_TX_STATUS[tx.status] ?? USD_TX_STATUS.pending;
                return (
                  <div key={tx.id} className="grid grid-cols-[1fr_100px_100px_90px] items-center gap-3 px-5 py-3.5 hover:bg-[#fafafa] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ecfdf3] text-[#027a48]">
                        <Bank className="h-4 w-4" weight="bold" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#181d27]">{tx.description}</p>
                        <p className="text-[11px] text-[#a4a7ae]">USD transfer</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[#f2f4f7] text-[#717680]">
                      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                    <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">{formatCurrency(tx.amountUsd)}</p>
                    <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(tx.createdAt)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── helpers ── */
function DetailRow({ label, value, mono, badge }: { label: string; value: string; mono?: boolean; badge?: 'green' }) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <span className="text-[12px] text-[#717680]">{label}</span>
      {badge === 'green' ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf3] px-2.5 py-0.5 text-[12px] font-semibold text-[#027a48]">
          {value}
        </span>
      ) : (
        <span className={`text-[13px] font-semibold text-[#181d27] ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</span>
      )}
    </div>
  );
}

function ChainIcon({ chain, size = 24 }: { chain: 'Base' | 'Solana'; size?: number }) {
  return <Image src={chainIconByName[chain]} alt={chain} width={size} height={size} className="rounded-full shrink-0" />;
}

function TokenIcon({ chain, symbol, label, size = 32 }: { chain: WalletAsset['chain']; symbol: string; label: string; size?: number }) {
  const iconSrc = tokenIconByKey[`${chain}:${symbol}`];
  if (iconSrc) return <Image src={iconSrc} alt={label} width={size} height={size} className="rounded-full shrink-0" />;
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[11px] font-semibold text-[#667085]">
      {symbol.slice(0, 3)}
    </div>
  );
}

function mergeSupportedAssets(walletAssets: WalletAsset[]) {
  return supportedAssets.map((supported, index) => {
    const found = walletAssets.find((a) => a.chain === supported.chain && a.symbol === supported.symbol);
    return found ?? { id: `${supported.chain.toLowerCase()}-${supported.symbol.toLowerCase()}-${index}`, chain: supported.chain, symbol: supported.symbol, name: supported.name, balance: 0, valueUsd: 0, changePct24h: 0 };
  });
}

function groupAssetsByChain(walletAssets: WalletAsset[]) {
  return walletAssets.reduce<Record<WalletAsset['chain'], WalletAsset[]>>(
    (groups, asset) => { groups[asset.chain].push(asset); return groups; },
    { Base: [], Solana: [] }
  );
}
