import { Composio } from '@composio/core';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('ComposioCalendar');

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;

let cachedSdk: Composio | null = null;
function getSdk(): Composio {
  if (!COMPOSIO_API_KEY) throw new Error('COMPOSIO_API_KEY is not configured');
  if (cachedSdk) return cachedSdk;
  cachedSdk = new Composio({ apiKey: COMPOSIO_API_KEY });
  return cachedSdk;
}

function userIdFor(hedwigUserId: string): string {
  return `hedwig_${hedwigUserId}`;
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.events)) return value.events;
  if (Array.isArray(value?.data?.items)) return value.data.items;
  if (Array.isArray(value?.data?.events)) return value.data.events;
  return [];
}

function eventStart(event: any): string | null {
  return event?.start?.dateTime ?? event?.start?.date ?? event?.start_datetime ?? event?.startTime ?? event?.start_at ?? null;
}

function eventEnd(event: any): string | null {
  return event?.end?.dateTime ?? event?.end?.date ?? event?.end_datetime ?? event?.endTime ?? event?.end_at ?? null;
}

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function getContentDueDate(content: unknown): string | null {
  if (!content || typeof content !== 'object') return null;
  const record = content as Record<string, unknown>;
  const dueDate = record.due_date || record.dueDate || null;
  return typeof dueDate === 'string' && dueDate.trim() ? dueDate.trim() : null;
}

async function upsertLocalCalendarEvent(params: {
  userId: string;
  title: string;
  description?: string | null;
  eventDate: string;
  eventType: 'invoice_due' | 'project_deadline';
  sourceType: 'invoice' | 'project';
  sourceId: string;
}): Promise<void> {
  const { data: existing } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('user_id', params.userId)
    .eq('source_type', params.sourceType)
    .eq('source_id', params.sourceId)
    .maybeSingle();

  const payload = {
    user_id: params.userId,
    title: params.title,
    description: params.description || null,
    event_date: params.eventDate,
    event_type: params.eventType,
    status: 'upcoming',
    source_type: params.sourceType,
    source_id: params.sourceId,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabase.from('calendar_events').update(payload).eq('id', existing.id);
    return;
  }

  await supabase.from('calendar_events').insert(payload);
}

async function seedHedwigCalendarEventsForWorkspace(userId: string): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const [invoicesRes, projectsRes] = await Promise.all([
    supabase
      .from('documents')
      .select('id, title, amount, currency, status, content, clients:client_id ( name )')
      .eq('user_id', userId)
      .eq('type', 'INVOICE')
      .in('status', ['SENT', 'VIEWED', 'DRAFT'])
      .limit(250),
    supabase
      .from('projects')
      .select('id, name, description, status, deadline, clients:client_id ( name )')
      .eq('user_id', userId)
      .gte('deadline', nowIso)
      .lte('deadline', in90Days)
      .limit(250),
  ]);

  if (invoicesRes.error) logger.warn('Failed to seed invoice calendar events', { userId, message: invoicesRes.error.message });
  if (projectsRes.error) logger.warn('Failed to seed project calendar events', { userId, message: projectsRes.error.message });

  for (const invoice of invoicesRes.data ?? []) {
    if (!['SENT', 'VIEWED', 'DRAFT'].includes(normalizeStatus(invoice.status))) continue;
    const dueDate = getContentDueDate(invoice.content);
    if (!dueDate) continue;
    const dueTime = Date.parse(dueDate.length <= 10 ? `${dueDate}T12:00:00Z` : dueDate);
    if (!Number.isFinite(dueTime) || dueTime < now.getTime() || dueTime > Date.parse(in90Days)) continue;
    const clientName = (invoice as any).clients?.name;
    await upsertLocalCalendarEvent({
      userId,
      title: invoice.title || `Invoice due${clientName ? `: ${clientName}` : ''}`,
      description: `Invoice due${invoice.amount ? ` for ${invoice.currency || 'USD'} ${invoice.amount}` : ''}.`,
      eventDate: new Date(dueTime).toISOString(),
      eventType: 'invoice_due',
      sourceType: 'invoice',
      sourceId: invoice.id,
    });
  }

  for (const project of projectsRes.data ?? []) {
    if (!project.deadline || normalizeStatus(project.status) === 'COMPLETED') continue;
    await upsertLocalCalendarEvent({
      userId,
      title: `${project.name || 'Project'} deadline`,
      description: project.description || null,
      eventDate: project.deadline,
      eventType: 'project_deadline',
      sourceType: 'project',
      sourceId: project.id,
    });
  }
}

