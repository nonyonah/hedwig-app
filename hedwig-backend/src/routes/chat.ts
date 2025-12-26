import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { GeminiService } from '../services/gemini';
import { handleAction } from '../services/actions';
import { getOrCreateUser } from '../utils/userHelper';
import multer from 'multer';

const router = Router();

// Configure multer for memory storage (files stored in buffer)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 5 // Max 5 files per request
    },
    fileFilter: (_req, file, cb) => {
        // Allow PDFs and images
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not allowed`));
        }
    }
});

/**
 * POST /api/chat/message
 * Send a message and get AI response
 * Supports optional file attachments (PDFs, images) for document analysis
 */
router.post('/message', authenticate, upload.array('files', 5), async (req: Request, res: Response, next) => {
    try {
        const { message, conversationId } = req.body;
        const privyUserId = req.user!.id;
        const uploadedFiles = req.files as Express.Multer.File[] | undefined;

        if (!message) {
            res.status(400).json({
                success: false,
                error: { message: 'Message is required' },
            });
            return;
        }

        console.log('[Chat] Files uploaded:', uploadedFiles?.length || 0);

        // Get or Create user
        // This ensures the user exists even if it's their first time without hitting profile endpoint
        const userData = await getOrCreateUser(privyUserId);

        if (!userData) {
            res.status(404).json({
                success: false,
                error: { message: 'User could not be found or created' },
            });
            return;
        }

        const userId = userData.email; // email is the primary key or unique identifier used for conversations

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
                .order('created_at', { ascending: false }) // Get NEWEST first
                .limit(20);

            // Reverse to get chronological order for AI
            messages = existingMessages ? existingMessages.reverse() : [];
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

        // Prepare conversation history for context
        const history = messages.map((msg) => ({
            role: msg.role.toLowerCase(),
            content: msg.content,
        }));

        // Fetch user's saved beneficiaries for offramp suggestions
        const { data: beneficiaries } = await supabase
            .from('beneficiaries')
            .select('id, bank_name, account_number, account_name')
            .eq('user_id', userData.id)
            .order('is_default', { ascending: false })
            .limit(5);

        const beneficiaryContext = beneficiaries?.map(b => ({
            id: b.id,
            bankName: b.bank_name,
            accountNumber: b.account_number,
            accountName: b.account_name,
        })) || [];

        console.log('[Chat] User has', beneficiaryContext.length, 'saved beneficiaries');

        // Fetch user's saved clients for invoice/payment-link suggestions
        const { data: clients } = await supabase
            .from('clients')
            .select('id, name, email, phone, company')
            .eq('user_id', userData.id)
            .order('created_at', { ascending: false })
            .limit(20);

        const clientContext = clients?.map(c => ({
            id: c.id,
            name: c.name,
            email: c.email || null,
            phone: c.phone || null,
            company: c.company || null,
        })) || [];

        console.log('[Chat] User has', clientContext.length, 'saved clients');

        // Process uploaded files for Gemini
        let fileData: { mimeType: string; data: string }[] | undefined;
        if (uploadedFiles && uploadedFiles.length > 0) {
            fileData = uploadedFiles.map(file => ({
                mimeType: file.mimetype,
                data: file.buffer.toString('base64')
            }));
            console.log('[Chat] Processed files for Gemini:', fileData.map(f => f.mimeType));
        }

        // Detect and fetch content from URLs in the message
        let enhancedMessage = message;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = message.match(urlRegex);
        let urlFetchFailed = false;

        if (urls && urls.length > 0) {
            console.log('[Chat] URLs detected in message:', urls);
            const urlContents: string[] = [];

            for (const url of urls.slice(0, 3)) { // Limit to 3 URLs
                try {
                    console.log('[Chat] Fetching content from:', url);
                    const response = await fetch(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                        },
                        signal: AbortSignal.timeout(10000) // 10 second timeout
                    });

                    if (response.ok) {
                        const contentType = response.headers.get('content-type') || '';

                        if (contentType.includes('text/html') || contentType.includes('text/plain')) {
                            let text = await response.text();
                            // Strip HTML tags for cleaner text (basic)
                            text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
                            text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                            text = text.replace(/<[^>]+>/g, ' ');
                            text = text.replace(/&nbsp;/g, ' ');
                            text = text.replace(/&amp;/g, '&');
                            text = text.replace(/&lt;/g, '<');
                            text = text.replace(/&gt;/g, '>');
                            text = text.replace(/\s+/g, ' ').trim();

                            // Check if we got meaningful content
                            if (text.length > 50) {
                                // Limit to first 5000 characters
                                if (text.length > 5000) {
                                    text = text.substring(0, 5000) + '... [truncated]';
                                }
                                urlContents.push(`\n\n--- [CONTENT FROM URL: ${url}] ---\n${text}\n--- [END CONTENT] ---\n`);
                                console.log('[Chat] Successfully fetched content from URL, length:', text.length);
                            } else {
                                console.log('[Chat] URL returned minimal content (likely blocked):', text.length);
                                urlFetchFailed = true;
                            }
                        } else {
                            console.log('[Chat] Unsupported content type:', contentType);
                            urlFetchFailed = true;
                        }
                    } else {
                        console.log('[Chat] Failed to fetch URL:', response.status);
                        urlFetchFailed = true;
                    }
                } catch (urlError: any) {
                    console.log('[Chat] Error fetching URL:', urlError.message);
                    urlFetchFailed = true;
                }
            }

            if (urlContents.length > 0) {
                enhancedMessage = message + urlContents.join('\n');
                console.log('[Chat] Enhanced message with URL content');
            } else if (urlFetchFailed) {
                // Add note that URL couldn't be fetched
                enhancedMessage = message + `\n\n[Note: The URL could not be accessed - the website may block automated access. Ask the user to paste the job description or content directly instead of just the link.]`;
                console.log('[Chat] URL fetch failed, added note for AI');
            }
        }

        // Generate AI response
        let aiResponseObj;
        try {
            aiResponseObj = await GeminiService.generateChatResponse(
                enhancedMessage,
                history,
                fileData,
                { beneficiaries: beneficiaryContext, clients: clientContext }
            );
        } catch (geminiError: any) {
            console.error('[Chat] Gemini generation failed:', geminiError);
            // Fallback response for fetch failures (likely network or API key issues)
            aiResponseObj = {
                intent: 'error',
                naturalResponse: "I'm having trouble connecting to my brain right now. Please try again in a moment."
            };
        }

        // AUTO-VERIFY BANK ACCOUNT: If we have bank details but no account name, fetch it automatically
        if (aiResponseObj.intent === 'COLLECT_OFFRAMP_INFO' && aiResponseObj.parameters) {
            const params = aiResponseObj.parameters;

            // Check if we have all required fields EXCEPT accountName
            if (params.amount && params.token && params.network &&
                params.bankName && params.accountNumber && !params.accountName) {

                console.log('[Chat] Auto-verifying bank account:', params.bankName, params.accountNumber);

                try {
                    const PaycrestService = (await import('../services/paycrest')).default;
                    const verifyResult = await PaycrestService.verifyBankAccount(
                        params.bankName,
                        params.accountNumber
                    );

                    if (verifyResult.verified && verifyResult.accountName) {
                        console.log('[Chat] Bank account verified:', verifyResult.accountName);

                        // Add the account name to parameters
                        aiResponseObj.parameters.accountName = verifyResult.accountName;

                        // Check if this is a Solana offramp - needs bridging first
                        const network = params.network?.toLowerCase();
                        if (network === 'solana') {
                            // Use bridge flow for Solana
                            aiResponseObj.intent = 'CONFIRM_SOLANA_BRIDGE';
                            aiResponseObj.naturalResponse = `I found your account: **${verifyResult.accountName}**. Since Paycrest doesn't support Solana directly, I'll help you bridge to Base first, then offramp. Ready to proceed?`;
                            console.log('[Chat] Upgraded intent to CONFIRM_SOLANA_BRIDGE for Solana network');
                        } else {
                            // Use normal offramp flow for Base
                            aiResponseObj.intent = 'CONFIRM_OFFRAMP';
                            aiResponseObj.naturalResponse = `I found your account: **${verifyResult.accountName}**. Ready to proceed with your withdrawal?`;
                            console.log('[Chat] Upgraded intent to CONFIRM_OFFRAMP');
                        }
                    } else {
                        // Could not verify, ask for account name manually
                        aiResponseObj.naturalResponse = `I couldn't verify this account automatically. Please provide the account name for ${params.bankName} account ${params.accountNumber}.`;
                    }
                } catch (verifyError) {
                    console.error('[Chat] Bank verification failed:', verifyError);
                    // Fall through with original response asking for account name
                }
            }
        }

        let finalResponseText = '';
        let actionResult = null;

        // Execute action if intent is present
        if (aiResponseObj.intent && aiResponseObj.intent !== 'general_chat' && aiResponseObj.intent !== 'error') {
            console.log(`[Chat] Executing action for intent: ${aiResponseObj.intent}`);
            try {
                const result = await handleAction(aiResponseObj.intent, aiResponseObj.parameters, req.user);
                actionResult = result;
                finalResponseText = result.text || aiResponseObj.naturalResponse;
            } catch (actionError: any) {
                console.error('[Chat] Action execution failed:', actionError);
                finalResponseText = "I understood what you wanted, but I encountered an error executing it.";
            }
        } else {
            finalResponseText = aiResponseObj.naturalResponse || "I'm not sure how to help with that.";
        }

        // Save AI response
        await supabase.from('messages').insert({
            conversation_id: conversation.id,
            role: 'ASSISTANT',
            content: finalResponseText,
        });

        // Update conversation updated_at
        await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversation.id);

        console.log('[Chat] Final response text:', finalResponseText);

        // Build response object
        const responseData: any = {
            conversationId: conversation.id,
            message: finalResponseText,
            intent: aiResponseObj.intent,
            actionResult: actionResult
        };

        // For CONFIRM_TRANSACTION, include transaction parameters for frontend modal
        if (aiResponseObj.intent === 'CONFIRM_TRANSACTION' && aiResponseObj.parameters) {
            responseData.parameters = {
                amount: aiResponseObj.parameters.amount,
                token: aiResponseObj.parameters.token || 'USDC',
                recipient: aiResponseObj.parameters.recipient,
                network: aiResponseObj.parameters.network || 'base'
            };
        }

        // For CONFIRM_OFFRAMP, include offramp parameters for frontend modal
        if (aiResponseObj.intent === 'CONFIRM_OFFRAMP' && aiResponseObj.parameters) {
            const params = aiResponseObj.parameters;

            // Fetch current rate from Paycrest
            let rate = '0';
            let estimatedFiat = 0;
            try {
                const PaycrestService = (await import('../services/paycrest')).default;
                rate = await PaycrestService.getExchangeRate(
                    params.token || 'USDC',
                    parseFloat(params.amount) || 10,
                    params.fiatCurrency || 'NGN',
                    params.network || 'base'
                );
                estimatedFiat = parseFloat(params.amount) * parseFloat(rate);
            } catch (rateError) {
                console.error('[Chat] Failed to fetch rate:', rateError);
            }

            responseData.parameters = {
                amount: params.amount,
                token: params.token || 'USDC',
                network: params.network || 'base',
                fiatCurrency: params.fiatCurrency || 'NGN',
                bankName: params.bankName,
                accountNumber: params.accountNumber,
                accountName: params.accountName,
                rate: rate,
                estimatedFiat: estimatedFiat.toFixed(2)
            };
        }

        // For CONFIRM_SOLANA_BRIDGE, return bridge parameters for frontend modal
        if (aiResponseObj.intent === 'CONFIRM_SOLANA_BRIDGE' && aiResponseObj.parameters) {
            const params = aiResponseObj.parameters;

            responseData.parameters = {
                amount: params.amount,
                token: params.token || 'SOL',
                network: 'solana',
                // Offramp details for after bridging
                fiatCurrency: params.fiatCurrency || 'NGN',
                bankName: params.bankName,
                accountNumber: params.accountNumber,
                accountName: params.accountName,
            };
            console.log('[Chat] Returning CONFIRM_SOLANA_BRIDGE parameters for bridge flow');
        }

        res.json({
            success: true,
            data: responseData,
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
        const privyUserId = req.user!.id;
        console.log('[Conversations] Request from Privy user:', privyUserId);

        // Look up user in database by privy_id to get their email (which is the user PK)
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('email')
            .eq('privy_id', privyUserId)
            .single();

        console.log('[Conversations] User lookup result:', { userData, userError });

        if (userError || !userData) {
            console.log('[Conversations] User not found for privy_id:', privyUserId, '- returning empty conversations');
            // Return empty array instead of error for users not yet registered
            res.json({
                success: true,
                data: { conversations: [] },
            });
            return;
        }

        const userId = userData.email; // email is the primary key
        console.log('[Conversations] Found user email:', userId);

        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        console.log('[Conversations] Query result:', {
            conversationsCount: conversations?.length || 0,
            error,
            userId
        });

        if (error) {
            console.error('[Conversations] Supabase error:', error);
            throw new Error(`Failed to fetch conversations: ${error.message}`);
        }

        // For each conversation, get the last message (preview)
        // This is N+1 query problem, but okay for small scale. 
        // Better approach would be a lateral join or a view in Supabase.
        const conversationsWithPreview = await Promise.all((conversations || []).map(async (conv) => {
            const { data: lastMessage } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            return {
                id: conv.id,
                user_id: conv.user_id,
                title: conv.title,
                created_at: conv.created_at,
                updated_at: conv.updated_at,
                messages: lastMessage ? [{
                    id: lastMessage.id,
                    conversation_id: lastMessage.conversation_id,
                    role: lastMessage.role.toLowerCase(),
                    content: lastMessage.content,
                    created_at: lastMessage.created_at
                }] : []
            };
        }));

        console.log('[Conversations] Sending response with', conversationsWithPreview.length, 'conversations');

        res.json({
            success: true,
            data: conversationsWithPreview,
        });
    } catch (error) {
        console.error('[Conversations] Error:', error);
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
        const privyUserId = req.user!.id;

        // Look up user in database by privy_id to get their email (which is the user PK)
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('email')
            .eq('privy_id', privyUserId)
            .single();

        if (userError || !userData) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found in database' },
            });
            return;
        }

        const userId = userData.email; // email is the primary key

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
        const privyUserId = req.user!.id;

        // Look up user in database by privy_id to get their email
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('email')
            .eq('privy_id', privyUserId)
            .single();

        if (userError || !userData) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found in database' },
            });
            return;
        }

        const userId = userData.email;

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
