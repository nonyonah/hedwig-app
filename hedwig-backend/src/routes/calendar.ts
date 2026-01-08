import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';

const router = Router();

/**
 * GET /api/calendar
 * List calendar events for the authenticated user
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.privyId;
        const { status, from, to, limit = '50' } = req.query;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        let query = supabase
            .from('calendar_events')
            .select('*')
            .eq('user_id', user.id)
            .order('event_date', { ascending: true })
            .limit(parseInt(limit as string));

        // Filter by status
        if (status) {
            query = query.eq('status', status);
        } else {
            // Default: show upcoming and completed (not cancelled)
            query = query.neq('status', 'cancelled');
        }

        // Filter by date range
        if (from) {
            query = query.gte('event_date', from);
        }
        if (to) {
            query = query.lte('event_date', to);
        }

        const { data: events, error } = await query;

        if (error) {
            throw new Error(`Failed to fetch events: ${error.message}`);
        }

        // Format response
        const formattedEvents = (events || []).map(e => ({
            id: e.id,
            title: e.title,
            description: e.description,
            eventDate: e.event_date,
            eventType: e.event_type,
            status: e.status,
            sourceType: e.source_type,
            sourceId: e.source_id,
            createdAt: e.created_at,
        }));

        res.json({
            success: true,
            data: { events: formattedEvents }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/calendar/:id
 * Get a specific calendar event
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.privyId;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const { data: event, error } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (error || !event) {
            res.status(404).json({ success: false, error: 'Event not found' });
            return;
        }

        res.json({
            success: true,
            data: {
                event: {
                    id: event.id,
                    title: event.title,
                    description: event.description,
                    eventDate: event.event_date,
                    eventType: event.event_type,
                    status: event.status,
                    sourceType: event.source_type,
                    sourceId: event.source_id,
                    createdAt: event.created_at,
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/calendar
 * Create a new calendar event (custom reminder)
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { title, description, eventDate, eventType = 'custom' } = req.body;
        const privyId = req.user!.privyId;

        if (!title || !eventDate) {
            res.status(400).json({
                success: false,
                error: 'Title and eventDate are required'
            });
            return;
        }

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const { data: event, error } = await supabase
            .from('calendar_events')
            .insert({
                user_id: user.id,
                title,
                description: description || null,
                event_date: eventDate,
                event_type: eventType,
                status: 'upcoming',
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create event: ${error.message}`);
        }

        console.log('[Calendar] Event created:', event.id);

        res.status(201).json({
            success: true,
            data: {
                event: {
                    id: event.id,
                    title: event.title,
                    description: event.description,
                    eventDate: event.event_date,
                    eventType: event.event_type,
                    status: event.status,
                    createdAt: event.created_at,
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/calendar/:id
 * Update a calendar event
 */
router.patch('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { title, description, eventDate, status } = req.body;
        const privyId = req.user!.privyId;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        // Build update object
        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (eventDate !== undefined) updateData.event_date = eventDate;
        if (status !== undefined) updateData.status = status;

        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ success: false, error: 'No update data provided' });
            return;
        }

        const { data: event, error } = await supabase
            .from('calendar_events')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error || !event) {
            res.status(404).json({ success: false, error: 'Event not found or update failed' });
            return;
        }

        console.log('[Calendar] Event updated:', event.id);

        res.json({
            success: true,
            data: {
                event: {
                    id: event.id,
                    title: event.title,
                    description: event.description,
                    eventDate: event.event_date,
                    eventType: event.event_type,
                    status: event.status,
                    createdAt: event.created_at,
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/calendar/:id
 * Delete a calendar event
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.privyId;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const { error } = await supabase
            .from('calendar_events')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) {
            throw new Error(`Failed to delete event: ${error.message}`);
        }

        console.log('[Calendar] Event deleted:', id);

        res.json({
            success: true,
            message: 'Event deleted successfully'
        });

    } catch (error) {
        next(error);
    }
});

/**
 * Helper function: Create calendar event from source
 * Used by document.ts and milestone.ts to auto-create events
 */
export async function createCalendarEventFromSource(
    userId: string,
    title: string,
    eventDate: string,
    eventType: 'invoice_due' | 'milestone_due' | 'project_deadline',
    sourceType: string,
    sourceId: string,
    description?: string
): Promise<{ id: string } | null> {
    try {
        const { data: event, error } = await supabase
            .from('calendar_events')
            .insert({
                user_id: userId,
                title,
                description: description || null,
                event_date: eventDate,
                event_type: eventType,
                status: 'upcoming',
                source_type: sourceType,
                source_id: sourceId,
            })
            .select('id')
            .single();

        if (error) {
            console.error('[Calendar] Failed to create event from source:', error);
            return null;
        }

        console.log('[Calendar] Auto-created event:', event.id, 'for', sourceType, sourceId);
        return event;
    } catch (error) {
        console.error('[Calendar] Error creating event from source:', error);
        return null;
    }
}

/**
 * Helper function: Mark calendar event as completed by source
 * Used when invoice/milestone is paid
 */
export async function markCalendarEventCompleted(
    sourceType: string,
    sourceId: string
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('calendar_events')
            .update({ status: 'completed' })
            .eq('source_type', sourceType)
            .eq('source_id', sourceId);

        if (error) {
            console.error('[Calendar] Failed to mark event completed:', error);
            return false;
        }

        console.log('[Calendar] Marked event completed for', sourceType, sourceId);
        return true;
    } catch (error) {
        console.error('[Calendar] Error marking event completed:', error);
        return false;
    }
}

export default router;
