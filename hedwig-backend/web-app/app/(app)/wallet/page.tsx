import Image from 'next/image';
import { ArrowsLeftRight, Bank, ChartBar, Coins, Wallet } from '@phosphor-icons/react/dist/ssr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/data/page-header';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import type { AccountTransaction, UsdAccount, WalletAsset } from '@/lib/models/entities';
import { formatCompactCurrency, formatCurrency, formatShortDate } from '@/lib/utils';

const chainIconByName: Record<'Base' | 'Solana', string> = {
  Base: '/icons/networks/base.png',
  Solana: '/icons/networks/solana.png'
};

const tokenIconByKey: Record<string, string> = {
  'Base:ETH': '/icons/tokens/eth.png',
  'Base:USDC': '/icons/tokens/usdc.png',
  'Solana:SOL': '/icons/networks/solana.png',
  'Solana:USDC': '/icons/tokens/usdc.png'
};

const supportedAssets: Array<{ chain: WalletAsset['chain']; symbol: string; name: string }> = [
  { chain: 'Base', symbol: 'ETH', name: 'Ethereum' },
  { chain: 'Base', symbol: 'USDC', name: 'USD Coin' },
  { chain: 'Solana', symbol: 'SOL', name: 'Solana' },
  { chain: 'Solana', symbol: 'USDC', name: 'USD Coin' }
];

