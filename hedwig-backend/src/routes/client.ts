import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';

const router = Router();

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

        // Map to camelCase (with safe fallbacks for columns that may not exist)
        const formattedClients = clients.map(client => ({
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
        }));

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
 * POST /api/clients
 * Create a new client
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { name, email, phone, company, address, walletAddress } = req.body;
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
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create client: ${error.message}`);
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
 * PUT /api/clients/:id
 * Update a client
 */
router.put('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { name, email, phone, company, address, walletAddress } = req.body;
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
