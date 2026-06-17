import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { getPrivyNodeClient } from './privyWallets';
import crypto from 'crypto';
import { isAddress, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, parseUnits } from 'viem';
import { base } from 'viem/chains';

const logger = createLogger('Payroll');

const IS_TESTNET = process.env.NETWORK_MODE === 'testnet';
const PRIVY_CHAIN = IS_TESTNET ? 'base_sepolia' as const : 'base' as const;
const PRIVY_API = 'https://api.privy.io';

const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const PREVIEW_EXPIRY_SECONDS = 300;

async function readPrivyUsdcBalance(privyWalletId: string): Promise<number> {
  try {
    const privy = getPrivyNodeClient();
    const response = await privy.wallets().balance.get(privyWalletId, {
      asset: 'usdc',
      chain: PRIVY_CHAIN,
    });
    logger.info('Privy balance check', { walletId: privyWalletId?.slice(0, 10), chain: PRIVY_CHAIN, balances: response?.balances?.length ?? 0 });
    const usdc = response?.balances?.find((b: any) => b.asset === 'usdc');
    if (usdc && usdc.raw_value) {
      return parseInt(usdc.raw_value, 10) / Math.pow(10, usdc.raw_value_decimals || 6);
    }
    return 0;
  } catch (e: any) {
    logger.error('Privy balance read failed', { chain: PRIVY_CHAIN, error: e?.message });
    return 0;
  }
}

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getPrivyAuth(): string {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) throw new Error('Privy app credentials not configured');
  return Buffer.from(`${appId}:${appSecret}`).toString('base64');
}

async function sendUsdcIndividually(
  privyWalletId: string,
  toAddress: string,
  amountUsdc: number,
): Promise<{ txHash: string }> {
  const res = await fetch(`${PRIVY_API}/v1/wallets/${privyWalletId}/transfer`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${getPrivyAuth()}`,
      'Content-Type': 'application/json',
      'privy-app-id': process.env.PRIVY_APP_ID!,
    },
    body: JSON.stringify({
      source: { asset: 'usdc', chain: PRIVY_CHAIN, amount: String(amountUsdc) },
      destination: { address: toAddress },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Privy transfer failed (${res.status}): ${errBody}`);
  }

  const body = await res.json();
  const txHash = body?.transaction_hash || body?.id;
  if (!txHash) throw new Error('No transaction hash returned from Privy transfer');
  return { txHash };
}

/**
 * Transfer USDC directly on-chain via viem (for external wallet recipients).
 * Uses the treasury private key to sign the ERC-20 transfer.
 */
async function sendUsdcOnChain(
  toAddress: string,
  amountUsdc: number,
): Promise<{ txHash: string }> {
  const pk = process.env.TREASURY_PRIVATE_KEY;
  if (!pk) throw new Error('TREASURY_PRIVATE_KEY not configured');

  const account = privateKeyToAccount(`0x${pk.replace('0x', '')}`);
  const client = createWalletClient({ account, chain: base, transport: http() });

  const rawAmount = parseUnits(String(amountUsdc), 6);

  const hash = await client.writeContract({
    address: USDC_BASE_ADDRESS,
    abi: [{
      name: 'transfer',
      type: 'function',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
    }],
    functionName: 'transfer',
    args: [getAddress(toAddress), rawAmount],
  });

  return { txHash: hash };
}

/**
 * Trigger auto-settlement for a payroll recipient.
 * Fires async — never blocks payroll execution.
 * Times out after 5 seconds.
 */
