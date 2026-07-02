import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import {
  encodeFunctionData,
  createPublicClient,
  http,
  Address,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import {
  Address as StellarAddress,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  Transaction,
  TransactionBuilder,
  xdr,
  StrKey,
} from '@stellar/stellar-sdk';
import { getPrivyNodeClient } from './privyWallets';

const logger = createLogger('CctpStellar');

const IS_TESTNET = process.env.NETWORK_MODE === 'testnet';
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';

// ─── CCTP Contract Addresses ─────────────────────────────────────────────

// Stellar Soroban contracts
const STELLAR_RPC_URL = IS_TESTNET
  ? 'https://soroban-testnet.stellar.org'
  : 'https://soroban.stellar.org';

const STELLAR_NETWORK_PASSPHRASE = IS_TESTNET
  ? 'Test SDF Network ; September 2015'
  : 'Public Global Stellar Network ; September 2015';

const STELLAR_TOKEN_MESSENGER_MINTER = IS_TESTNET
  ? 'CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP'
  : 'CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL';

const STELLAR_USDC_CONTRACT = IS_TESTNET
  ? 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'
  : 'CAKJ2T5LTPGEVGBY63K346W7QNIYWXYA5GQP3IOFPJRAVJ7Y7UR3IELC';

// CctpForwarder on Stellar (used by EVM → Stellar flow)
const CCTP_FORWARDER_STRKEY = IS_TESTNET
  ? 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ'
  : 'CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T';

// EVM contracts on Base
const MESSAGE_TRANSMITTER_BASE = IS_TESTNET
  ? '0xad097dFE8049bF08aB0361CfB918cfb5b03DeC41'
  : '0xAD097dFE8049bF08aB0361CfB918cfb5b03DeC41';

const USDC_BASE_OLD = IS_TESTNET
  ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const TOKEN_MESSENGER_OLD = IS_TESTNET
  ? '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5'
  : '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962';

// CCTP domain IDs: Base = 6, Stellar = 27
const BASE_DOMAIN = 6;
const STELLAR_DOMAIN = 27;

const CHAIN_ID = IS_TESTNET ? 84532 : 8453;
const CAIP2 = `eip155:${CHAIN_ID}`;

// ─── Helpers ─────────────────────────────────────────────────────────────

function evmAddressToBytes32(evmAddress: string): `0x${string}` {
  const clean = evmAddress.replace('0x', '').toLowerCase();
  return `0x${'000000000000000000000000'}${clean}` as `0x${string}`;
}

// ─── Soroban Transaction Helper ─────────────────────────────────────────

async function submitSorobanTx(
  server: rpc.Server,
  sourceKeypair: Keypair,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<string> {
  const account = await server.getAccount(sourceKeypair.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: '10000000',
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(120)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${JSON.stringify(simulated)}`);
  }

  const prepared = rpc.assembleTransaction(tx, simulated).build();
  prepared.sign(sourceKeypair);

  const sendResult = await server.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Send failed: ${JSON.stringify(sendResult)}`);
  }

  let getResult = await server.getTransaction(sendResult.hash);
  while (getResult.status === 'NOT_FOUND') {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    getResult = await server.getTransaction(sendResult.hash);
  }

  if (getResult.status !== 'SUCCESS') {
    throw new Error(`Transaction failed: ${JSON.stringify(getResult)}`);
  }

  return sendResult.hash;
}

// ─── Build unsigned Soroban XDRs (for user to sign) ─────────────────────

export interface StellarCctpTransactions {
  approveXdr: string;
  burnXdr: string;
  memoText: string;
}

async function simulateAndBuildUnsigned(
  server: rpc.Server,
  sourceAddress: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<string> {
  const account = await server.getAccount(sourceAddress);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(300)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed for ${method}: ${JSON.stringify(simulated)}`);
  }

  const mutable = new Transaction(
    tx.toEnvelope().toXDR('base64'),
    STELLAR_NETWORK_PASSPHRASE,
  );

  return mutable.toXDR();
}

export async function buildStellarCctpTransactions(
  userStellarAddress: string,
  destinationBaseAddress: string,
  amountUsdc: number,
  memoText: string,
): Promise<StellarCctpTransactions> {
  const server = new rpc.Server(STELLAR_RPC_URL);
  const latestLedger = await server.getLatestLedger();
  const expirationLedger = latestLedger.sequence + 100_000;

  // Stellar USDC has 7 decimals
  const rawAmount = BigInt(Math.round(amountUsdc * 10_000_000));
  const maxFee = BigInt(Math.round(Math.min(amountUsdc * 0.01, 10) * 10_000_000));

  const destinationDomain = BASE_DOMAIN;
  const mintRecipientBytes = evmAddressToBytes32(destinationBaseAddress);
  const mintRecipient = xdr.ScVal.scvBytes(
    Buffer.from(mintRecipientBytes.slice(2), 'hex'),
  );

  const userScAddr = StellarAddress.fromString(userStellarAddress);

  // --- Approve XDR ---
  const approveXdr = await simulateAndBuildUnsigned(
    server,
    userStellarAddress,
    STELLAR_USDC_CONTRACT,
    'approve',
    [
      userScAddr.toScVal(),
      StellarAddress.fromString(STELLAR_TOKEN_MESSENGER_MINTER).toScVal(),
      nativeToScVal(rawAmount, { type: 'i128' }),
      nativeToScVal(expirationLedger, { type: 'u32' }),
    ],
  );

  // --- deposit_for_burn XDR ---
  const burnXdr = await simulateAndBuildUnsigned(
    server,
    userStellarAddress,
    STELLAR_TOKEN_MESSENGER_MINTER,
    'deposit_for_burn',
    [
      userScAddr.toScVal(),
      nativeToScVal(rawAmount, { type: 'i128' }),
      nativeToScVal(destinationDomain, { type: 'u32' }),
      mintRecipient,
      StellarAddress.fromString(STELLAR_USDC_CONTRACT).toScVal(),
      xdr.ScVal.scvBytes(Buffer.alloc(32)),
      nativeToScVal(maxFee, { type: 'i128' }),
      nativeToScVal(1000, { type: 'u32' }),
    ],
  );

  return { approveXdr, burnXdr, memoText };
}

// ─── Build + Submit Soroban transactions (backend-controlled key) ────────

export async function executeStellarCctpBurn(
  stellarSecretKey: string,
  destinationBaseAddress: string,
  amountUsdc: number,
): Promise<string> {
  const keypair = Keypair.fromSecret(stellarSecretKey);
  const server = new rpc.Server(STELLAR_RPC_URL);
  const latestLedger = await server.getLatestLedger();
  const expirationLedger = latestLedger.sequence + 100_000;

  const rawAmount = BigInt(Math.round(amountUsdc * 10_000_000));
  const maxFee = BigInt(Math.round(Math.min(amountUsdc * 0.005, 5) * 10_000_000));
  const destinationDomain = BASE_DOMAIN;
  const mintRecipientBytes = evmAddressToBytes32(destinationBaseAddress);
  const mintRecipient = xdr.ScVal.scvBytes(
    Buffer.from(mintRecipientBytes.slice(2), 'hex'),
  );

  const userScAddr = StellarAddress.fromString(keypair.publicKey());

  // 1. Approve
  logger.info('Approving TokenMessengerMinter on Stellar...');
  await submitSorobanTx(server, keypair, STELLAR_USDC_CONTRACT, 'approve', [
    userScAddr.toScVal(),
    StellarAddress.fromString(STELLAR_TOKEN_MESSENGER_MINTER).toScVal(),
    nativeToScVal(rawAmount, { type: 'i128' }),
    nativeToScVal(expirationLedger, { type: 'u32' }),
  ]);

  // 2. deposit_for_burn
  logger.info('Burning USDC on Stellar via CCTP...');
  const burnTxHash = await submitSorobanTx(
    server,
    keypair,
    STELLAR_TOKEN_MESSENGER_MINTER,
    'deposit_for_burn',
    [
      userScAddr.toScVal(),
      nativeToScVal(rawAmount, { type: 'i128' }),
      nativeToScVal(destinationDomain, { type: 'u32' }),
      mintRecipient,
      StellarAddress.fromString(STELLAR_USDC_CONTRACT).toScVal(),
      xdr.ScVal.scvBytes(Buffer.alloc(32)),
      nativeToScVal(maxFee, { type: 'i128' }),
      nativeToScVal(1000, { type: 'u32' }),
    ],
  );

  return burnTxHash;
}

// ─── Poll Circle Attestation API ─────────────────────────────────────────

export async function pollCircleAttestation(
  burnTxHash: string,
  maxAttempts = 120,
  intervalMs = 5000,
): Promise<{ message: string; attestation: string } | null> {
  const url = `https://iris-api-sandbox.circle.com/v2/messages/${STELLAR_DOMAIN}?transactionHash=${burnTxHash}`;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        if (res.status !== 404) {
          logger.warn('Attestation API error', { status: res.status });
        }
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }

      const data = await res.json();
      const msg = data?.messages?.[0];
      if (msg?.status === 'complete') {
        logger.info('Attestation ready', { burnTxHash });
        return { message: msg.message, attestation: msg.attestation };
      }
    } catch (e: any) {
      logger.warn('Attestation poll error', { error: e.message });
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  logger.warn('Attestation polling timed out', { burnTxHash });
  return null;
}

