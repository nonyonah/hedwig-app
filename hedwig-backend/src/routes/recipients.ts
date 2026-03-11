import { Router, Request, Response } from 'express';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { PublicKey, Connection } from '@solana/web3.js';
import { createHash } from 'crypto';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';

const router = Router();

type RecipientChain = 'base' | 'solana';

const isLikelyEvmAddress = (value: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

const isLikelySolanaAddress = (value: string): boolean => {
    const trimmed = value.trim();
    if (trimmed.length < 32 || trimmed.length > 44) return false;
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed);
};

const detectRecipientChain = (value: string): RecipientChain | null => {
    if (isLikelyEvmAddress(value)) return 'base';
    if (isLikelySolanaAddress(value)) return 'solana';
    return null;
};

const normalizeAddress = (address: string, chain: RecipientChain): string =>
    chain === 'base' ? address.toLowerCase() : address;

const ensClient = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com'),
});

const SOLANA_NAME_PROGRAM_ID = new PublicKey('namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX');
const SOL_TLD_AUTHORITY = new PublicKey('58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx');
const ZERO_PUBKEY = new PublicKey('11111111111111111111111111111111');

const getSolanaRpc = (): string =>
    process.env.SOLANA_MAINNET_RPC ||
    process.env.SOLANA_RPC_URL ||
    'https://api.mainnet-beta.solana.com';

const getHashedName = (name: string): Buffer => {
    const input = `SPL Name Service${name}`;
    return createHash('sha256').update(input, 'utf8').digest();
};

const deriveSolNameAccount = async (domain: string): Promise<PublicKey> => {
    const nameWithoutTld = domain.toLowerCase().replace(/\.sol$/i, '');
    const hashedName = getHashedName(nameWithoutTld);
    const [nameAccount] = await PublicKey.findProgramAddress(
        [hashedName, ZERO_PUBKEY.toBuffer(), SOL_TLD_AUTHORITY.toBuffer()],
        SOLANA_NAME_PROGRAM_ID
    );
    return nameAccount;
};

const resolveSolDomain = async (name: string): Promise<string | null> => {
    const normalized = name.trim().toLowerCase().replace(/\.sol$/i, '') + '.sol';

    // Primary path: resolve directly from Solana Name Service on-chain.
    try {
        const connection = new Connection(getSolanaRpc(), 'confirmed');
        const nameAccount = await deriveSolNameAccount(normalized);
        const info = await connection.getAccountInfo(nameAccount, 'confirmed');
        if (info?.data && info.data.length >= 64) {
            // NameRegistryHeader layout:
            // 0..32 parent_name, 32..64 owner, 64..96 class
            const ownerBytes = info.data.slice(32, 64);
            const owner = new PublicKey(ownerBytes).toBase58();
            if (isLikelySolanaAddress(owner)) return owner;
        }
    } catch {
        // Continue to fallback API if direct on-chain resolution fails.
    }

    // Fallback path for resolver compatibility edge-cases.
    try {
        const endpoint = `https://sns-sdk-proxy.bonfida.workers.dev/resolve/${encodeURIComponent(normalized)}`;
        const response = await fetch(endpoint, { method: 'GET' });
        if (!response.ok) return null;
        const payload: unknown = await response.json().catch(() => null);
        const obj = (payload && typeof payload === 'object') ? (payload as Record<string, any>) : null;
        const nestedData = (obj?.data && typeof obj.data === 'object') ? (obj.data as Record<string, any>) : null;
        const fallback =
            (typeof payload === 'string' ? payload : null) ||
            (typeof obj?.result === 'string' ? obj.result : null) ||
            (typeof obj?.address === 'string' ? obj.address : null) ||
            (typeof obj?.owner === 'string' ? obj.owner : null) ||
            (typeof obj?.value === 'string' ? obj.value : null) ||
            (typeof obj?.data === 'string' ? obj.data : null) ||
            (typeof nestedData?.address === 'string' ? nestedData.address : null) ||
            (typeof nestedData?.owner === 'string' ? nestedData.owner : null);
        if (fallback && isLikelySolanaAddress(fallback)) return fallback;
    } catch {
        return null;
    }

    return null;
};

const resolveEnsOrBasename = async (name: string): Promise<string | null> => {
    const raw = name.trim().toLowerCase();
    const normalized = raw.endsWith('.base') ? `${raw}.eth` : raw;
    if (!normalized.endsWith('.eth')) return null;

    try {
        const resolved = await ensClient.getEnsAddress({ name: normalized });
        if (!resolved) return null;
        return resolved.toLowerCase();
    } catch {
        return null;
    }
};

