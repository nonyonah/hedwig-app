import { Keypair, Networks, TransactionBuilder, Operation, Asset, Horizon } from '@stellar/stellar-sdk';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { getKeypairFromEncryptedSeed } from './stellarAccount';

const logger = createLogger('StellarAnchor');

// ─── Types ───────────────────────────────────────────────────────────

interface AnchorToml {
  WEB_AUTH_ENDPOINT?: string;
  TRANSFER_SERVER?: string;
  TRANSFER_SERVER_SEP0024?: string;
  SIGNING_KEY?: string;
  DIRECT_PAYMENT_SERVER?: string;
  CURRENCIES?: Array<{
    code: string;
    issuer: string;
    status: string;
    is_asset_anchored?: boolean;
    anchor_asset?: string;
    anchor_asset_type?: string;
    display_decimals?: number;
    redemption_instructions?: string;
  }>;
}

export interface AnchorWithdrawResult {
  transactionId: string;
  stellarAddress: string;
  memoType: string;
  memo: string;
  minAmount?: string;
  eta?: number;
}

export interface AnchorKycResult {
  customerId: string;
  status: 'accepted' | 'pending' | 'rejected';
}

export interface StellarOfframpRecord {
  id: string;
  userId: string;
  workspaceId?: string;
  anchor: string;
  sourceAsset: string;
  sourceAmount: number;
  destAsset: string;
  destAmount: number;
  bankName: string;
  bankAccountNumber: string;
  bankSortCode: string;
  status: 'pending_auth' | 'pending_kyc' | 'pending_withdrawal' | 'pending_delivery' | 'completed' | 'failed';
  anchorTxId?: string;
  stellarTxHash?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Anchor Configuration ─────────────────────────────────────────────

export const ANCHORS: Record<string, { domain: string; name: string; currencies: string[] }> = {
  cowrie: {
    domain: 'api.cowrie.exchange',
    name: 'Cowrie Exchange',
    currencies: ['NGN'],
  },
};

const STELLAR_NETWORK = process.env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const USDC_ISSUER = process.env.STELLAR_USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

// ─── Discovery ────────────────────────────────────────────────────────

export async function discoverAnchor(domain: string): Promise<AnchorToml> {
  const url = `https://${domain}/.well-known/stellar.toml`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch stellar.toml from ${url}`);
  const text = await res.text();
  return parseToml(text);
}

function parseToml(text: string): AnchorToml {
  const result: any = {};
  let currentSection: string | null = null;
  const currencies: any[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    if (currentSection === 'CURRENCIES') {
      const kv = trimmed.match(/^(\w+)\s*=\s*["']?(.+?)["']?$/);
      if (kv) {
        const entry = currencies[currencies.length - 1] || {};
        entry[kv[1]] = kv[2];
        currencies[currencies.length - 1] = entry;
      }
      continue;
    }

    const kv = trimmed.match(/^(\w+)\s*=\s*["']?(.+?)["']?$/);
    if (kv) {
      result[kv[1]] = kv[2];
    }
  }

  if (currencies.length > 0) result.CURRENCIES = currencies;
  return result;
}

// ─── SEP-10 Authentication ────────────────────────────────────────────

export async function sep10Authenticate(
  webAuthEndpoint: string,
  _signingKey: string,
  userKeypair: Keypair,
): Promise<string> {
  // 1. Get challenge from anchor
  const challengeUrl = `${webAuthEndpoint}?account=${userKeypair.publicKey()}`;
  logger.info('Requesting SEP-10 challenge', { url: challengeUrl });

  const challengeRes = await fetch(challengeUrl);
  if (!challengeRes.ok) {
    const text = await challengeRes.text();
    throw new Error(`SEP-10 challenge failed: ${text}`);
  }

  const challengeData = await challengeRes.json();
  const challengeTxXdr = challengeData.transaction;

  // 2. Sign the challenge transaction
  const envelope = TransactionBuilder.fromXDR(challengeTxXdr, STELLAR_NETWORK);
  envelope.sign(userKeypair);

  // 3. Submit signed challenge to get JWT
  const signedXdr = envelope.toXDR();
  const tokenRes = await fetch(webAuthEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signedXdr }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`SEP-10 token exchange failed: ${text}`);
  }

  const tokenData = await tokenRes.json();
  const jwt = tokenData.token;

  if (!jwt) throw new Error('SEP-10: No JWT returned');

  logger.info('SEP-10 authentication successful');
  return jwt;
}

// ─── SEP-12 KYC ───────────────────────────────────────────────────────

export async function sep12PutCustomer(
  transferServer: string,
  jwt: string,
  kycData: Record<string, string>,
): Promise<AnchorKycResult> {
  const url = `${transferServer}/customer`;
  logger.info('Submitting SEP-12 KYC', { url });

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(kycData),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SEP-12 KYC failed: ${text}`);
  }

  const data = await res.json();
  return {
    customerId: data.id,
    status: data.status || 'pending',
  };
}