async function triggerAutoSettlement(
  recipientUserId: string,
  amountUsdc: number,
  payrollItemId: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, auto_settle, auto_settle_bank_account, ethereum_wallet_address')
      .eq('id', recipientUserId)
      .single();

    if (!user?.auto_settle || !user?.auto_settle_bank_account || !user?.ethereum_wallet_address) return;

    const bankAccount = user.auto_settle_bank_account as any;
    const PaycrestService = (await import('./paycrest')).default;

    // Verify bank account still valid
    const verifyResult = await PaycrestService.verifyBankAccount(
      bankAccount.institution,
      bankAccount.accountIdentifier,
      bankAccount.currency || 'NGN',
    );
    if (!verifyResult.verified) return;

    // Fetch rate
    const rate = await PaycrestService.getExchangeRate('USDC', amountUsdc, bankAccount.currency || 'NGN', 'base');

    const reference = `hedwig-as-${crypto.randomUUID()}`;

    // Create Paycrest offramp order
    const paycrestOrder = await PaycrestService.createOfframpOrder({
      amount: amountUsdc,
      token: 'USDC',
      network: 'base',
      rate,
      recipient: {
        institution: bankAccount.institution,
        accountIdentifier: bankAccount.accountIdentifier,
        accountName: bankAccount.accountName,
        currency: bankAccount.currency || 'NGN',
        memo: 'Auto-settlement',
      },
      returnAddress: user.ethereum_wallet_address,
      reference,
      metadata: bankAccount.metadata,
    });

    // Transfer USDC from recipient's personal wallet to Paycrest receive address
    const { txHash } = await sendUsdcOnChain(
      paycrestOrder.receiveAddress,
      amountUsdc + paycrestOrder.senderFee + paycrestOrder.transactionFee,
    );

    // Create offramp order record
    const { data: offrampOrder } = await supabase.from('offramp_orders').insert({
      user_id: recipientUserId,
      offramp_source: 'auto_settle',
      paycrest_order_id: paycrestOrder.id,
      status: 'deposited',
      chain: 'BASE',
      token: 'USDC',
      crypto_amount: amountUsdc,
      tx_hash: txHash,
      fiat_currency: (bankAccount.currency || 'NGN').toUpperCase(),
      fiat_amount: paycrestOrder.fiatAmount,
      exchange_rate: paycrestOrder.exchangeRate,
      service_fee: paycrestOrder.senderFee + paycrestOrder.transactionFee,
      receive_address: paycrestOrder.receiveAddress,
      bank_name: bankAccount.institution,
      account_number: bankAccount.accountIdentifier,
      account_name: bankAccount.accountName,
      reference,
    }).select().single();

    // Update payroll item
    await supabase.from('payroll_items').update({
      auto_settle_triggered: true,
      auto_settle_status: 'processing',
      auto_settle_offramp_order_id: offrampOrder?.id || null,
    }).eq('id', payrollItemId);

    // Notify recipient
    try {
      const NotificationService = (await import('./notifications')).default;
      const amountUsd = formatUsd(amountUsdc);
      await NotificationService.notifyUser(recipientUserId, {
        title: 'Auto-withdrawal started',
        body: `Your payment of $${amountUsd} is being sent to your bank.`,
      });
    } catch {}

  } catch (err: any) {
    if ((err as any)?.name === 'AbortError') {
      logger.warn('Auto-settlement timed out', { payrollItemId });
    } else {
      logger.error('Auto-settlement failed', { payrollItemId, error: err?.message });
    }

    // Mark as failed — USDC stays in wallet
    await supabase.from('payroll_items').update({
      auto_settle_status: 'failed',
    }).eq('id', payrollItemId);

    // Notify user
    try {
      const NotificationService = (await import('./notifications')).default;
      const amountUsd = formatUsd(amountUsdc);
      await NotificationService.notifyUser(recipientUserId, {
        title: 'Auto-withdrawal failed',
        body: `Auto-withdrawal failed. Your $${amountUsd} is safe in your wallet. Open the app to withdraw manually.`,
      });
    } catch {}
  } finally {
    clearTimeout(timeout);
  }
}

function signPreviewJwt(payload: Record<string, unknown>): string {
  const secret = process.env.PAYROLL_PREVIEW_SECRET;
  if (!secret) throw new Error('PAYROLL_PREVIEW_SECRET is not configured');

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

function verifyPreviewJwt(token: string): Record<string, unknown> {
  const secret = process.env.PAYROLL_PREVIEW_SECRET;
  if (!secret) throw new Error('PAYROLL_PREVIEW_SECRET is not configured');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid preview token');

  const validSig = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(validSig), Buffer.from(parts[2]))) {
    throw new Error('Invalid preview token signature');
  }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error('PREVIEW_EXPIRED');
  }
  return payload;
}

async function resolvePrivyWalletId(walletAddress: string): Promise<string | null> {
  try {
    const privy = getPrivyNodeClient();
    const wallets: AsyncIterable<any> = privy.wallets().list({ chain_type: 'ethereum' });
    for await (const w of wallets) {
      if (w.address.toLowerCase() === walletAddress.toLowerCase()) {
        return w.id;
      }
    }
  } catch { /* fallback */ }
  return null;
}

function usdcToRaw(amount: number): string {
  return Math.round(amount * 1e6).toString();
}

