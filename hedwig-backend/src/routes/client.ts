import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';

const router = Router();

type ClientStats = {
    totalEarnings: number;
    outstandingBalance: number;
};

const toNumber = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: unknown): string => String(value || '').trim().toUpperCase();
const normalizeType = (value: unknown): string => String(value || '').trim().toUpperCase();

function accumulateClientStats(documents: any[] | null | undefined): Map<string, ClientStats> {
    const stats = new Map<string, ClientStats>();

    for (const doc of documents || []) {
        const clientId = doc?.client_id ? String(doc.client_id) : '';
        if (!clientId) continue;

        const current = stats.get(clientId) ?? { totalEarnings: 0, outstandingBalance: 0 };
        const amount = toNumber(doc.amount);
        const status = normalizeStatus(doc.status);
        const type = normalizeType(doc.type);

        if (status === 'PAID') {
            current.totalEarnings += amount;
        } else if (type === 'INVOICE' && ['SENT', 'VIEWED', 'OVERDUE'].includes(status)) {
            current.outstandingBalance += amount;
        }

        stats.set(clientId, current);
    }

    return stats;
}

async function fetchClientStats(userId: string, clientIds: string[]): Promise<Map<string, ClientStats>> {
    if (clientIds.length === 0) return new Map();

    const { data, error } = await supabase
        .from('documents')
        .select('client_id, amount, status, type')
        .eq('user_id', userId)
        .in('client_id', clientIds);

    if (error) {
        throw new Error(`Failed to fetch client document stats: ${error.message}`);
    }

    return accumulateClientStats(data || []);
}

function formatClient(client: any, stats?: ClientStats) {
    return {
        id: client.id,
        userId: client.user_id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        company: client.company,
        address: client.address,
        walletAddress: client.wallet_address,
        totalEarnings: Number(((stats?.totalEarnings ?? parseFloat(client.total_earnings ?? '0')) || 0).toFixed(2)),
        outstandingBalance: Number(((stats?.outstandingBalance ?? parseFloat(client.outstanding_balance ?? '0')) || 0).toFixed(2)),
        notes: client.notes ?? null,
        createdAt: client.created_at,
        updatedAt: client.updated_at,
    };
}

/**
 * GET /api/clients
 * Get all clients for the authenticated user
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

        // Get internal user ID
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const { data: clients, error } = await supabase
            .from('clients')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to fetch clients: ${error.message}`);
        }

        const stats = await fetchClientStats(user.id, (clients || []).map((client) => String(client.id)));
        const formattedClients = clients.map((client) => formatClient(client, stats.get(String(client.id))));

        res.json({
            success: true,
            data: { clients: formattedClients },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/clients/:id
 * Get a specific client
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.id;

        // Get internal user ID
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const { data: client, error } = await supabase
            .from('clients')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (error || !client) {
            res.status(404).json({
                success: false,
                error: { message: 'Client not found' },
            });
            return;
        }

        const stats = await fetchClientStats(user.id, [String(client.id)]);
        const formattedClient = formatClient(client, stats.get(String(client.id)));

        res.json({
            success: true,
            data: { client: formattedClient },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/clients
 * Create a new client
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { name, email, phone, company, address, walletAddress, notes } = req.body;
        const privyId = req.user!.id;

        // Get internal user ID
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!name) {
            res.status(400).json({ success: false, error: 'Name is required' });
            return;
        }

        const { data: client, error } = await supabase
            .from('clients')
            .insert({
                user_id: user.id,
                name,
                email,
                phone,
                company,
                address,
                wallet_address: walletAddress,
                notes: notes || null,
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create client: ${error.message}`);
        }

        const stats = await fetchClientStats(user.id, [String(client.id)]);
        const formattedClient = formatClient(client, stats.get(String(client.id)));

        res.json({
            success: true,
            data: { client: formattedClient },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/clients/:id
 * Update a client
 */
router.put('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { name, email, phone, company, address, walletAddress, notes } = req.body;
        const privyId = req.user!.id;

        // Get internal user ID
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Build update object with only provided fields
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (company !== undefined) updateData.company = company;
        if (address !== undefined) updateData.address = address;
        if (walletAddress !== undefined) updateData.wallet_address = walletAddress;
        if (notes !== undefined) updateData.notes = notes;

        // Ensure at least one field is being updated
        if (Object.keys(updateData).length === 0) {
            res.status(400).json({
                success: false,
                error: { message: 'No fields to update' },
            });
            return;
        }

        const { data: client, error } = await supabase
            .from('clients')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error || !client) {
            res.status(404).json({
                success: false,
                error: { message: 'Client not found or update failed' },
            });
            return;
        }

        const formattedClient = {
            id: client.id,
            userId: client.user_id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            company: client.company,
            address: client.address,
            walletAddress: client.wallet_address,
            totalEarnings: parseFloat(client.total_earnings ?? '0') || 0,
            outstandingBalance: parseFloat(client.outstanding_balance ?? '0') || 0,
            notes: client.notes ?? null,
            createdAt: client.created_at,
            updatedAt: client.updated_at,
        };

        res.json({
            success: true,
            data: { client: formattedClient },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/clients/:id
 * Delete a client
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.id;

        // Get internal user ID
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) {
            throw new Error(`Failed to delete client: ${error.message}`);
        }

        res.json({
            success: true,
            message: 'Client deleted successfully',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