// ─── SEP-6 Withdrawal ─────────────────────────────────────────────────

export async function sep6Withdraw(
  transferServer: string,
  jwt: string,
  params: {
    assetCode: string;
    assetIssuer: string;
    amount: string;
    dest: string;
    destExtra: string;
  },
): Promise<AnchorWithdrawResult> {
  const url = `${transferServer}/withdraw`;
  logger.info('Initiating SEP-6 withdrawal', { url, assetCode: params.assetCode, amount: params.amount });

  const queryParams = new URLSearchParams({
    asset_code: params.assetCode,
    asset_issuer: params.assetIssuer,
    amount: params.amount,
    dest: params.dest,
    dest_extra: params.destExtra,
  });

  const res = await fetch(`${url}?${queryParams}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SEP-6 withdrawal failed: ${text}`);
  }

  const data = await res.json();
  logger.info('SEP-6 withdrawal initiated', { transactionId: data.id });

  return {
    transactionId: data.id,
    stellarAddress: data.account_id || data.how,
    memoType: data.memo_type || 'text',
    memo: data.memo || '',
    minAmount: data.min_amount,
    eta: data.eta,
  };
}

// ─── Swap USDC → NGNT via Stellar Path Payment ───────────────────────

export async function swapUsdcToAsset(
  userEncryptedSeed: string,
  destAssetCode: string,
  destAssetIssuer: string,
  amountUsdc: number,
): Promise<string> {
  const userKeypair = getKeypairFromEncryptedSeed(userEncryptedSeed);
  const server = new Horizon.Server(HORIZON_URL);

  const account = await server.loadAccount(userKeypair.publicKey());
  const sendAsset = new Asset('USDC', USDC_ISSUER);
  const destAsset = new Asset(destAssetCode, destAssetIssuer);

  const amountStr = amountUsdc.toFixed(7);

  // Use path payment strict send to swap through the DEX
  const pathPaymentTx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: STELLAR_NETWORK,
  })
    .addOperation(Operation.pathPaymentStrictSend({
      sendAsset,
      sendAmount: amountStr,
      destination: userKeypair.publicKey(),
      destAsset,
      destMin: '0', // accept any rate
    }))
    .setTimeout(30)
    .build();

  pathPaymentTx.sign(userKeypair);
  const result = await server.submitTransaction(pathPaymentTx);

  logger.info('Path payment completed', { hash: result.hash });
  return result.hash;
}

// ─── Main Off-Ramp Flow ───────────────────────────────────────────────