export const PayrollService = {
  async preview(
    workspaceId: string,
    _userId: string,
    runType: 'fixed' | 'project',
    items: Array<{ userId?: string; externalRecipientId?: string; walletAddress?: string; amountUsdc: string }>,
  ) {
    if (!items.length) throw new Error('At least one item is required');

    // 1. Validate items
    const internalItems = items.filter(i => i.userId);
    const externalItems = items.filter(i => i.externalRecipientId);

    // Validate internal items are workspace members
    if (internalItems.length > 0) {
      const { data: members } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspaceId);
      const memberIds = new Set((members || []).map((m: any) => m.user_id));
      for (const item of internalItems) {
        if (!memberIds.has(item.userId!)) {
          throw new Error(`User ${item.userId} is not a member of this workspace`);
        }
      }
    }

    // Validate external items exist and are active
    let extRecipients: any[] | null = null;
    if (externalItems.length > 0) {
      const extIds = externalItems.map(i => i.externalRecipientId);
      const { data } = await supabase
        .from('external_payroll_recipients')
        .select('id, display_name, wallet_address')
        .in('id', extIds);
      extRecipients = data;
      const extMap = new Map((extRecipients || []).map((r: any) => [r.id, r]));
      for (const item of externalItems) {
        const ext = extMap.get(item.externalRecipientId!);
        if (!ext) throw new Error(`External recipient ${item.externalRecipientId} not found`);
        if (!ext.wallet_address) throw new Error(`External recipient ${item.externalRecipientId} has no wallet address`);
        if (!isAddress(ext.wallet_address)) throw new Error(`Invalid wallet address for ${item.externalRecipientId}`);
      }
    }

    // 2. Calculate total
    const totalUsdcRaw = items.reduce((sum, i) => sum + parseFloat(i.amountUsdc), 0);
    const totalUsdc = totalUsdcRaw / 1e6;

    // 3. Fetch available balance
    const { data: treasuryWallet } = await supabase
      .from('treasury_wallets')
      .select('privy_wallet_address, privy_wallet_id')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .maybeSingle();

    if (!treasuryWallet?.privy_wallet_address) {
      throw new Error('No treasury wallet found');
    }

    let walletId = treasuryWallet.privy_wallet_id;
    if (!walletId) {
      walletId = await resolvePrivyWalletId(treasuryWallet.privy_wallet_address);
    }

    const onChainBalance = walletId
      ? await readPrivyUsdcBalance(walletId)
      : 0;

    const { data: reservedRows } = await supabase
      .from('treasury_transactions')
      .select('usdc_amount')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending_convert');

    const reserved = (reservedRows || []).reduce((s: number, r: any) => s + parseFloat(r.usdc_amount || '0'), 0);
    const availableUsdc = Math.max(0, onChainBalance - reserved);

    const { data: activeReservations } = await supabase
      .from('payroll_runs')
      .select('total_amount_usdc')
      .eq('workspace_id', workspaceId)
      .in('status', ['reserved', 'executing']);

    const payrollReserved = (activeReservations || []).reduce((s: number, r: any) => s + parseFloat(r.total_amount_usdc || '0'), 0);
    const finalAvailable = Math.max(0, availableUsdc - payrollReserved);

    if (totalUsdc > finalAvailable) {
      return {
        error: 'Insufficient treasury balance',
        code: 'INSUFFICIENT_FUNDS' as const,
        required: usdcToRaw(totalUsdc),
        available: usdcToRaw(finalAvailable),
        deficit: usdcToRaw(totalUsdc - finalAvailable),
        chain: PRIVY_CHAIN,
      };
    }

    // 4. Fetch names
    const userIds = internalItems.map(i => i.userId!);
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .in('id', userIds);
    const userMap = new Map((users || []).map((u: any) => [u.id, u]));

    const externalIdMap = new Map((extRecipients || []).map((r: any) => [r.id, r]));

    const itemDetails = items.map(item => {
      let name: string;
      if (item.userId) {
        const user = userMap.get(item.userId);
        name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || item.userId : item.userId;
      } else if (item.externalRecipientId) {
        const ext = externalIdMap.get(item.externalRecipientId);
        name = (ext as any)?.display_name || item.externalRecipientId;
      } else {
        name = 'Unknown';
      }
      const amountWhole = parseFloat(item.amountUsdc) / 1e6;
      return {
        userId: item.userId || null,
        externalRecipientId: item.externalRecipientId || null,
        walletAddress: item.walletAddress || null,
        name,
        amountUsdc: item.amountUsdc,
        amountUsd: amountWhole.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        recipientType: item.externalRecipientId ? 'external' : 'internal',
      };
    });

    // 5. Generate preview token
    const expiresAt = new Date(Date.now() + PREVIEW_EXPIRY_SECONDS * 1000).toISOString();
    const tokenPayload = {
      workspaceId,
      items,
      totalUsdc: usdcToRaw(totalUsdc),
      runType,
      exp: Math.floor(Date.now() / 1000) + PREVIEW_EXPIRY_SECONDS,
    };
    const previewToken = signPreviewJwt(tokenPayload);

    const afterBalance = finalAvailable - totalUsdc;

    return {
      totalUsdc: usdcToRaw(totalUsdc),
      totalUsd: formatUsd(totalUsdc),
      treasuryBalanceAfter: usdcToRaw(afterBalance),
      treasuryBalanceAfterUsd: formatUsd(afterBalance),
      items: itemDetails,
      previewToken,
      expiresAt,
    };
  },

  async run(workspaceId: string, userId: string, previewToken: string) {
    // 1. Verify token
    let tokenData: any;
    try {
      tokenData = verifyPreviewJwt(previewToken);
    } catch (e: any) {
      if (e.message === 'PREVIEW_EXPIRED') {
        return { error: 'Preview expired. Please preview again.', code: 'PREVIEW_EXPIRED' as const };
      }
      throw new Error('Invalid preview token');
    }

    if (tokenData.workspaceId !== workspaceId) {
      throw new Error('Preview token does not match workspace');
    }

    const items: Array<{ userId?: string; externalRecipientId?: string; walletAddress?: string; amountUsdc: string }> = tokenData.items;
    const totalUsdc = parseFloat(tokenData.totalUsdc) / 1e6;

    const internalItems = items.filter(i => i.userId);
    const externalItems = items.filter(i => i.externalRecipientId);

    // 2. Re-validate balance
    const { data: treasuryWallet } = await supabase
      .from('treasury_wallets')
      .select('privy_wallet_address, privy_wallet_id')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .maybeSingle();

    if (!treasuryWallet?.privy_wallet_address) {
      throw new Error('No treasury wallet found');
    }

    let privyWalletId = treasuryWallet.privy_wallet_id;
    if (!privyWalletId) {
      privyWalletId = await resolvePrivyWalletId(treasuryWallet.privy_wallet_address);
      if (!privyWalletId) throw new Error('Could not resolve treasury Privy wallet ID');
    }

    const onChainBalance = await readPrivyUsdcBalance(privyWalletId);

    if (totalUsdc > onChainBalance) {
      return { error: 'Insufficient treasury balance', code: 'INSUFFICIENT_FUNDS' as const };
    }

    // 3. Create reservation
    const { data: reserveTx, error: reserveErr } = await supabase
      .from('treasury_transactions')
      .insert({
        workspace_id: workspaceId,
        type: 'payroll_out',
        source: 'manual',
        usdc_amount: totalUsdc,
        status: 'pending_convert',
      })
      .select()
      .single();

    if (reserveErr) throw reserveErr;

    // 4. Create payroll run
    const { data: run, error: runErr } = await supabase
      .from('payroll_runs')
      .insert({
        workspace_id: workspaceId,
        initiated_by: userId,
        run_type: tokenData.runType,
        total_amount_usdc: totalUsdc,
        status: 'reserved',
        reservation_tx_id: reserveTx.id,
      })
      .select()
      .single();

    if (runErr) throw runErr;

    // 5. Create payroll items
    const itemRecords = items.map(item => {
      const record: any = {
        payroll_run_id: run.id,
        amount_usdc: parseFloat(item.amountUsdc),
        status: 'pending' as const,
      };
      if (item.userId) {
        record.recipient_user_id = item.userId;
        record.recipient_type = 'internal';
      } else if (item.externalRecipientId) {
        record.external_recipient_id = item.externalRecipientId;
        record.external_wallet_address = item.walletAddress ? getAddress(item.walletAddress) : null;
        record.recipient_type = 'external';
      }
      return record;
    });

    const { data: createdItems, error: itemsErr } = await supabase
      .from('payroll_items')
      .insert(itemRecords)
      .select();

    if (itemsErr) throw itemsErr;

    // 6. Update run to executing
    await supabase.from('payroll_runs').update({ status: 'executing' }).eq('id', run.id);

    // 7. Get recipient wallet addresses
    const userIds = internalItems.map(i => i.userId!);
    const { data: users } = await supabase
      .from('users')
      .select('id, ethereum_wallet_address, first_name, last_name, email')
      .in('id', userIds);

    const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));

    // 8. Execute transfers
    const results: Array<{ itemId: string; success: boolean; txHash?: string; error?: string; recipientUserId?: string }> = [];

    // 8a. Internal transfers via Privy
    const internalDbItems = (createdItems || []).filter((i: any) => i.recipient_type === 'internal' || !i.recipient_type);
    for (const item of internalItems) {
      const dbItem = internalDbItems.find((i: any) => i.recipient_user_id === item.userId);
      if (!dbItem) { results.push({ itemId: '', success: false, error: 'Item not found' }); continue; }

      const user = userMap.get(item.userId!);
      if (!user?.ethereum_wallet_address) {
        await supabase.from('payroll_items').update({ status: 'failed' }).eq('id', dbItem.id);
        results.push({ itemId: dbItem.id, success: false, error: 'No wallet address' });
        continue;
      }

      const amountWhole = parseFloat(item.amountUsdc) / 1e6;
      try {
        const { txHash } = await sendUsdcIndividually(privyWalletId, user.ethereum_wallet_address, amountWhole);
        await supabase.from('payroll_items').update({ status: 'completed', tx_hash: txHash }).eq('id', dbItem.id);
        await supabase.from('treasury_transactions').insert({
          workspace_id: workspaceId, type: 'payroll_out', source: 'manual',
          usdc_amount: amountWhole, status: 'completed', reference_id: run.id,
        });
        results.push({ itemId: dbItem.id, success: true, txHash, recipientUserId: item.userId });

        // Fire auto-settlement async (never blocks)
        triggerAutoSettlement(item.userId!, amountWhole, dbItem.id);
      } catch (err: any) {
        logger.error('Transfer failed', { runId: run.id, itemId: dbItem.id, error: err?.message });
        await supabase.from('payroll_items').update({ status: 'failed' }).eq('id', dbItem.id);
        results.push({ itemId: dbItem.id, success: false, error: err?.message });
      }
    }

    // 8b. External transfers via viem on-chain
    const externalDbItems = (createdItems || []).filter((i: any) => i.recipient_type === 'external');
    for (const item of externalItems) {
      const dbItem = externalDbItems.find((i: any) => i.external_recipient_id === item.externalRecipientId);
      if (!dbItem) { results.push({ itemId: '', success: false, error: 'Item not found' }); continue; }

      const targetAddress = item.walletAddress || dbItem.external_wallet_address;
      if (!targetAddress) {
        await supabase.from('payroll_items').update({ status: 'failed' }).eq('id', dbItem.id);
        results.push({ itemId: dbItem.id, success: false, error: 'No wallet address' });
        continue;
      }

      const amountWhole = parseFloat(item.amountUsdc) / 1e6;
      try {
        const { txHash } = await sendUsdcOnChain(targetAddress, amountWhole);
        await supabase.from('payroll_items').update({ status: 'completed', tx_hash: txHash }).eq('id', dbItem.id);
        await supabase.from('treasury_transactions').insert({
          workspace_id: workspaceId, type: 'payroll_out', source: 'manual',
          usdc_amount: amountWhole, status: 'completed', reference_id: run.id,
        });
        results.push({ itemId: dbItem.id, success: true, txHash });
      } catch (err: any) {
        logger.error('External transfer failed', { runId: run.id, itemId: dbItem.id, error: err?.message });
        await supabase.from('payroll_items').update({ status: 'failed' }).eq('id', dbItem.id);
        results.push({ itemId: dbItem.id, success: false, error: err?.message });
      }
    }

    // 9. Finalize run
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    const finalStatus = failedCount === 0 ? 'completed' : 'partial_failed';

    await supabase.from('payroll_runs').update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
    }).eq('id', run.id);

    // Remove reservation
    await supabase.from('treasury_transactions').update({ status: 'completed' }).eq('id', reserveTx.id);

    // 10. Notify internal recipients only
    try {
      const NotificationService = (await import('./notifications')).default;
      for (const result of results) {
        if (!result.success || !result.recipientUserId) continue;
        const amountUsd = formatUsd(parseFloat(items.find(i => i.userId === result.recipientUserId)?.amountUsdc || '0') / 1e6);
        await NotificationService.notifyUser(result.recipientUserId, {
          title: 'Payment arrived',
          body: `Your payment of $${amountUsd} has arrived in your Hedwig wallet`,
        });
      }
    } catch (e: any) {
      logger.warn('Failed to send some payroll notifications', { error: e?.message });
    }

    // 11. Notify admin
    try {
      const { EmailService } = await import('./email');
      const { data: admin } = await supabase
        .from('users').select('first_name, last_name, email').eq('id', userId).single();
      if (admin?.email) {
        EmailService.sendPayrollCompleteEmail({
          to: admin.email,
          adminName: [admin.first_name, admin.last_name].filter(Boolean).join(' ') || 'Admin',
          totalRan: items.length,
          successCount,
          failedCount,
          payrollRunId: run.id,
        }).catch((e: any) => logger.warn('Failed to send payroll complete email', { error: e?.message }));
      }
    } catch (e: any) {
      logger.warn('Failed to send admin payroll email', { error: e?.message });
    }

    return { payrollRunId: run.id, status: finalStatus, successCount, failedCount };
  },

  async getHistory(workspaceId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const { data: runs, error, count } = await supabase
      .from('payroll_runs')
      .select('*, items:payroll_items(*, recipient:users!payroll_items_recipient_user_id_fkey(first_name, last_name, email), external_recipient:external_payroll_recipients!payroll_items_external_recipient_id_fkey(display_name)), initiator:users!payroll_runs_initiated_by_fkey(first_name, last_name, email)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const formattedRuns = (runs || []).map((run: any) => {
      const runItems = run.items || [];
      const successCount = runItems.filter((i: any) => i.status === 'completed').length;
      const failedCount = runItems.filter((i: any) => i.status === 'failed').length;

      return {
        id: run.id,
        runType: run.run_type,
        totalAmountUsd: formatUsd(parseFloat(run.total_amount_usdc)),
        status: run.status,
        scheduledPayrollId: run.scheduled_payroll_id || null,
        initiatedBy: {
          id: run.initiated_by,
          name: run.initiator ? [run.initiator.first_name, run.initiator.last_name].filter(Boolean).join(' ') || run.initiator.email : run.initiated_by,
        },
        itemCount: runItems.length,
        successCount,
        failedCount,
        createdAt: run.created_at,
        completedAt: run.completed_at,
        items: runItems.map((item: any) => {
          let recipientName: string;
          if (item.recipient) {
            recipientName = [item.recipient.first_name, item.recipient.last_name].filter(Boolean).join(' ') || item.recipient.email || item.recipient_user_id;
          } else if (item.external_recipient) {
            recipientName = item.external_recipient.display_name;
          } else {
            recipientName = item.recipient_user_id || 'Unknown';
          }
          return {
            recipientName,
            amountUsd: formatUsd(parseFloat(item.amount_usdc)),
            status: item.status,
            txHash: item.tx_hash,
            recipientType: item.recipient_type || 'internal',
          };
        }),
      };
    });

    return { runs: formattedRuns, total: count || 0, page, limit };
  },

  async retryFailed(workspaceId: string, _userId: string, runId: string) {
    const { data: run } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('id', runId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!run) throw new Error('Payroll run not found');
    if (run.status !== 'partial_failed') throw new Error('Payroll run is not in partial_failed status');

    const { data: failedItems } = await supabase
      .from('payroll_items')
      .select('*')
      .eq('payroll_run_id', runId)
      .eq('status', 'failed');

    if (!failedItems || failedItems.length === 0) {
      throw new Error('No failed items to retry');
    }

    // Re-validate balance
    const totalRetry = failedItems.reduce((s, i) => s + parseFloat(i.amount_usdc), 0);
    const { data: treasuryWallet } = await supabase
      .from('treasury_wallets')
      .select('privy_wallet_address, privy_wallet_id')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .maybeSingle();

    if (!treasuryWallet?.privy_wallet_address) throw new Error('No treasury wallet found');

    let retryPrivyWalletId = treasuryWallet.privy_wallet_id;
    if (!retryPrivyWalletId) {
      retryPrivyWalletId = await resolvePrivyWalletId(treasuryWallet.privy_wallet_address);
      if (!retryPrivyWalletId) throw new Error('Could not resolve treasury Privy wallet ID');
    }

    const onChainBalance = await readPrivyUsdcBalance(retryPrivyWalletId);

    if (totalRetry > onChainBalance) {
      return { error: 'Insufficient treasury balance for retry', code: 'INSUFFICIENT_FUNDS' as const };
    }

    let newSuccesses = 0;
    let stillFailed = 0;

    // Retry internal failed items via Privy
    const internalFailed = failedItems.filter(i => i.recipient_type === 'internal' || !i.recipient_type);
    if (internalFailed.length > 0) {
      const userIds = [...new Set(internalFailed.map(i => i.recipient_user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, ethereum_wallet_address, first_name, last_name')
        .in('id', userIds);
      const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));

      for (const item of internalFailed) {
        const user = userMap.get(item.recipient_user_id);
        if (!user?.ethereum_wallet_address) { stillFailed++; continue; }
        try {
          const { txHash } = await sendUsdcIndividually(retryPrivyWalletId, user.ethereum_wallet_address, parseFloat(item.amount_usdc) / 1e6);
          await supabase.from('payroll_items').update({ status: 'completed', tx_hash: txHash }).eq('id', item.id);
          newSuccesses++;
        } catch (err: any) {
          logger.error('Retry internal failed', { itemId: item.id, error: err?.message });
          stillFailed++;
        }
      }
    }

    // Retry external failed items via viem
    const externalFailed = failedItems.filter(i => i.recipient_type === 'external');
    for (const item of externalFailed) {
      const targetAddress = item.external_wallet_address;
      if (!targetAddress) { stillFailed++; continue; }
      try {
        const { txHash } = await sendUsdcOnChain(targetAddress, parseFloat(item.amount_usdc) / 1e6);
        await supabase.from('payroll_items').update({ status: 'completed', tx_hash: txHash }).eq('id', item.id);
        newSuccesses++;
      } catch (err: any) {
        logger.error('Retry external failed', { itemId: item.id, error: err?.message });
        stillFailed++;
      }
    }

    // If all previously failed now succeed
    const { data: remainingFailed } = await supabase
      .from('payroll_items')
      .select('id')
      .eq('payroll_run_id', runId)
      .eq('status', 'failed');

    if (!remainingFailed || remainingFailed.length === 0) {
      await supabase.from('payroll_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }

    // Notify newly successful
    try {
      const NotificationService = (await import('./notifications')).default;
      for (const item of failedItems) {
        const updated = await supabase
          .from('payroll_items').select('status').eq('id', item.id).single();
        if (updated?.data?.status === 'completed') {
          const amountUsd = formatUsd(parseFloat(item.amount_usdc));
          await NotificationService.notifyUser(item.recipient_user_id, {
            title: 'Payment arrived',
            body: `Your payment of $${amountUsd} has arrived in your Hedwig wallet`,
          });
        }
      }
    } catch (e: any) {
      logger.warn('Failed to send retry notifications', { error: e?.message });
    }

    return { runId, retriedCount: newSuccesses + stillFailed, newSuccesses, stillFailed };
  },

  // ─── Scheduled Payroll ──────────────────────────────────────────────────

  computeNextRun(frequency: string, dayOfMonth?: number | null, dayOfWeek?: number | null): Date {
    const now = new Date();

    if (frequency === 'minute') {
      return new Date(now.getTime() + 60000); // 1 minute from now
    }

    const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0));

    if (frequency === 'monthly') {
      const targetDay = dayOfMonth || 25;
      let next = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), targetDay, 9, 0, 0));
      if (next <= now) {
        next = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + 1, targetDay, 9, 0, 0));
      }
      // Handle months with fewer days
      while (next.getUTCDate() < targetDay && next.getUTCMonth() === utc.getUTCMonth() + 1) {
        next = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + 1, 1, 9, 0, 0));
      }
      return next;
    }

    // weekly / biweekly
    const targetDow = dayOfWeek ?? 1; // 0=Sun, 1=Mon
    let next = new Date(utc);
    const daysUntil = (targetDow - utc.getUTCDay() + 7) % 7;
    next.setUTCDate(utc.getUTCDate() + (daysUntil === 0 ? 7 : daysUntil));
    if (frequency === 'biweekly') {
      next.setUTCDate(next.getUTCDate() + 7);
    }
    return next;
  },

  async createSchedule(workspaceId: string, userId: string, params: {
    frequency: string;
    dayOfMonth?: number | null;
    dayOfWeek?: number | null;
    items: Array<{ userId: string; amountUsdc: string }>;
  }) {
    // Validate members
    const { data: members } = await supabase
      .from('workspace_members').select('user_id').eq('workspace_id', workspaceId);
    const memberIds = new Set((members || []).map((m: any) => m.user_id));
    for (const item of params.items) {
      if (!memberIds.has(item.userId)) throw new Error(`User ${item.userId} is not a workspace member`);
    }

    const nextRunAt = this.computeNextRun(params.frequency, params.dayOfMonth, params.dayOfWeek);

    const { data, error } = await supabase
      .from('scheduled_payrolls')
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        run_type: 'fixed',
        items: params.items,
        frequency: params.frequency,
        day_of_month: params.dayOfMonth ?? null,
        day_of_week: params.dayOfWeek ?? null,
        next_run_at: nextRunAt.toISOString(),
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;

    try {
      const { inngest, inngestEnabled } = await import('../lib/inngest');
      if (inngestEnabled) {
        await inngest.send({ name: 'payroll/scheduled.run', data: { scheduleId: data.id } });
      }
    } catch (e: any) {
      logger.warn('Failed to register Inngest job for schedule', { scheduleId: data.id, error: e?.message });
    }

    const totalUsdc = params.items.reduce((s, i) => s + parseFloat(i.amountUsdc) / 1e6, 0);

    return {
      scheduleId: data.id,
      nextRunAt: data.next_run_at,
      frequency: data.frequency,
      totalUsd: formatUsd(totalUsdc),
      items: params.items,
    };
  },

  async listSchedules(workspaceId: string) {
    const { data: schedules, error } = await supabase
      .from('scheduled_payrolls')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const enriched: any[] = [];
    for (const s of (schedules || [])) {
      const items: any[] = s.items || [];
      const userIds = [...new Set(items.map((i: any) => i.userId))];
      let userMap = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, first_name, last_name, email').in('id', userIds);
        for (const u of (users || [])) {
          userMap.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || u.id);
        }
      }
      const totalUsdc = items.reduce((sum: number, i: any) => sum + parseFloat(i.amountUsdc || '0') / 1e6, 0);

      enriched.push({
        id: s.id,
        frequency: s.frequency,
        dayOfMonth: s.day_of_month,
        dayOfWeek: s.day_of_week,
        nextRunAt: s.next_run_at,
        lastRunAt: s.last_run_at,
        lastRunId: s.last_run_id,
        status: s.status,
        totalUsd: formatUsd(totalUsdc),
        itemCount: items.length,
        items: items.map((i: any) => ({ userId: i.userId, name: userMap.get(i.userId) || i.userId, amountUsd: formatUsd(parseFloat(i.amountUsdc) / 1e6) })),
        createdAt: s.created_at,
      });
    }

    return enriched;
  },

  async updateSchedule(workspaceId: string, scheduleId: string, updates: {
    items?: Array<{ userId: string; amountUsdc: string }>;
    frequency?: string;
    dayOfMonth?: number | null;
    dayOfWeek?: number | null;
    status?: 'active' | 'paused' | 'cancelled';
  }) {
    const { data: existing } = await supabase
      .from('scheduled_payrolls').select('*').eq('id', scheduleId).eq('workspace_id', workspaceId).single();
    if (!existing) throw new Error('Schedule not found');

    const patch: any = {};
    if (updates.items !== undefined) patch.items = updates.items;
    if (updates.frequency) patch.frequency = updates.frequency;
    if (updates.dayOfMonth !== undefined) patch.day_of_month = updates.dayOfMonth;
    if (updates.dayOfWeek !== undefined) patch.day_of_week = updates.dayOfWeek;
    if (updates.status) patch.status = updates.status;

    if (updates.frequency || updates.dayOfMonth !== undefined || updates.dayOfWeek !== undefined || updates.status === 'active') {
      const freq = updates.frequency || existing.frequency;
      const dom = updates.dayOfMonth !== undefined ? updates.dayOfMonth : existing.day_of_month;
      const dow = updates.dayOfWeek !== undefined ? updates.dayOfWeek : existing.day_of_week;
      patch.next_run_at = this.computeNextRun(freq, dom, dow).toISOString();
    }

    const { data, error } = await supabase
      .from('scheduled_payrolls').update(patch).eq('id', scheduleId).eq('workspace_id', workspaceId).select().single();
    if (error) throw error;

    // Re-register Inngest if active
    if (data.status === 'active') {
      try {
        const { inngest, inngestEnabled } = await import('../lib/inngest');
        if (inngestEnabled) {
          await inngest.send({ name: 'payroll/scheduled.run', data: { scheduleId: data.id } });
        }
      } catch (e: any) {
        logger.warn('Failed to re-register Inngest for schedule', { scheduleId, error: e?.message });
      }
    }

    return data;
  },

  async deleteSchedule(workspaceId: string, scheduleId: string) {
    const { data, error } = await supabase
      .from('scheduled_payrolls')
      .update({ status: 'cancelled' })
      .eq('id', scheduleId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async executeScheduledRun(scheduleId: string) {
    const { data: schedule } = await supabase
      .from('scheduled_payrolls').select('*').eq('id', scheduleId).single();
    if (!schedule || schedule.status !== 'active') {
      logger.info('Skipping scheduled payroll — not active', { scheduleId, status: schedule?.status });
      return { skipped: true, reason: schedule?.status || 'not_found' };
    }

    const items: Array<{ userId: string; amountUsdc: string }> = schedule.items || [];
    if (items.length === 0) {
      logger.warn('Scheduled payroll has no items', { scheduleId });
      return { skipped: true, reason: 'no_items' };
    }

    // Preflight: check balance
    const { data: tw } = await supabase
      .from('treasury_wallets').select('privy_wallet_id').eq('workspace_id', schedule.workspace_id).eq('is_active', true).maybeSingle();
    if (!tw?.privy_wallet_id) {
      logger.error('No treasury wallet for scheduled payroll', { scheduleId, workspaceId: schedule.workspace_id });
      return { skipped: true, reason: 'no_treasury' };
    }

    const balance = await readPrivyUsdcBalance(tw.privy_wallet_id);
    const totalUsdc = items.reduce((s, i) => s + parseFloat(i.amountUsdc) / 1e6, 0);

    if (totalUsdc > balance) {
      const nextRun = this.computeNextRun(schedule.frequency, schedule.day_of_month, schedule.day_of_week);
      await supabase.from('scheduled_payrolls').update({ next_run_at: nextRun.toISOString() }).eq('id', scheduleId);

      // Notify admin
      try {
        const { data: admin } = await supabase.from('users').select('email, first_name, last_name').eq('id', schedule.created_by).single();
        if (admin?.email) {
          const { EmailService } = await import('./email');
          EmailService.sendPayrollSkippedEmail({
            to: admin.email,
            adminName: [admin.first_name, admin.last_name].filter(Boolean).join(' ') || 'Admin',
            deficit: formatUsd(totalUsdc - balance),
            nextRunAt: nextRun.toISOString(),
          }).catch(() => {});
        }
      } catch {}

      logger.warn('Scheduled payroll skipped — insufficient funds', { scheduleId, balance, total: totalUsdc });
      return { skipped: true, reason: 'insufficient_funds' };
    }

    // Preflight: validate members still active
    const { data: activeMembers } = await supabase
      .from('workspace_members').select('user_id').eq('workspace_id', schedule.workspace_id);
    const activeIds = new Set((activeMembers || []).map((m: any) => m.user_id));
    const validItems = items.filter(i => activeIds.has(i.userId));
    const skippedCount = items.length - validItems.length;

    if (skippedCount > 0) {
      try {
        const { data: admin } = await supabase.from('users').select('id').eq('id', schedule.created_by).single();
        if (admin) {
          const NotificationService = (await import('./notifications')).default;
          await NotificationService.notifyUser(admin.id, {
            title: 'Payroll ran with skipped members',
            body: `${skippedCount} member(s) were skipped because they left the workspace. Update your schedule.`,
          });
        }
      } catch {}
    }

    if (validItems.length === 0) {
      const nextRun = this.computeNextRun(schedule.frequency, schedule.day_of_month, schedule.day_of_week);
      await supabase.from('scheduled_payrolls').update({ next_run_at: nextRun.toISOString() }).eq('id', scheduleId);
      return { skipped: true, reason: 'no_valid_members' };
    }

    // Execute payroll using the existing run logic
    const previewResult = await this.preview(schedule.workspace_id, schedule.created_by, schedule.run_type || 'fixed', validItems);
    if (previewResult.code === 'INSUFFICIENT_FUNDS') {
      const nextRun = this.computeNextRun(schedule.frequency, schedule.day_of_month, schedule.day_of_week);
      await supabase.from('scheduled_payrolls').update({ next_run_at: nextRun.toISOString() }).eq('id', scheduleId);
      return { skipped: true, reason: 'insufficient_funds' };
    }

    const runResult = await this.run(schedule.workspace_id, schedule.created_by, previewResult.previewToken);
    if (runResult.code) {
      logger.error('Scheduled payroll run failed', { scheduleId, code: runResult.code });
      return { skipped: true, reason: runResult.code };
    }

    // Update schedule
    const nextRun = this.computeNextRun(schedule.frequency, schedule.day_of_month, schedule.day_of_week);
    await supabase.from('scheduled_payrolls').update({
      last_run_at: new Date().toISOString(),
      last_run_id: runResult.payrollRunId,
      next_run_at: nextRun.toISOString(),
    }).eq('id', scheduleId);

    // Link the run to the schedule
    await supabase.from('payroll_runs').update({ scheduled_payroll_id: scheduleId }).eq('id', runResult.payrollRunId);

    // Schedule next run via Inngest
    try {
      const { inngest, inngestEnabled } = await import('../lib/inngest');
      if (inngestEnabled) {
        await inngest.send({ name: 'payroll/scheduled.run', data: { scheduleId } });
      }
    } catch (e: any) {
      logger.warn('Failed to schedule next Inngest run', { scheduleId, error: e?.message });
    }

    return { runId: runResult.payrollRunId, status: runResult.status, successCount: runResult.successCount, failedCount: runResult.failedCount };
  },
};
