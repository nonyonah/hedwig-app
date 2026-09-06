import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';

// chat.ts writes conversations.user_id with the internal users.id — resolve
// it here too, tolerating legacy rows keyed by Privy DID.
async function scopedUserIds(req: Request): Promise<string[]> {
  const userData = await getOrCreateUser(req.user!.id);
  const ids = [(userData as unknown as { id: string }).id];
  if (req.user!.id && !ids.includes(req.user!.id)) ids.push(req.user!.id);
  return ids;
}

const router = Router();

/**
 * GET /api/conversations
 * Get all conversations for the logged-in user
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const userIds = await scopedUserIds(req);

        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('*')
            .in('user_id', userIds)
            .order('updated_at', { ascending: false });

        if (error) {
            res.status(500).json({ success: false, error: { message: error.message } });
            return;
        }

        res.json({
            success: true,
            data: { conversations }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

/**
 * GET /api/conversations/:id/messages
 * Get all messages for a specific conversation
 */
router.get('/:id/messages', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userIds = await scopedUserIds(req);

        // Verify conversation belongs to user
        const { data: conversation } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', id)
            .in('user_id', userIds)
            .single();

        if (!conversation) {
            res.status(404).json({ success: false, error: { message: 'Conversation not found' } });
            return;
        }

        // Get messages
        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });

        if (error) {
            res.status(500).json({ success: false, error: { message: error.message } });
            return;
        }

        res.json({
            success: true,
            data: { messages }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

export default router;
