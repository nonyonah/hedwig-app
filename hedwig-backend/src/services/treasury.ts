import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { EmailService } from './email';
import { Connection, PublicKey } from '@solana/web3.js';
import { createPublicClient, http, erc20Abi, formatUnits } from 'viem';

const logger = createLogger('TreasuryService');

const IS_TESTNET = process.env.NETWORK_MODE !== 'production';
const SOLANA_RPC = IS_TESTNET
  ? 'https://api.devnet.solana.com'
  : (process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
const USDC_MINT = new PublicKey(
  IS_TESTNET
    ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);
const solanaConnection = new Connection(SOLANA_RPC);

const BASE_RPC = process.env.BASE_RPC_URL || (IS_TESTNET ? 'https://sepolia.base.org' : 'https://mainnet.base.org');
const USDC_BASE = IS_TESTNET ? '0x036CbD53842c5426634e792954fAF63d3bC69b8D' : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
const baseClient = createPublicClient({ transport: http(BASE_RPC) });

export const TreasuryService = {
  async getBalance(workspaceId: string) {
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('treasury_solana_address, treasury_base_address')
      .eq('id', workspaceId)
      .single();

    let solBalance = 0, usdcSolBalance = 0, usdcBaseBalance = 0;

    if (workspace?.treasury_solana_address) {
      try {
        const pubkey = new PublicKey(workspace.treasury_solana_address);
        const lamports = await solanaConnection.getBalance(pubkey);
        solBalance = lamports / 1e9;
        const tokenAccounts = await solanaConnection.getTokenAccountsByOwner(pubkey, { mint: USDC_MINT }).catch(() => ({ value: [] }));
        if (tokenAccounts.value.length > 0) {
          const info = await solanaConnection.getTokenAccountBalance(tokenAccounts.value[0].pubkey);
          usdcSolBalance = info.value.uiAmount || 0;
        }
      } catch { /* noop */ }
    }

    if (workspace?.treasury_base_address) {
      try {
        const raw = await baseClient.readContract({
          address: USDC_BASE,
          abi: erc20Abi as any,
          functionName: 'balanceOf',
          args: [workspace.treasury_base_address as `0x${string}`],
        });
        usdcBaseBalance = Number(formatUnits(raw as bigint, 6));
      } catch { /* noop */ }
    }

    return {
      solanaAddress: workspace?.treasury_solana_address || null,
      baseAddress: workspace?.treasury_base_address || null,
      solBalance,
      usdcSolBalance,
      usdcBaseBalance,
      totalUsdc: usdcSolBalance + usdcBaseBalance,
    };
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
      .select('*, items:workspace_payout_items(*)')
      .single();
    if (error) throw error;

    const payoutItems = items.map(item => ({
      payout_id: payout.id, user_id: item.userId, amount: item.amount,
      destination_address: userMap.get(item.userId)?.solana_wallet_address,
      reason: item.reason || null, project_id: item.projectId || null, status: 'pending',
    }));
    const { error: itemsError } = await supabase.from('workspace_payout_items').insert(payoutItems);
    if (itemsError) throw itemsError;

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
    return payout;
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
