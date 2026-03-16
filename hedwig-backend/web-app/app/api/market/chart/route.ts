import { NextRequest, NextResponse } from 'next/server';

const COINGECKO_ID: Record<string, string> = {
  ETH:  'ethereum',
  USDC: 'usd-coin',
  SOL:  'solana',
  USDT: 'tether',
  BTC:  'bitcoin'
};

const DAYS_MAP: Record<string, string> = {
  '1D': '1',
  '7D': '7',
  '1M': '30',
  '3M': '90',
  '1Y': '365'
};

// Well-known on-chain contract addresses, keyed by "Chain:Symbol"
const CONTRACT_ADDRESS: Record<string, string | null> = {
  'Base:ETH':    null,
  'Solana:SOL':  null,
  'Base:USDC':   '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'Solana:USDC': 'EPjFWdd5Au7B7WqSqqxS7ZkFvCPScoqB9Ko6z8bn8js',
  'Base:USDT':   '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'
};

const TOKEN_DESCRIPTION: Record<string, string> = {
  ETH:  'Ethereum is a decentralized, open-source blockchain with smart contract functionality. Ether (ETH) is the native cryptocurrency of the platform and is used to pay transaction fees.',
  SOL:  'Solana is a high-performance layer-1 blockchain designed for speed and low cost. SOL is the native cryptocurrency used for staking and transaction fees.',
  USDC: 'USD Coin (USDC) is a fully-backed US dollar stablecoin issued by Circle. Each USDC is redeemable 1:1 for US dollars and backed by regulated US financial institutions.',
  USDT: 'Tether (USDT) is a stablecoin pegged to the US dollar, issued by Tether Limited. It is widely used as a stable store of value in crypto markets.',
  BTC:  'Bitcoin is the world\'s first cryptocurrency, operating on a decentralised peer-to-peer network. It is widely regarded as digital gold.'
};

// Ballpark fallback market caps (USD) — used when API is unavailable
const DEFAULT_MARKET_CAP: Record<string, number> = {
  ETH:  385_000_000_000,
  SOL:   72_000_000_000,
  USDC:  61_000_000_000,
  USDT: 112_000_000_000,
  BTC: 1_300_000_000_000
};

const DEFAULT_PRICE: Record<string, number> = {
  ETH: 3_200,
  SOL: 140,
  USDC: 1,
  USDT: 1,
  BTC: 65_000
};