export async function initiateAnchorOfframp(params: {
  userId: string;
  workspaceId?: string;
  anchorId: string;
  userEncryptedSeed: string;
  sourceAmountUsdc: number;
  bankName: string;
  bankAccountNumber: string;
  bankSortCode: string;
}): Promise<StellarOfframpRecord> {
  const anchor = ANCHORS[params.anchorId];
  if (!anchor) throw new Error(`Unknown anchor: ${params.anchorId}`);

  logger.info('Initiating anchor off-ramp', {
    anchor: params.anchorId,
    amount: params.sourceAmountUsdc,
    bank: params.bankName,
  });

  const toml = await discoverAnchor(anchor.domain);
  if (!toml.WEB_AUTH_ENDPOINT || !toml.TRANSFER_SERVER || !toml.SIGNING_KEY) {
    throw new Error('Anchor missing required SEP endpoints in stellar.toml');
  }

  const userKeypair = getKeypairFromEncryptedSeed(params.userEncryptedSeed);

  // 1. SEP-10 auth
  const jwt = await sep10Authenticate(toml.WEB_AUTH_ENDPOINT, toml.SIGNING_KEY, userKeypair);

  // 2. Submit minimal KYC (name + bank info)
  await sep12PutCustomer(toml.TRANSFER_SERVER, jwt, {
    first_name: '',
    last_name: '',
    bank_account_number: params.bankAccountNumber,
    bank_account_type: 'checking',
  });

  // 3. Find NGNT asset in anchor's currencies
  const ngntCurrency = toml.CURRENCIES?.find((c) => c.anchor_asset === 'NGN');
  if (!ngntCurrency) throw new Error('Anchor does not support NGN off-ramp');

  // 4. Swap USDC → NGNT via path payment
  let swapTxHash: string | undefined;
  try {
    swapTxHash = await swapUsdcToAsset(
      params.userEncryptedSeed,
      ngntCurrency.code,
      ngntCurrency.issuer,
      params.sourceAmountUsdc,
    );
  } catch (err: any) {
    logger.warn('Path payment swap failed, proceeding with direct NGNT withdrawal', { error: err.message });
  }

  // 5. Initiate SEP-6 withdrawal
  const withdrawResult = await sep6Withdraw(toml.TRANSFER_SERVER, jwt, {
    assetCode: ngntCurrency.code,
    assetIssuer: ngntCurrency.issuer,
    amount: params.sourceAmountUsdc.toString(),
    dest: params.bankAccountNumber,
    destExtra: params.bankSortCode,
  });

  // 6. Record off-ramp
  const { data: record, error: dbError } = await supabase
    .from('stellar_offramps')
    .insert({
      user_id: params.userId,
      workspace_id: params.workspaceId || null,
      anchor: params.anchorId,
      source_asset: 'USDC',
      source_amount: params.sourceAmountUsdc,
      dest_asset: 'NGN',
      dest_amount: params.sourceAmountUsdc,
      bank_name: params.bankName,
      bank_account_number: params.bankAccountNumber,
      bank_sort_code: params.bankSortCode,
      status: 'pending_delivery',
      anchor_tx_id: withdrawResult.transactionId,
      stellar_tx_hash: swapTxHash || null,
    })
    .select()
    .single();

  if (dbError) {
    logger.error('Failed to save off-ramp record', { error: dbError });
    throw new Error('Failed to record off-ramp');
  }

  logger.info('Anchor off-ramp initiated', { recordId: record.id });
  return formatRecord(record);
}

// ─── Check Off-Ramp Status ───────────────────────────────────────────

export async function checkAnchorOfframpStatus(
  offrampId: string,
): Promise<StellarOfframpRecord | null> {
  const { data, error } = await supabase
    .from('stellar_offramps')
    .select('*')
    .eq('id', offrampId)
    .maybeSingle();

  if (error || !data) return null;
  return formatRecord(data);
}

export async function listAnchorOfframps(userId: string): Promise<StellarOfframpRecord[]> {
  const { data, error } = await supabase
    .from('stellar_offramps')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return [];
  return (data || []).map(formatRecord);
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatRecord(row: any): StellarOfframpRecord {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    anchor: row.anchor,
    sourceAsset: row.source_asset,
    sourceAmount: row.source_amount,
    destAsset: row.dest_asset,
    destAmount: row.dest_amount,
    bankName: row.bank_name,
    bankAccountNumber: row.bank_account_number,
    bankSortCode: row.bank_sort_code,
    status: row.status,
    anchorTxId: row.anchor_tx_id,
    stellarTxHash: row.stellar_tx_hash,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
