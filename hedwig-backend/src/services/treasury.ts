import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { EmailService } from './email';
import { getPrivyNodeClient } from './privyWallets';

const logger = createLogger('TreasuryService');

const IS_TESTNET = process.env.NETWORK_MODE === 'testnet';
const PRIVY_CHAIN = IS_TESTNET ? 'base_sepolia' as const : 'base' as const;

function formatUsd(usdcAmount: number): string {
  return usdcAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function readStellarUsdcBalance(stellarAddress: string): Promise<number> {
  try {
    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    const response = await fetch(`${horizonUrl}/accounts/${stellarAddress}`);
    if (!response.ok) {
      logger.warn('Horizon account lookup failed', { stellarAddress, status: response.status });
      return 0;
    }
    const account = await response.json();
    const usdcIssuer = process.env.STELLAR_USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    const usdcBal = (account.balances || []).find(
      (b: any) => b.asset_type === 'credit_alphanum4' && b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer
    );
    return usdcBal ? parseFloat(usdcBal.balance) : 0;
  } catch (e: any) {
    logger.warn('Failed to read Stellar USDC balance', { stellarAddress, error: e.message });
    return 0;
  }
}

async function readPrivyUsdcBalance(privyWalletId: string): Promise<number> {
  try {
    const privy = getPrivyNodeClient();
    const response = await privy.wallets().balance.get(privyWalletId, {
      asset: 'usdc',
      chain: PRIVY_CHAIN,
    });
    logger.info('Privy balance API response', {
      walletId: privyWalletId?.slice(0, 10) + '...',
      chain: PRIVY_CHAIN,
      balancesCount: response?.balances?.length ?? 0,
      balances: response?.balances,
    });
    if (!response?.balances) return 0;
    const usdc = response.balances.find((b) => b.asset === 'usdc');
    if (usdc && usdc.raw_value) {
      const val = parseInt(usdc.raw_value, 10) / Math.pow(10, usdc.raw_value_decimals || 6);
      return val;
    }
    return 0;
  } catch (e: any) {
    logger.error('Failed to read USDC balance via Privy', { walletId: privyWalletId?.slice(0, 10) + '...', error: e?.message, chain: PRIVY_CHAIN });
    return 0;
  }
}

async function resolvePrivyWalletIdByAddress(address: string): Promise<string | null> {
  try {
    const privy = getPrivyNodeClient();
    for await (const w of privy.wallets().list({ chain_type: 'ethereum' })) {
      if (w.address.toLowerCase() === address.toLowerCase()) return w.id;
    }
  } catch (e: any) {
    logger.error('Failed to resolve wallet ID by address', { address, error: e?.message });
  }
  return null;
}

export const TreasuryService = {
  async createTreasuryWallet(workspaceId: string): Promise<{ address: string; id: string; privyWalletId: string } | null> {
    const { data: existing } = await supabase
      .from('treasury_wallets')
      .select('id, privy_wallet_address, privy_wallet_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (existing?.privy_wallet_address) {
      return { address: existing.privy_wallet_address, id: existing.id, privyWalletId: existing.privy_wallet_id };
    }

    try {
      const privy = getPrivyNodeClient();
      const wallet = await privy.wallets().create({
        chain_type: 'ethereum',
      });

      // Try with privy_wallet_id first, fallback without it
      let insertResult: any;
      try {
        insertResult = await supabase.from('treasury_wallets').insert({
          workspace_id: workspaceId,
          privy_wallet_address: wallet.address,
          privy_wallet_id: wallet.id,
          is_active: true,
        }).select().single();
      } catch {
        insertResult = await supabase.from('treasury_wallets').insert({
          workspace_id: workspaceId,
          privy_wallet_address: wallet.address,
          is_active: true,
        }).select().single();
        // Then update with wallet ID
        try {
          await supabase.from('treasury_wallets').update({ privy_wallet_id: wallet.id }).eq('id', insertResult.data.id);
        } catch { /* still no column */ }
      }

      const { data, error } = insertResult;

      if (error) {
        logger.error('Failed to store treasury wallet', { workspaceId, error: error.message });
        return null;
      }

      logger.info('Created treasury wallet', { workspaceId, address: wallet.address, walletId: wallet.id });
      return { address: wallet.address, id: data.id, privyWalletId: wallet.id };
    } catch (error: any) {
      logger.error('Failed to create treasury wallet via Privy', {
        workspaceId,
        error: error?.message || 'Unknown error',
      });
      return null;
    }
  },

  async ensureTreasuryWallet(workspaceId: string): Promise<{ address: string; privyWalletId: string } | null> {
    const { data: existing } = await supabase
      .from('treasury_wallets')
      .select('privy_wallet_address, privy_wallet_id')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .maybeSingle();

    if (existing?.privy_wallet_address) {
      let privyWalletId = existing.privy_wallet_id;
      if (!privyWalletId) {
        privyWalletId = await resolvePrivyWalletIdByAddress(existing.privy_wallet_address);
        if (privyWalletId) {
          try {
            await supabase.from('treasury_wallets').update({ privy_wallet_id: privyWalletId })
              .eq('workspace_id', workspaceId);
          } catch { /* column may not exist */ }
        }
      }
      return { address: existing.privy_wallet_address, privyWalletId: privyWalletId || '' };
    }

    const created = await this.createTreasuryWallet(workspaceId);
    if (created) return { address: created.address, privyWalletId: created.privyWalletId };
    return null;
  },

  async getBalance(workspaceId: string, walletAddress?: string) {
    let address = walletAddress || null;
    let privyWalletId: string | null = null;

    // Look up wallet info from DB (always — even if address was passed in)
    const { data: treasuryWallet } = await supabase
      .from('treasury_wallets')
      .select('privy_wallet_address, privy_wallet_id')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .maybeSingle();

    if (treasuryWallet?.privy_wallet_address) {
      address = address || treasuryWallet.privy_wallet_address;
      privyWalletId = treasuryWallet.privy_wallet_id || null;
    } else if (!address) {
      const { data: ws } = await supabase
        .from('workspaces')
        .select('treasury_base_address')
        .eq('id', workspaceId)
        .maybeSingle();
      address = ws?.treasury_base_address || null;
    }

    // Resolve wallet ID from Privy if missing
    if (address && !privyWalletId) {
      privyWalletId = await resolvePrivyWalletIdByAddress(address);
      if (privyWalletId) {
        try {
          await supabase.from('treasury_wallets').update({ privy_wallet_id: privyWalletId })
            .eq('workspace_id', workspaceId);
        } catch { /* column may not exist */ }
      }
    }

    if (!address) {
      return {
        treasuryAddress: null,
        stellarTreasuryAddress: null,
        balanceUsdc: '0',
        balanceUsd: '0.00',
        reservedUsdc: '0',
        availableUsdc: '0',
        recentTransactions: [],
        totalUsdc: 0,
        testnet: IS_TESTNET,
        _debug: { hasAddress: false, hasWalletId: false, chain: PRIVY_CHAIN },
      };
    }

    // Fetch balance via Privy + DB queries in parallel
    const [baseResult, reservedResult, txsResult] = await Promise.all([
      privyWalletId ? readPrivyUsdcBalance(privyWalletId) : Promise.resolve(0),
      supabase
        .from('treasury_transactions')
        .select('usdc_amount')
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending_convert'),
      supabase
        .from('treasury_transactions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const totalUsdc = baseResult;
    const rawUsdcString = Math.round(totalUsdc * 1e6).toString();

    const reservedUsdc = ((reservedResult.data || []) as any[]).reduce(
      (sum: number, r: any) => sum + parseFloat(r.usdc_amount || '0'), 0
    );

    const recentTransactions = ((txsResult.data || []) as any[]).map((tx: any) => ({
      id: tx.id,
      type: tx.type,
      source: tx.source,
      originalAmount: tx.original_amount ? String(tx.original_amount) : null,
      originalCurrency: tx.original_currency || null,
      usdcAmount: String(tx.usdc_amount),
      usdAmount: formatUsd(parseFloat(tx.usdc_amount)),
      status: tx.status,
      createdAt: tx.created_at,
    }));

    // Stellar treasury wallet creation + balance fetch was here but is disabled until Stellar is re-enabled.
    const stellarTreasuryAddress: string | null = null;
    const stellarBalanceNum = 0;
    const stellarBalanceUsdc = '0';
    const stellarBalanceUsd = '0.00';

    const combinedBalanceNum = totalUsdc + stellarBalanceNum;
    const combinedBalanceUsdc = Math.round(combinedBalanceNum * 1e6).toString();
    const combinedBalanceUsd = combinedBalanceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const availableUsdc = Math.max(0, combinedBalanceNum - reservedUsdc);

    return {
      treasuryAddress: address,
      stellarTreasuryAddress,
      balanceUsdc: rawUsdcString,
      balanceUsd: formatUsd(totalUsdc),
      stellarBalanceUsdc,
      stellarBalanceUsd,
      combinedBalanceUsdc,
      combinedBalanceUsd,
      reservedUsdc: Math.round(reservedUsdc * 1e6).toString(),
      availableUsdc: Math.round(availableUsdc * 1e6).toString(),
      recentTransactions,
      totalUsdc,
      testnet: IS_TESTNET,
      _debug: {
        hasAddress: !!address,
        hasWalletId: !!privyWalletId,
        chain: PRIVY_CHAIN,
        stellarPublicKey: stellarTreasuryAddress,
      },
    };
  },

  async getBalanceForChains(privyWalletId: string) {
    const results: Record<string, number> = {};
    const chains = ['base', 'arbitrum', 'polygon', 'optimism', 'celo'] as const;
    // Privy uses full chain names for mainnet, _sepolia suffixes for testnet
    const privyChainMap: Record<string, string> = IS_TESTNET ? {
      base: 'base_sepolia', arbitrum: 'arbitrum_sepolia', polygon: 'polygon_amoy',
      optimism: 'optimism_sepolia', celo: 'celo',
    } : {
      base: 'base', arbitrum: 'arbitrum', polygon: 'polygon',
      optimism: 'optimism', celo: 'celo',
    };

    for (const key of chains) {
      try {
        const privy = getPrivyNodeClient();
        const response = await privy.wallets().balance.get(privyWalletId, {
          asset: 'usdc',
          chain: privyChainMap[key] as any,
        });
        const bal = response?.balances?.find((b: any) => b.asset === 'usdc');
        results[key] = bal ? parseInt(bal.raw_value, 10) / Math.pow(10, bal.raw_value_decimals || 6) : 0;
      } catch { results[key] = 0; }
    }

    return results;
  },

  async recordTransaction(params: {
    workspaceId: string;
    type: 'inflow' | 'payroll_out' | 'manual_transfer';
    source: 'ngn_account' | 'usd_account' | 'direct_crypto' | 'manual' | 'invoice' | 'payment_link';
    usdcAmount: number;
    originalAmount?: number;
    originalCurrency?: string;
    conversionRate?: number;
    status?: 'pending' | 'completed' | 'failed' | 'pending_convert';
    referenceId?: string;
  }) {
    const { data, error } = await supabase
      .from('treasury_transactions')
      .insert({
        workspace_id: params.workspaceId,
        type: params.type,
        source: params.source,
        usdc_amount: params.usdcAmount,
        original_amount: params.originalAmount ?? null,
        original_currency: params.originalCurrency ?? null,
        conversion_rate: params.conversionRate ?? null,
        status: params.status || 'completed',
        reference_id: params.referenceId ?? null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to record treasury transaction', { error: error.message, ...params });
      throw error;
    }
    return data;
  },

  async updateTransactionStatus(
    transactionId: string,
    status: 'pending' | 'completed' | 'failed' | 'pending_convert'
  ) {
    const { data, error } = await supabase
      .from('treasury_transactions')
      .update({ status })
      .eq('id', transactionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async initiatePayout(
    workspaceId: string,
    userId: string,
    items: Array<{ userId: string; amount: number; reason?: string; projectId?: string }>
  ) {
    const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
    const userIds = items.map(i => i.userId);
    const { data: users } = await supabase
      .from('users')
      .select('id, solana_wallet_address, first_name, last_name, email')
      .in('id', userIds);

    const userMap = new Map((users || []).map(u => [u.id, u]));
    const missingAddresses = userIds.filter(id => !userMap.get(id)?.solana_wallet_address);
    if (missingAddresses.length > 0) {
      throw new Error(`${missingAddresses.length} member(s) don't have a Solana wallet address`);
    }

    const { data: payout, error } = await supabase
      .from('workspace_payouts')
      .insert({ workspace_id: workspaceId, initiated_by: userId, total_amount: totalAmount, status: 'pending' })
      .select()
      .single();
    if (error) throw error;

    const payoutItems = items.map(item => ({
      payout_id: payout.id, user_id: item.userId, amount: item.amount,
      destination_address: userMap.get(item.userId)?.solana_wallet_address,
      reason: item.reason || null, project_id: item.projectId || null, status: 'pending',
    }));
    const { error: itemsError } = await supabase.from('workspace_payout_items').insert(payoutItems);
    if (itemsError) throw itemsError;

    const { data: insertedItems } = await supabase
      .from('workspace_payout_items')
      .select('id, user_id, amount, status')
      .eq('payout_id', payout.id);

    const { data: workspace } = await supabase.from('workspaces').select('name').eq('id', workspaceId).single();
    for (const item of items) {
      const member = userMap.get(item.userId);
      if (member?.email) {
        const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Team member';
        EmailService.sendPayoutEmail({
          to: member.email, memberName: name, amount: item.amount,
          workspaceName: workspace?.name || 'your workspace', reason: item.reason,
        }).catch(e => logger.warn('Payout email failed', { error: e.message }));
      }
    }

    // Record as treasury transaction
    try {
      await this.recordTransaction({
        workspaceId,
        type: 'payroll_out',
        source: 'manual',
        usdcAmount: totalAmount,
        status: 'pending',
      });
    } catch { /* non-critical */ }

    return { ...payout, items: insertedItems || [] };
  },

  async getPayouts(workspaceId: string) {
    const { data, error } = await supabase
      .from('workspace_payouts')
      .select('*, items:workspace_payout_items(*)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data || [];
  },

  async getPayout(payoutId: string) {
    const { data, error } = await supabase
      .from('workspace_payouts')
      .select('*, items:workspace_payout_items(*)')
      .eq('id', payoutId).single();
    if (error) return null;
    return data;
  },

  async updatePayoutItem(
    payoutId: string,
    itemId: string,
    updates: { status?: string; tx_hash?: string | null }
  ) {
    const { data, error } = await supabase
      .from('workspace_payout_items')
      .update({
        status: updates.status,
        tx_hash: updates.tx_hash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('payout_id', payoutId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updatePayoutStatus(
    payoutId: string,
    status: string
  ) {
    const { data, error } = await supabase
      .from('workspace_payouts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', payoutId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