const getInternalUserId = async (authUserId: string): Promise<string> => {
    const { data, error } = await supabase
        .from('users')
        .select('id')
        .or(`privy_id.eq.${authUserId},id.eq.${authUserId}`)
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to resolve user: ${error.message}`);
    }

    if (!data?.id) {
        throw new Error('User not found');
    }

    return data.id;
};

/**
 * GET /api/recipients
 * List user's saved wallet recipients
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = await getInternalUserId(req.user!.id);

        const { data, error } = await supabase
            .from('wallet_recipients')
            .select('*')
            .eq('user_id', userId)
            .order('last_used_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to fetch recipients: ${error.message}`);
        }

        const recipients = (data || []).map((recipient: any) => ({
            id: recipient.id,
            address: recipient.address,
            chain: recipient.chain,
            label: recipient.label || null,
            updatedAt: new Date(recipient.last_used_at || recipient.updated_at || recipient.created_at).getTime(),
            createdAt: recipient.created_at,
        }));

        res.json({
            success: true,
            data: { recipients },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/recipients
 * Save or update a wallet recipient
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = await getInternalUserId(req.user!.id);
        const { address, chain, label } = req.body as { address?: string; chain?: RecipientChain; label?: string | null };

        if (!address || (chain !== 'base' && chain !== 'solana')) {
            res.status(400).json({
                success: false,
                error: { message: 'address and chain are required' },
            });
            return;
        }

        const normalizedAddress = normalizeAddress(address.trim(), chain);
        const detectedChain = detectRecipientChain(normalizedAddress);
        if (detectedChain !== chain) {
            res.status(400).json({
                success: false,
                error: { message: 'address does not match chain' },
            });
            return;
        }

        const { data, error } = await supabase
            .from('wallet_recipients')
            .upsert(
                {
                    user_id: userId,
                    address: normalizedAddress,
                    chain,
                    label: typeof label === 'string' && label.trim() ? label.trim() : null,
                    last_used_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,address' }
            )
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to save recipient: ${error.message}`);
        }

        res.json({
            success: true,
            data: {
                recipient: {
                    id: data.id,
                    address: data.address,
                    chain: data.chain,
                    label: data.label || null,
                    updatedAt: new Date(data.last_used_at || data.updated_at || data.created_at).getTime(),
                    createdAt: data.created_at,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/recipients/:id
 * Delete a saved wallet recipient
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = await getInternalUserId(req.user!.id);
        const { id } = req.params;

        const { error } = await supabase
            .from('wallet_recipients')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            throw new Error(`Failed to delete recipient: ${error.message}`);
        }

        res.json({
            success: true,
            data: { message: 'Recipient deleted successfully' },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Resolve recipient input (address, ENS, basename, .sol)
 */
const resolveHandler = async (req: Request, res: Response, next: any) => {
    try {
        const bodyInput = (req.body as { input?: string } | undefined)?.input;
        const queryInput = typeof req.query?.input === 'string'
            ? req.query.input
            : typeof req.query?.name === 'string'
                ? req.query.name
                : '';
        const input = bodyInput || queryInput;
        const rawInput = (input || '').trim();

        if (!rawInput) {
            res.status(400).json({
                success: false,
                error: { message: 'input is required' },
            });
            return;
        }

        const directChain = detectRecipientChain(rawInput);
        if (directChain) {
            res.json({
                success: true,
                data: {
                    address: normalizeAddress(rawInput, directChain),
                    chain: directChain,
                    source: 'address',
                },
            });
            return;
        }

        if (/\.sol$/i.test(rawInput)) {
            const resolved = await resolveSolDomain(rawInput);
            if (!resolved) {
                res.status(404).json({
                    success: false,
                    error: { message: 'Could not resolve .sol domain' },
                });
                return;
            }
            res.json({
                success: true,
                data: {
                    address: resolved,
                    chain: 'solana',
                    source: 'sns',
                },
            });
            return;
        }

        if (/\.eth$/i.test(rawInput) || /\.base$/i.test(rawInput)) {
            const resolved = await resolveEnsOrBasename(rawInput);
            if (!resolved) {
                res.status(404).json({
                    success: false,
                    error: { message: 'Could not resolve ENS/basename from blockchain' },
                });
                return;
            }
            res.json({
                success: true,
                data: {
                    address: resolved,
                    chain: 'base',
                    source: 'ens',
                },
            });
            return;
        }

        res.status(400).json({
            success: false,
            error: { message: 'Enter a valid address, ENS/basename (.eth), or .sol name' },
        });
    } catch (error) {
        next(error);
    }
};

// Main endpoint
router.post('/resolve', authenticate, resolveHandler);
router.get('/resolve', authenticate, resolveHandler);
// Backward-compatible alias
router.post('/resolve-recipient', authenticate, resolveHandler);
router.get('/resolve-recipient', authenticate, resolveHandler);

export default router;
