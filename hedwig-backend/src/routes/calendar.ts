import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { createLogger } from '../utils/logger';

const logger = createLogger('Calendar');

const router = Router();

/**
 * GET /api/calendar
 * List calendar events for the authenticated user
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const { status, from, to, limit = '50' } = req.query;
        const parsedLimit = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));

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
            .limit(parsedLimit);

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
            data: {
                events: formattedEvents,
                pagination: {
                    limit: parsedLimit,
                    count: formattedEvents.length,
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/calendar/:id/complete
 * Mark an event as completed
 */
router.patch('/:id/complete', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const { data: existingEvent, error: fetchEventError } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (fetchEventError || !existingEvent) {
            res.status(404).json({ success: false, error: 'Event not found' });
            return;
        }

        const sourceType = String(existingEvent.source_type || '').toLowerCase();
        const sourceId = existingEvent.source_id as string | null;

        // If this event is linked to an invoice/payment-link, also mark document as PAID.
        if (sourceId && (sourceType === 'invoice' || sourceType === 'payment_link')) {
            const { data: linkedDoc, error: fetchDocError } = await supabase
                .from('documents')
                .select('id, status, content')
                .eq('id', sourceId)
                .eq('user_id', user.id)
                .maybeSingle();

            if (fetchDocError) {
                logger.warn('Could not fetch linked document while marking calendar event paid');
            } else if (linkedDoc?.id) {
                const existingContent = (linkedDoc.content && typeof linkedDoc.content === 'object')
                    ? linkedDoc.content
                    : {};

                const { error: updateDocError } = await supabase
                    .from('documents')
                    .update({
                        status: 'PAID',
                        content: {
                            ...existingContent,
                            paid_at: new Date().toISOString(),
                            manual_mark_paid_from_calendar: true,
                        },
                    })
                    .eq('id', sourceId)
                    .eq('user_id', user.id);

                if (updateDocError) {
                    logger.warn('Failed to mark linked document as paid from calendar route');
                }
            }
        }

        const { data: event, error: updateEventError } = await supabase
            .from('calendar_events')
            .update({ status: 'completed' })
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (updateEventError || !event) {
            res.status(400).json({ success: false, error: 'Event update failed' });
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
 * GET /api/calendar/:id
 * Get a specific calendar event
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.id;

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
        const privyId = req.user!.id;

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

        logger.info('Event created');

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
        const privyId = req.user!.id;

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

        logger.info('Event updated');

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
        const privyId = req.user!.id;

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

        logger.info('Event deleted');

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
            logger.error('Failed to create event from source');
            return null;
        }

        logger.debug('Auto-created event from source');
        return event;
    } catch (error) {
        logger.error('Error creating event from source');
        return null;
    }
}

/**
 * Helper function: Create or update calendar event by source reference
 */
export async function upsertCalendarEventFromSource(
    userId: string,
    title: string,
    eventDate: string,
    eventType: 'invoice_due' | 'milestone_due' | 'project_deadline' | 'custom',
    sourceType: string,
    sourceId: string,
    description?: string
): Promise<{ id: string } | null> {
    try {
        const { data: existing } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('user_id', userId)
            .eq('source_type', sourceType)
            .eq('source_id', sourceId)
            .maybeSingle();

        if (existing?.id) {
            const { data: updated, error: updateError } = await supabase
                .from('calendar_events')
                .update({
                    title,
                    description: description || null,
                    event_date: eventDate,
                    event_type: eventType,
                    status: 'upcoming',
                })
                .eq('id', existing.id)
                .select('id')
                .single();

            if (updateError) {
                logger.error('Failed to update existing source calendar event');
                return null;
            }
            return updated;
        }

        return await createCalendarEventFromSource(
            userId,
            title,
            eventDate,
            eventType as 'invoice_due' | 'milestone_due' | 'project_deadline',
            sourceType,
            sourceId,
            description
        );
    } catch (error) {
        logger.error('Error upserting source calendar event');
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
            logger.error('Failed to mark event completed');
            return false;
        }

        logger.debug('Marked event completed');
        return true;
    } catch (error) {
        logger.error('Error marking event completed');
        return false;
    }
}

/**
 * Helper function: Update calendar event status by source
 */
export async function updateCalendarEventStatusBySource(
    sourceType: string,
    sourceId: string,
    status: 'upcoming' | 'completed' | 'cancelled'
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('calendar_events')
            .update({ status })
            .eq('source_type', sourceType)
            .eq('source_id', sourceId);

        if (error) {
            logger.error('Failed to update calendar event status by source');
            return false;
        }
        return true;
    } catch (error) {
        logger.error('Error updating calendar event status by source');
        return false;
    }
}

export default router;
