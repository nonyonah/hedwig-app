import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { EmailService } from '../services/email';
import { DeepSeekService } from '../services/deepseek';
import { getWorkspaceRole, isOwnerOrAdmin, getMemberAssignedProjectIds } from '../middleware/workspaceRole';

const router = Router();

function getEffectiveWorkspaceId(req: Request, userId: string): string {
  const wsId = req.headers['x-workspace-id'] as string;
  return wsId || `ws_personal_${userId}`;
}

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

function formatClient(client: any, stats?: ClientStats, isMemberView = false) {
    const base = {
        id: client.id,
        userId: client.user_id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        company: client.company,
        address: client.address,
        walletAddress: client.wallet_address,
        segment: (client.segment as string) || 'new',
        lastActivityAt: client.last_activity_at ?? null,
        notes: client.notes ?? null,
        createdAt: client.created_at,
        updatedAt: client.updated_at,
    };

    if (isMemberView) {
        return { ...base, totalEarnings: 0, outstandingBalance: 0 };
    }

    return {
        ...base,
        totalEarnings: Number(((stats?.totalEarnings ?? parseFloat(client.total_earnings ?? '0')) || 0).toFixed(2)),
        outstandingBalance: Number(((stats?.outstandingBalance ?? parseFloat(client.outstanding_balance ?? '0')) || 0).toFixed(2)),
    };
}

const senderNameFromUser = (user: any): string =>
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || 'A Hedwig user';

async function getOwnedClient(userId: string, clientId: string) {
    const { data: client, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('user_id', userId)
        .single();

    if (error || !client) return null;
    return client;
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

        const effectiveWsId = getEffectiveWorkspaceId(req, user.id);
        const role = await getWorkspaceRole(req, user.id);

        let query = supabase.from('clients').select('*').eq('user_id', user.id).eq('workspace_id', effectiveWsId);

        // Member: only show clients linked to assigned projects
        if (role === 'member') {
          const assignedProjectIds = await getMemberAssignedProjectIds(user.id, role, effectiveWsId);
          if (!assignedProjectIds || assignedProjectIds.length === 0) {
            res.json({ success: true, data: { clients: [] } });
            return;
          }
          const { data: projectClientIds } = await supabase
            .from('projects')
            .select('client_id')
            .in('id', assignedProjectIds)
            .eq('workspace_id', effectiveWsId);
          const clientIds = [...new Set((projectClientIds || []).map((p: any) => p.client_id).filter(Boolean))];
          if (clientIds.length === 0) {
            res.json({ success: true, data: { clients: [] } });
            return;
          }
          query = query.in('id', clientIds);
        }

        const { data: clients, error } = await query.order('created_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to fetch clients: ${error.message}`);
        }

        const isMemberView = role === 'member';
        const stats = isMemberView ? new Map() : await fetchClientStats(user.id, (clients || []).map((client) => String(client.id)));
        const formattedClients = (clients || []).map((client) => formatClient(client, stats.get(String(client.id)), isMemberView));

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
        const id = String(req.params.id);
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

        // Recent documents (last 50) — invoices, payment links, proposals.
        const { data: recentDocs } = await supabase
            .from('documents')
            .select('id, type, title, amount, status, created_at, updated_at, content')
            .eq('user_id', user.id)
            .eq('client_id', client.id)
            .order('updated_at', { ascending: false })
            .limit(50);

        const documents = (recentDocs || []).map((doc: any) => ({
            id: doc.id,
            type: doc.type,
            title: doc.title,
            amount: toNumber(doc.amount),
            status: doc.status,
            createdAt: doc.created_at,
            updatedAt: doc.updated_at,
            paidAt: doc.content?.paid_at ?? null,
            paidVia: doc.content?.paid_via ?? null,
            dueDate: doc.content?.due_date ?? null,
        }));

        res.json({
            success: true,
            data: { client: formattedClient, documents },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/clients/:id/message/draft
 * Draft a client email with DeepSeek.
 */
router.post('/:id/message/draft', authenticate, async (req: Request, res: Response, next) => {
    try {
        const id = String(req.params.id);
        const { purpose } = req.body || {};
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const client = await getOwnedClient(user.id, id);
        if (!client) {
            res.status(404).json({ success: false, error: { message: 'Client not found' } });
            return;
        }

        const draft = await DeepSeekService.generateClientEmailDraft({
            senderName: senderNameFromUser(user),
            clientName: client.name || 'there',
            clientCompany: client.company || null,
            purpose: typeof purpose === 'string' ? purpose : null,
        });

        res.json({ success: true, data: { draft } });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/clients/:id/message
 * Send a reviewed client email through Resend using the Hedwig template.
 */
router.post('/:id/message', authenticate, async (req: Request, res: Response, next) => {
    try {
        const id = String(req.params.id);
        const { subject, message } = req.body || {};
        const privyId = req.user!.id;

        const cleanSubject = String(subject || '').trim();
        const cleanMessage = String(message || '').trim();
        if (!cleanSubject || !cleanMessage) {
            res.status(400).json({ success: false, error: { message: 'Subject and message are required' } });
            return;
        }
        if (cleanSubject.length > 160 || cleanMessage.length > 5000) {
            res.status(400).json({ success: false, error: { message: 'Message is too long' } });
            return;
        }

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const client = await getOwnedClient(user.id, id);
        if (!client) {
            res.status(404).json({ success: false, error: { message: 'Client not found' } });
            return;
        }
        if (!client.email) {
            res.status(400).json({ success: false, error: { message: 'Client does not have an email address' } });
            return;
        }

        const emailSent = await EmailService.sendClientMessageEmail({
            to: client.email,
            clientName: client.name || 'Client',
            senderName: senderNameFromUser(user),
            senderEmail: user.email || null,
            subject: cleanSubject,
            message: cleanMessage,
        });

        if (!emailSent) {
            res.status(502).json({ success: false, error: { message: 'Email could not be sent' } });
            return;
        }

        res.json({ success: true, data: { emailSent: true, clientEmail: client.email } });
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

        const role = await getWorkspaceRole(req, user.id);
        if (!isOwnerOrAdmin(role)) {
            res.status(403).json({ success: false, error: { message: 'Only owners and admins can create clients' } });
            return;
        }

        const effectiveWsId = getEffectiveWorkspaceId(req, user.id);

        const insertData: any = {
            user_id: user.id,
            workspace_id: effectiveWsId,
            name,
            email,
            phone,
            company,
            address,
            wallet_address: walletAddress,
            notes: notes || null,
        };

        const { data: client, error } = await supabase
            .from('clients')
            .insert(insertData)
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

        const role = await getWorkspaceRole(req, user.id);
        if (!isOwnerOrAdmin(role)) {
            res.status(403).json({ success: false, error: { message: 'Only owners and admins can modify clients' } });
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

        const formattedClient = formatClient(client);

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

        const role = await getWorkspaceRole(req, user.id);
        if (!isOwnerOrAdmin(role)) {
            res.status(403).json({ success: false, error: { message: 'Only owners and admins can delete clients' } });
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