function cgHeaders(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  return key
    ? { Accept: 'application/json', 'x-cg-demo-api-key': key }
    : { Accept: 'application/json' };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol        = (searchParams.get('symbol') ?? '').toUpperCase();
  const chainParam    = (searchParams.get('chain') ?? '').trim();
  const normalizedChain: 'Base' | 'Solana' = chainParam.toLowerCase() === 'solana' ? 'Solana' : 'Base';
  const timeframe     = searchParams.get('timeframe') ?? '1D';

  const coinId = COINGECKO_ID[symbol];
  if (!coinId) {
    return NextResponse.json({ error: 'Unsupported symbol' }, { status: 400 });
  }

  const days     = DAYS_MAP[timeframe] ?? '1';
  const interval = days === '1' ? 'minutely' : days === '7' ? 'hourly' : 'daily';

  try {
    // Two requests: chart data + full coin info (includes market data, links, description)
    const [chartRes, coinRes] = await Promise.allSettled([
      fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`,
        { headers: cgHeaders(), next: { revalidate: days === '1' ? 300 : 3600 } }
      ),
      fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
        { headers: cgHeaders(), next: { revalidate: 60 } }
      )
    ]);

    // ── Chart prices ──────────────────────────────────────────────────────────
    let prices: { t: number; p: number }[] = [];
    if (chartRes.status === 'fulfilled' && chartRes.value.ok) {
      const data = await chartRes.value.json() as { prices: [number, number][] };
      prices = (data.prices ?? []).map(([t, p]) => ({ t, p }));
    }

    // ── Coin info (market data + links + description) ─────────────────────────
    let currentPrice: number | null = null;
    let change24h: number | null    = null;
    let high24h: number | null      = null;
    let low24h: number | null       = null;
    let marketCap: number | null    = null;
    let rank: number | null         = null;
    let circulatingSupply: number | null = null;
    let description: string | null  = null;
    let website: string | null      = null;
    let twitter: string | null      = null;
    let contractAddressFromCg: string | null = null;

    if (coinRes.status === 'fulfilled' && coinRes.value.ok) {
      const coin = await coinRes.value.json() as any;

      // Market data
      const md = coin?.market_data ?? {};
      currentPrice      = md?.current_price?.usd ?? null;
      change24h         = md?.price_change_percentage_24h ?? null;
      high24h           = md?.high_24h?.usd ?? null;
      low24h            = md?.low_24h?.usd ?? null;
      marketCap         = md?.market_cap?.usd ?? null;
      circulatingSupply = md?.circulating_supply ?? null;
      rank              = coin?.market_cap_rank ?? null;

      // Description (strip HTML)
      const rawDesc = coin?.description?.en ?? '';
      description = rawDesc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;

      // Links
      const links = coin?.links ?? {};
      const homepage = (links?.homepage ?? []).find((u: string) => u && u.startsWith('http'));
      website = homepage ?? null;
      const twitterHandle = links?.twitter_screen_name ?? null;
      twitter = twitterHandle ? `https://x.com/${twitterHandle}` : null;

      // Contract address from CoinGecko platforms
      const platforms = coin?.platforms ?? {};
      contractAddressFromCg =
        platforms['base'] ??
        platforms['solana'] ??
        platforms['ethereum'] ??
        null;
    }

    // Fallbacks for text data
    if (!description) description = TOKEN_DESCRIPTION[symbol] ?? null;
    const contractAddress =
      (contractAddressFromCg && contractAddressFromCg.length > 5 ? contractAddressFromCg : null) ??
      CONTRACT_ADDRESS[`${normalizedChain}:${symbol}`] ??
      null;

    // If chart empty, use synthetic fallback
    if (prices.length === 0) {
      prices = buildFallbackPrices(symbol, Number(days));
    }

    // Pin the last chart point to currentPrice so chart and header always match
    if (prices.length > 0) {
      if (currentPrice !== null) {
        prices[prices.length - 1] = { t: prices[prices.length - 1].t, p: currentPrice };
      } else {
        currentPrice = prices[prices.length - 1].p;
      }
    }

    // Derive high/low from chart if API didn't return them
    if (prices.length > 0) {
      if (high24h === null) high24h = Math.max(...prices.map((p) => p.p));
      if (low24h  === null) low24h  = Math.min(...prices.map((p) => p.p));
    }

    return NextResponse.json({
      prices,
      currentPrice:      currentPrice ?? DEFAULT_PRICE[symbol] ?? null,
      change24h,
      high24h,
      low24h,
      marketCap:         marketCap ?? DEFAULT_MARKET_CAP[symbol] ?? null,
      rank,
      circulatingSupply,
      description,
      contractAddress,
      website,
      twitter
    });
  } catch {
    return NextResponse.json(buildFullFallback(symbol, normalizedChain, Number(days)), { status: 200 });
  }
}

function buildFallbackPrices(symbol: string, days: number) {
  const now   = Date.now();
  const step  = (days * 24 * 60 * 60 * 1000) / 100;
  const base  = DEFAULT_PRICE[symbol] ?? 1;
  return Array.from({ length: 100 }, (_, i) => ({
    t: now - (100 - i) * step,
    p: base * (1 + (Math.random() - 0.5) * 0.05)
  }));
}

function buildFullFallback(symbol: string, chain: 'Base' | 'Solana', days: number) {
  const prices = buildFallbackPrices(symbol, days);
  return {
    prices,
    currentPrice:      DEFAULT_PRICE[symbol] ?? null,
    change24h:         null,
    high24h:           Math.max(...prices.map((p) => p.p)),
    low24h:            Math.min(...prices.map((p) => p.p)),
    marketCap:         DEFAULT_MARKET_CAP[symbol] ?? null,
    rank:              null,
    circulatingSupply: null,
    description:       TOKEN_DESCRIPTION[symbol] ?? null,
    contractAddress:   CONTRACT_ADDRESS[`${chain}:${symbol}`] ?? null,
    website:           null,
    twitter:           null
  };
}