export async function hasActiveComposioCalendar(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('composio_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')
    .eq('status', 'active')
    .maybeSingle();
  return Boolean(data?.id);
}

export async function syncComposioGoogleCalendar(userId: string): Promise<void> {
  if (!(await hasActiveComposioCalendar(userId))) {
    logger.warn('No active Composio Google Calendar connection', { userId });
    return;
  }

  const sdk = getSdk();
  const composioUserId = userIdFor(userId);
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const result: any = await sdk.tools.execute('GOOGLECALENDAR_EVENTS_LIST', {
    userId: composioUserId,
    arguments: {
      calendar_id: 'primary',
      time_min: timeMin,
      time_max: timeMax,
      single_events: true,
      order_by: 'startTime',
      max_results: 50,
    },
    dangerouslySkipVersionCheck: true,
  });

  const events = asArray(result?.data ?? result);
  for (const event of events) {
    const startAt = eventStart(event);
    const endAt = eventEnd(event);
    const allDay = Boolean(event?.start?.date && !event?.start?.dateTime);
    const attendees = asArray(event?.attendees).map((attendee) => attendee?.email).filter(Boolean);
    const eventId = event?.id ?? event?.event_id ?? event?.htmlLink ?? `${event?.summary || event?.title || 'event'}:${startAt || ''}`;

    if (!eventId) continue;

    await supabase
      .from('external_calendar_events')
      .upsert({
        user_id: userId,
        integration_id: null,
        provider: 'google_calendar',
        provider_event_id: String(eventId),
        title: event?.summary ?? event?.title ?? '',
        description: event?.description ?? null,
        location: event?.location ?? null,
        start_at: startAt,
        end_at: endAt,
        all_day: allDay,
        attendees,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider,provider_event_id' });
  }

  await supabase
    .from('composio_connections')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', 'google_calendar');

  logger.info('Composio Google Calendar sync complete', { userId, count: events.length });

  await pushHedwigEventsToComposioGoogleCalendar(userId).catch((error) => {
    logger.warn('Composio Google Calendar push failed after sync', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function pushHedwigEventsToComposioGoogleCalendar(userId: string): Promise<void> {
  if (!(await hasActiveComposioCalendar(userId))) return;

  await seedHedwigCalendarEventsForWorkspace(userId).catch((error) => {
    logger.warn('Could not seed Hedwig calendar events before Composio push', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  const sdk = getSdk();
  const composioUserId = userIdFor(userId);

  const { data: hedwigEvents } = await supabase
    .from('calendar_events')
    .select('id, title, description, event_date, event_type, status, google_event_id')
    .eq('user_id', userId)
    .in('status', ['upcoming', 'completed'])
    .order('event_date', { ascending: true })
    .limit(100);

  if (!hedwigEvents?.length) return;

  let pushed = 0;
  for (const event of hedwigEvents as any[]) {
    const startDate = String(event.event_date).slice(0, 10);
    const endDay = new Date(startDate + 'T00:00:00Z');
    endDay.setUTCDate(endDay.getUTCDate() + 1);

    const argumentsPayload = {
      calendar_id: 'primary',
      summary: event.title,
      description: event.description || undefined,
      start_date: startDate,
      end_date: endDay.toISOString().slice(0, 10),
      start_datetime: `${startDate}T09:00:00.000Z`,
      event_duration_minutes: 24 * 60,
    };

    const slug = event.google_event_id ? 'GOOGLECALENDAR_PATCH_EVENT' : 'GOOGLECALENDAR_CREATE_EVENT';
    const result: any = await sdk.tools.execute(slug, {
      userId: composioUserId,
      arguments: {
        ...argumentsPayload,
        ...(event.google_event_id ? { event_id: event.google_event_id } : {}),
      },
      dangerouslySkipVersionCheck: true,
    });

    const created = result?.data ?? result;
    const googleEventId = created?.id ?? created?.event_id ?? created?.event?.id ?? null;
    if (googleEventId) {
      await supabase.from('calendar_events').update({ google_event_id: String(googleEventId) }).eq('id', event.id);
    }
    pushed++;
  }

  logger.info('Pushed Hedwig events to Composio Google Calendar', { userId, pushed });
}