export default async function WalletPage() {
  const session = await getCurrentSession();
  const [walletData, accountsData] = await Promise.all([
    hedwigApi.wallet({ accessToken: session.accessToken, disableMockFallback: true }),
    hedwigApi.accounts({ accessToken: session.accessToken, disableMockFallback: true })
  ]);

  const { walletAssets, walletTransactions } = walletData;
  const { usdAccount, accountTransactions } = accountsData;

  const supportedWalletAssets = mergeSupportedAssets(walletAssets);
  const totalWalletValue = supportedWalletAssets.reduce((sum, asset) => sum + asset.valueUsd, 0);
  const assetsByChain = groupAssetsByChain(supportedWalletAssets);
  const recentUsdTransfers = accountTransactions.slice(0, 4);
  const recentWalletTransactions = walletTransactions.slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Wallet"
        title="Wallet and USD account"
        description="Manage client-ready USD banking details and live Base/Solana balances from one operating view."
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <WalletStatCard
          icon={<Wallet className="h-5 w-5 text-[#72706b]" weight="bold" />}
          label="Crypto wallet"
          value={formatCompactCurrency(totalWalletValue)}
          detail="ETH, SOL, and USDC across supported chains"
        />
        <WalletStatCard
          icon={<Bank className="h-5 w-5 text-[#72706b]" weight="bold" />}
          label="USD account balance"
          value={formatCurrency(usdAccount.balanceUsd)}
          detail={usdAccount.status === 'active' ? 'Bridge account is active' : formatStatus(usdAccount.status)}
        />
        <WalletStatCard
          icon={<Coins className="h-5 w-5 text-[#72706b]" weight="bold" />}
          label="Supported assets"
          value={String(supportedWalletAssets.length)}
          detail="Base: ETH, USDC · Solana: SOL, USDC"
        />
        <WalletStatCard
          icon={<ArrowsLeftRight className="h-5 w-5 text-[#72706b]" weight="bold" />}
          label="Auto-settlement"
          value={usdAccount.settlementChain}
          detail="USD deposits settle to your selected chain"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr_1fr]">
        <UsdAccountCard usdAccount={usdAccount} accountTransactions={recentUsdTransfers} />

        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center gap-3 text-muted-foreground">
              <ChartBar className="h-4.5 w-4.5 text-[#72706b]" weight="bold" />
              <CardTitle className="text-sm font-medium">Asset balances</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="mt-4 space-y-4">
            {Object.entries(assetsByChain).map(([chain, assets]) => (
              <section key={chain} className="space-y-2.5">
                <div className="flex items-center justify-between rounded-[15px] border border-[#e9eaeb] bg-[#f9fafb] px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <ChainIcon chain={chain as WalletAsset['chain']} size={28} />
                    <div>
                      <p className="font-semibold text-foreground">{chain}</p>
                      <p className="text-sm text-muted-foreground">{assets.length} supported token{assets.length === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(assets.reduce((sum, asset) => sum + asset.valueUsd, 0))}
                  </p>
                </div>

                <div className="space-y-2.5">
                  {assets.map((asset) => (
                    <div key={asset.id} className="flex items-center justify-between gap-4 rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-3.5">
                      <div className="flex items-center gap-3">
                        <TokenIcon chain={asset.chain} symbol={asset.symbol} label={asset.name} />
                        <div>
                          <p className="font-semibold text-foreground">{asset.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {asset.balance} {asset.symbol}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{formatCurrency(asset.valueUsd)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{asset.symbol} on {asset.chain}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Wallet className="h-4.5 w-4.5 text-[#72706b]" weight="bold" />
              <CardTitle className="text-sm font-medium">Recent wallet activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="mt-4 space-y-2.5">
            {recentWalletTransactions.length ? (
              recentWalletTransactions.map((tx) => (
                <div key={tx.id} className="rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <TokenIcon chain={tx.chain} symbol={tx.asset} label={tx.asset} />
                      <div>
                        <p className="font-semibold capitalize text-foreground">
                          {tx.kind} {tx.amount} {tx.asset}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{tx.chain}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{formatShortDate(tx.createdAt)}</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{tx.counterparty}</p>
                </div>
              ))
            ) : (
              <EmptyState
                title="No wallet activity yet"
                body="Incoming transfers, sends, settlements, and payment movements will show here."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UsdAccountCard({
  usdAccount,
  accountTransactions
}: {
  usdAccount: UsdAccount;
  accountTransactions: AccountTransaction[];
}) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Bank className="h-4.5 w-4.5 text-[#72706b]" weight="bold" />
          <CardTitle className="text-sm font-medium">USD account</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="mt-4 space-y-3">
        <div className="rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#717680]">Status</p>
              <p className="mt-2 text-sm font-semibold capitalize text-foreground">{formatStatus(usdAccount.status)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#717680]">Balance</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{formatCurrency(usdAccount.balanceUsd)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#717680]">Bank</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{usdAccount.bankName ?? 'Bridge partner bank'}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#717680]">Account number</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {usdAccount.accountNumberMasked ?? 'Pending account assignment'}
            </p>
          </div>
          <div className="rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#717680]">Routing number</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {usdAccount.routingNumberMasked ?? 'Awaiting routing details'}
            </p>
          </div>
        </div>

        <div className="rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#717680]">Settlement chain</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{usdAccount.settlementChain}</p>
            </div>
            <ChainIcon chain={usdAccount.settlementChain} size={28} />
          </div>
        </div>

        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#717680]">Recent USD activity</p>
          {accountTransactions.length ? (
            accountTransactions.map((tx) => (
              <div key={tx.id} className="rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-foreground">{tx.description}</p>
                  <p className="text-sm text-muted-foreground">{formatShortDate(tx.createdAt)}</p>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{formatCurrency(tx.amountUsd)} · {formatStatus(tx.status)}</p>
              </div>
            ))
          ) : (
            <EmptyState
              title="No USD transfers yet"
              body="Incoming ACH and settlement activity will appear here once the account starts receiving funds."
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WalletStatCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[15px] border border-[#e9eaeb] bg-white p-4 shadow-xs">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="mt-2.5 text-[1.28rem] font-semibold tracking-[-0.03em] text-foreground">{value}</div>
      <p className="mt-1.5 text-[0.88rem] text-muted-foreground">{detail}</p>
    </div>
  );
}

function ChainIcon({ chain, size = 24 }: { chain: 'Base' | 'Solana'; size?: number }) {
  return <Image src={chainIconByName[chain]} alt={`${chain} icon`} width={size} height={size} className="rounded-full" />;
}

function TokenIcon({ chain, symbol, label }: { chain: WalletAsset['chain']; symbol: string; label: string }) {
  const iconSrc = tokenIconByKey[`${chain}:${symbol}`];

  if (iconSrc) {
    return <Image src={iconSrc} alt={`${label} icon`} width={32} height={32} className="rounded-full" />;
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2f4f7] text-[11px] font-semibold text-[#667085]">
      {symbol.slice(0, 3)}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[15px] border border-dashed border-[#d0d5dd] bg-[#fcfcfd] px-4 py-5">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function mergeSupportedAssets(walletAssets: WalletAsset[]) {
  return supportedAssets.map((supported, index) => {
    const found = walletAssets.find((asset) => asset.chain === supported.chain && asset.symbol === supported.symbol);

    return (
      found ?? {
        id: `${supported.chain.toLowerCase()}-${supported.symbol.toLowerCase()}-${index}`,
        chain: supported.chain,
        symbol: supported.symbol,
        name: supported.name,
        balance: 0,
        valueUsd: 0,
        changePct24h: 0
      }
    );
  });
}

function groupAssetsByChain(walletAssets: WalletAsset[]) {
  return walletAssets.reduce<Record<WalletAsset['chain'], WalletAsset[]>>(
    (groups, asset) => {
      groups[asset.chain].push(asset);
      return groups;
    },
    { Base: [], Solana: [] }
  );
}

function formatStatus(value: string) {
  return value.replace(/_/g, ' ');
}
