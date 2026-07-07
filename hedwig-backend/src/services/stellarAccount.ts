import { Keypair, Horizon, Networks, Asset, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { createLogger } from '../utils/logger';

const logger = createLogger('StellarAccount');

/**
 * Generate a new Stellar keypair.
 * Returns public key (G-address) and encrypted seed for secure storage.
 */
export function generateStellarKeypair(): {
  publicKey: string;
  encryptedSeed: string;
} {
  const pair = Keypair.random();
  const publicKey = pair.publicKey();
  const seed = pair.secret();

  const encryptedSeed = encryptSeed(seed);

  logger.info('Generated new Stellar keypair', { publicKey });

  return { publicKey, encryptedSeed };
}

/**
 * Decrypt a Stellar seed from storage.
 */
export function decryptStellarSeed(encryptedSeed: string): string {
  const key = getEncryptionKey();
  const parts = encryptedSeed.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted seed format');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const crypto = require('crypto');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Get a Stellar Keypair from an encrypted seed.
 */
export function getKeypairFromEncryptedSeed(encryptedSeed: string): Keypair {
  const seed = decryptStellarSeed(encryptedSeed);
  return Keypair.fromSecret(seed);
}

/**
 * Get the encryption key for Stellar seeds.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.STELLAR_ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error('STELLAR_ENCRYPTION_KEY environment variable is not set');
  }
  return Buffer.from(envKey, 'hex');
}

/**
 * Encrypt a Stellar seed using AES-256-GCM.
 */
function encryptSeed(seed: string): string {
  const key = getEncryptionKey();
  const crypto = require('crypto');

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(seed, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Fund a new Stellar account on testnet via Friendbot.
 * On mainnet, this would be done via the distribution account.
 */
export async function fundTestnetAccount(publicKey: string): Promise<void> {
  const isTestnet = process.env.STELLAR_NETWORK === 'testnet' || !process.env.STELLAR_NETWORK;

  if (!isTestnet) {
    logger.info('Not testnet, skipping Friendbot funding', { publicKey });
    return;
  }

  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );
    const result = await response.json();

    if (result.successful) {
      logger.info('Account funded via Friendbot', { publicKey });
    } else {
      logger.warn('Friendbot funding may have failed', { publicKey, result });
    }
  } catch (error: any) {
    logger.warn('Failed to fund account via Friendbot', {
      publicKey,
      error: error.message,
    });
  }
}

/**
 * Fund a new Stellar account on testnet via Friendbot,
 * then set up a USDC trustline. Runs sequentially because
 * trustline requires the account to exist on-chain.
 */
export async function fundAndSetupTrustline(publicKey: string, encryptedSeed: string): Promise<void> {
  const isTestnet = process.env.STELLAR_NETWORK === 'testnet' || !process.env.STELLAR_NETWORK;

  if (!isTestnet) {
    logger.info('Not testnet, skipping funding + trustline', { publicKey });
    return;
  }

  try {
    // 1. Fund via Friendbot
    const fbResponse = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );
    const fbResult = await fbResponse.json();

    if (!fbResult.successful) {
      logger.warn('Friendbot funding failed, cannot set up trustline', { publicKey, fbResult });
      return;
    }

    logger.info('Account funded via Friendbot', { publicKey });

    // 2. Wait briefly for the network to confirm
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 3. Set up USDC trustline
    const keypair = getKeypairFromEncryptedSeed(encryptedSeed);
    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    const server = new Horizon.Server(horizonUrl);

    let account;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        account = await server.loadAccount(keypair.publicKey());
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    if (!account) {
      logger.warn('Account not found on Horizon after funding', { publicKey });
      return;
    }

    const usdcIssuer = process.env.STELLAR_USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    const usdc = new Asset('USDC', usdcIssuer);

    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.changeTrust({ asset: usdc }))
      .setTimeout(30)
      .build();

    transaction.sign(keypair);
    const result = await server.submitTransaction(transaction);

    logger.info('USDC trustline set up', {
      publicKey: keypair.publicKey(),
      hash: result.hash,
    });
  } catch (error: any) {
    logger.warn('Failed to fund + set up USDC trustline', {
      publicKey,
      error: error.message,
    });
  }
}

/**
 * Send USDC from one Stellar account to another.
 * Used to fund the SDP distribution account from the workspace treasury wallet before payroll.
 */
export async function sendStellarUsdc(
  fromSecret: string,
  toAddress: string,
  amountUsdc: number,
): Promise<string> {
  const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
  const server = new Horizon.Server(horizonUrl);
  const keypair = Keypair.fromSecret(fromSecret);
  const usdcIssuer = process.env.STELLAR_USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const networkPassphrase = process.env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

  const account = await server.loadAccount(keypair.publicKey());
  const usdc = new Asset('USDC', usdcIssuer);

  const transaction = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(Operation.payment({
      destination: toAddress,
      asset: usdc,
      amount: amountUsdc.toString(),
    }))
    .setTimeout(30)
    .build();

  transaction.sign(keypair);
  const result = await server.submitTransaction(transaction);

  logger.info('Stellar USDC sent', {
    from: keypair.publicKey(),
    to: toAddress,
    amount: amountUsdc,
    hash: result.hash,
  });

  return result.hash;
}