// ─── Complete mint on Base via receiveMessage ───────────────────────────

export async function completeMintOnBase(
  message: string,
  attestation: string,
  privyWalletId: string,
): Promise<string> {
  const privy = getPrivyNodeClient();

  const receiveData = encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'receiveMessage',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'message', type: 'bytes' },
          { name: 'attestation', type: 'bytes' },
        ],
        outputs: [],
      },
    ],
    functionName: 'receiveMessage',
    args: [message as `0x${string}`, attestation as `0x${string}`],
  });

  const txRes = await privy
    .wallets()
    .ethereum()
    .sendTransaction(privyWalletId, {
      caip2: CAIP2,
      params: {
        transaction: {
          to: MESSAGE_TRANSMITTER_BASE as Address,
          data: receiveData,
          chain_id: CHAIN_ID,
        },
      },
    });

  logger.info('receiveMessage submitted on Base', { txHash: txRes.hash });
  return txRes.hash;
}

// ─── Full CCTP Bridge (backend-controlled Stellar key) ──────────────────

export async function bridgeStellarToBase(
  stellarSecretKey: string,
  destinationBaseAddress: string,
  amountUsdc: number,
  workspaceId: string,
): Promise<{ burnTxHash: string; mintTxHash?: string }> {
  // 1. Approve + Burn on Stellar
  const burnTxHash = await executeStellarCctpBurn(
    stellarSecretKey,
    destinationBaseAddress,
    amountUsdc,
  );

  // 2. Poll Circle attestation (up to 10 min)
  const attestation = await pollCircleAttestation(burnTxHash);
  if (!attestation) {
    throw new Error('Attestation not ready within timeout. Burn TX: ' + burnTxHash);
  }

  // 3. Resolve workspace Privy wallet to call receiveMessage on Base
  const privy = getPrivyNodeClient();
  const { data: treasuryWallet } = await supabase
    .from('treasury_wallets')
    .select('privy_wallet_address, privy_wallet_id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle();

  if (!treasuryWallet?.privy_wallet_address) {
    throw new Error('No Base treasury wallet found for workspace');
  }

  let privyWalletId = treasuryWallet.privy_wallet_id;
  if (!privyWalletId) {
    for await (const w of privy.wallets().list({ chain_type: 'ethereum' })) {
      if (w.address.toLowerCase() === treasuryWallet.privy_wallet_address.toLowerCase()) {
        privyWalletId = w.id;
        break;
      }
    }
  }
  if (!privyWalletId) throw new Error('Could not resolve treasury Privy wallet ID');

  // 4. Complete mint on Base
  const mintTxHash = await completeMintOnBase(
    attestation.message,
    attestation.attestation,
    privyWalletId,
  );

  return { burnTxHash, mintTxHash };
}

// ─── Bridge — EVM → Stellar via CCTP (used by workspace treasury flow) ──

export async function bridgeUsdcToStellar(
  workspaceId: string,
  amountUsdc: number,
): Promise<{
  approveTxHash?: string;
  bridgeTxHash: string;
}> {
  const privyClient = getPrivyNodeClient();

  const { data: treasuryWallet } = await supabase
    .from('treasury_wallets')
    .select('privy_wallet_address, privy_wallet_id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle();

  if (!treasuryWallet?.privy_wallet_address) {
    throw new Error('No Base treasury wallet found for this workspace');
  }

  let privyWalletId = treasuryWallet.privy_wallet_id;
  if (!privyWalletId) {
    for await (const w of privyClient.wallets().list({ chain_type: 'ethereum' })) {
      if (w.address.toLowerCase() === treasuryWallet.privy_wallet_address.toLowerCase()) {
        privyWalletId = w.id;
        break;
      }
    }
  }
  if (!privyWalletId) throw new Error('Could not resolve treasury Privy wallet ID');

  const { data: wsStellar } = await supabase
    .from('workspaces')
    .select('stellar_treasury_public_key')
    .eq('id', workspaceId)
    .maybeSingle();

  if (!wsStellar?.stellar_treasury_public_key) {
    throw new Error('No Stellar treasury wallet configured for this workspace');
  }

  const stellarRecipient = wsStellar.stellar_treasury_public_key;
  const cctpForwarderBytes32 = `0x${Buffer.from(StrKey.decodeContract(CCTP_FORWARDER_STRKEY)).toString('hex')}` as `0x${string}`;
  const hookData = `0x${Buffer.from(StrKey.decodeEd25519PublicKey(stellarRecipient)).toString('hex')}` as `0x${string}`;

  const rawAmount = BigInt(Math.round(amountUsdc * 1_000_000));

  // 1. Approve USDC spend
  const approveData = encodeFunctionData({
    abi: [
      { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
    ],
    functionName: 'approve',
    args: [TOKEN_MESSENGER_OLD as Address, rawAmount],
  });

  const approveRes = await privyClient
    .wallets()
    .ethereum()
    .sendTransaction(privyWalletId, {
      caip2: CAIP2,
      params: {
        transaction: {
          to: USDC_BASE_OLD as Address,
          data: approveData,
          chain_id: CHAIN_ID,
        },
      },
    });

  logger.info('USDC approval sent for CCTP bridge', { txHash: approveRes.hash });
  await new Promise((r) => setTimeout(r, 5000));

  // 2. depositForBurnWithHook
  const bridgeData = encodeFunctionData({
    abi: [
      {
        type: 'function', name: 'depositForBurnWithHook',
        inputs: [
          { name: 'amount', type: 'uint256' },
          { name: 'destinationDomain', type: 'uint32' },
          { name: 'mintRecipient', type: 'bytes32' },
          { name: 'burnToken', type: 'address' },
          { name: 'destinationCaller', type: 'bytes32' },
          { name: 'maxFee', type: 'uint256' },
          { name: 'minFinalityThreshold', type: 'uint32' },
          { name: 'hookData', type: 'bytes' },
        ],
        outputs: [],
      },
    ],
    functionName: 'depositForBurnWithHook',
    args: [
      rawAmount,
      STELLAR_DOMAIN,
      cctpForwarderBytes32,
      USDC_BASE_OLD as Address,
      cctpForwarderBytes32,
      0n,
      0,
      hookData,
    ],
  });

  const bridgeRes = await privyClient
    .wallets()
    .ethereum()
    .sendTransaction(privyWalletId, {
      caip2: CAIP2,
      params: {
        transaction: {
          to: TOKEN_MESSENGER_OLD as Address,
          data: bridgeData,
          chain_id: CHAIN_ID,
        },
      },
    });

  logger.info('CCTP bridge depositForBurnWithHook submitted', {
    txHash: bridgeRes.hash,
    amount: amountUsdc,
    destination: stellarRecipient,
  });

  return { approveTxHash: approveRes.hash, bridgeTxHash: bridgeRes.hash };
}

// ─── Check CCTP bridge status via Circle attestation API ─────────────────

export async function checkBridgeStatus(
  evmTxHash: string,
): Promise<{
  attested: boolean;
  status: 'pending' | 'confirmed' | 'failed';
  message?: string;
}> {
  try {
    const publicClient = createPublicClient({
      chain: IS_TESTNET ? baseSepolia : base,
      transport: http(),
    });

    const receipt = await publicClient.getTransactionReceipt({
      hash: evmTxHash as Address,
    });

    if (!receipt) {
      return { attested: false, status: 'pending', message: 'Transaction not yet mined' };
    }

    if (receipt.status === 'reverted') {
      return { attested: false, status: 'failed', message: 'Transaction reverted on-chain' };
    }

    const messageSentTopic = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036';

    const messageLog = receipt.logs.find(
      (l) => l.topics[0] === messageSentTopic,
    );

    if (messageLog && CIRCLE_API_KEY) {
      try {
        const { decodeEventLog, parseAbiItem, keccak256 } = await import('viem');
        const decoded = decodeEventLog({
          abi: [parseAbiItem('event MessageSent(bytes message)')],
          data: messageLog.data,
          topics: [messageSentTopic, ...messageLog.topics.slice(1).map(t => t as `0x${string}`)],
        });
        const message = (decoded as any).args?.message as string;
        if (message) {
          const msgHash = keccak256(message as `0x${string}`);

          const res = await fetch(
            `https://api.circle.com/v2/messages/${BASE_DOMAIN}/attestations/${msgHash}`,
            { headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` } },
          );

          if (res.ok) {
            const body = await res.json();
            if (body.status === 'complete') {
              return { attested: true, status: 'confirmed' };
            }
            return { attested: false, status: 'pending', message: 'Awaiting Circle attestation' };
          }
        }
      } catch (e: any) {
        logger.warn('Failed to decode MessageSent event', { error: e.message });
      }
    }

    return { attested: true, status: 'confirmed' };
  } catch (e: any) {
    return { attested: false, status: 'pending', message: e.message };
  }
}
