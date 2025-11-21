import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import GeminiService from '../services/gemini';

const router = Router();

/**
 * POST /api/chat/message
 * Send a message and get AI response
 */
router.post('/message', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { message, conversationId } = req.body;
        const userId = req.user!.id;

        if (!message) {
            res.status(400).json({
                success: false,
                error: { message: 'Message is required' },
            });
            return;
        }

        // Find or create conversation
        let conversation;
        let messages: any[] = [];

        if (conversationId) {
            const { data: existingConversation, error: findError } = await supabase
                .from('conversations')
                .select('*')
                .eq('id', conversationId)
                .eq('user_id', userId)
                .single();

            if (findError || !existingConversation) {
                res.status(404).json({
                    success: false,
                    error: { message: 'Conversation not found' },
                });
                return;
            }
            conversation = existingConversation;

            // Fetch last 20 messages for context
            const { data: existingMessages } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true })
                .limit(20);

            messages = existingMessages || [];
        } else {
            // Create new conversation
            const { data: newConversation, error: createError } = await supabase
                .from('conversations')
                .insert({
                    user_id: userId,
                    title: message.substring(0, 50), // Use first 50 chars as title
                })
                .select()
                .single();

            if (createError) {
                throw new Error(`Failed to create conversation: ${createError.message}`);
            }
            conversation = newConversation;
        }

        // Save user message
        await supabase.from('messages').insert({
            conversation_id: conversation.id,
            role: 'USER',
            content: message,
        });

        // Detect intent
        const intentResult = await GeminiService.detectIntent(message);

        // Prepare conversation history for context
        const history = messages.map((msg) => ({
            role: msg.role.toLowerCase(),
            content: msg.content,
        }));

        // Generate AI response
        const aiResponse = await GeminiService.generateChatResponse(message, history);

        // Save AI response
        await supabase.from('messages').insert({
            conversation_id: conversation.id,
            role: 'ASSISTANT',
            content: aiResponse,
        });

        // Update conversation updated_at
        await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversation.id);

        res.json({
            success: true,
            data: {
                conversationId: conversation.id,
                message: aiResponse,
                intent: intentResult,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/chat/conversations
 * Get all conversations for a user
 */
router.get('/conversations', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;

        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to fetch conversations: ${error.message}`);
        }

        // For each conversation, get the last message (preview)
        // This is N+1 query problem, but okay for small scale. 
        // Better approach would be a lateral join or a view in Supabase.
        const conversationsWithPreview = await Promise.all(conversations.map(async (conv) => {
            const { data: lastMessage } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            return {
                id: conv.id,
                userId: conv.user_id,
                title: conv.title,
                createdAt: conv.created_at,
                updatedAt: conv.updated_at,
                messages: lastMessage ? [{
                    id: lastMessage.id,
                    conversationId: lastMessage.conversation_id,
                    role: lastMessage.role,
                    content: lastMessage.content,
                    createdAt: lastMessage.created_at
                }] : []
            };
        }));

        res.json({
            success: true,
            data: { conversations: conversationsWithPreview },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/chat/conversations/:id
 * Get a specific conversation with all messages
 */
router.get('/conversations/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (convError || !conversation) {
            res.status(404).json({
                success: false,
                error: { message: 'Conversation not found' },
            });
            return;
        }

        const { data: messages, error: msgError } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });

        if (msgError) {
            throw new Error(`Failed to fetch messages: ${msgError.message}`);
        }

        // Map to camelCase
        const formattedConversation = {
            id: conversation.id,
            userId: conversation.user_id,
            title: conversation.title,
            createdAt: conversation.created_at,
            updatedAt: conversation.updated_at,
            messages: messages.map(msg => ({
                id: msg.id,
                conversationId: msg.conversation_id,
                role: msg.role,
                content: msg.content,
                createdAt: msg.created_at
            }))
        };

        res.json({
            success: true,
            data: { conversation: formattedConversation },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/chat/conversations/:id
 * Delete a conversation
 */
router.delete('/conversations/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        // Verify ownership
        const { data: conversation, error: findError } = await supabase
            .from('conversations')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (findError || !conversation) {
            res.status(404).json({
                success: false,
                error: { message: 'Conversation not found' },
            });
            return;
        }

        const { error: deleteError } = await supabase
            .from('conversations')
            .delete()
            .eq('id', id);

        if (deleteError) {
            throw new Error(`Failed to delete conversation: ${deleteError.message}`);
        }

        res.json({
            success: true,
            data: { message: 'Conversation deleted successfully' },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
