import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Dynamically import expo-calendar to avoid crashes in Expo Go
let Calendar: typeof import('expo-calendar') | null = null;

// Try to load the calendar module - will fail gracefully in Expo Go
async function loadCalendarModule() {
    if (Calendar) return Calendar;
    
    try {
        Calendar = await import('expo-calendar');
        return Calendar;
    } catch (error) {
        console.log('[CalendarSync] expo-calendar not available (requires development build)');
        return null;
    }
}

const HEDWIG_CALENDAR_TITLE = 'Hedwig';
const CALENDAR_STORAGE_KEY = '@hedwig_calendar_id';
const SYNCED_EVENTS_KEY = '@hedwig_synced_events';

export interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    eventDate: string;
    eventType: 'invoice_due' | 'milestone_due' | 'project_deadline' | 'custom';
    sourceType?: string;
    sourceId?: string;
}

/**
 * Check if calendar features are available (requires development build)
 */
export function isCalendarAvailable(): boolean {
    // Web doesn't support device calendars
    if (Platform.OS === 'web') return false;
    return true; // Will be validated when actually trying to use
}

/**
 * Request calendar permissions for iOS and Android
 */
export async function requestCalendarPermissions(): Promise<boolean> {
    try {
        const Cal = await loadCalendarModule();
        if (!Cal) return false;
        
        const { status } = await Cal.requestCalendarPermissionsAsync();
        return status === 'granted';
    } catch (error) {
        console.error('[CalendarSync] Error requesting permissions:', error);
        return false;
    }
}

/**
 * Check if calendar permissions are already granted
 */
export async function hasCalendarPermissions(): Promise<boolean> {
    try {
        const Cal = await loadCalendarModule();
        if (!Cal) return false;
        
        const { status } = await Cal.getCalendarPermissionsAsync();
        return status === 'granted';
    } catch (error) {
        console.error('[CalendarSync] Error checking permissions:', error);
        return false;
    }
}

/**
 * Get or create the Hedwig calendar on the device
 */
export async function getOrCreateHedwigCalendar(): Promise<string | null> {
    try {
        const Cal = await loadCalendarModule();
        if (!Cal) return null;
        
        // Check if we already have a stored calendar ID
        const storedId = await AsyncStorage.getItem(CALENDAR_STORAGE_KEY);
        if (storedId) {
            // Verify it still exists
            const calendars = await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT);
            const exists = calendars.find(cal => cal.id === storedId);
            if (exists) {
                return storedId;
            }
        }

        // Get all calendars
        const calendars = await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT);
        
        // Look for existing Hedwig calendar
        const hedwigCalendar = calendars.find(cal => cal.title === HEDWIG_CALENDAR_TITLE);
        if (hedwigCalendar) {
            await AsyncStorage.setItem(CALENDAR_STORAGE_KEY, hedwigCalendar.id);
            return hedwigCalendar.id;
        }

        // Create new Hedwig calendar
        const defaultCalendarSource = Platform.OS === 'ios'
            ? await getDefaultCalendarSource(Cal)
            : { isLocalAccount: true, name: 'Hedwig', type: Cal.SourceType.LOCAL };

        if (!defaultCalendarSource) {
            console.error('[CalendarSync] No default calendar source found');
            return null;
        }

        const newCalendarId = await Cal.createCalendarAsync({
            title: HEDWIG_CALENDAR_TITLE,
            color: '#7C3AED', // Purple color matching Hedwig theme
            entityType: Cal.EntityTypes.EVENT,
            sourceId: (defaultCalendarSource as any).id,
            source: defaultCalendarSource as any,
            name: 'Hedwig',
            ownerAccount: 'personal',
            accessLevel: Cal.CalendarAccessLevel.OWNER,
        });

        await AsyncStorage.setItem(CALENDAR_STORAGE_KEY, newCalendarId);
        console.log('[CalendarSync] Created Hedwig calendar:', newCalendarId);
        return newCalendarId;
    } catch (error) {
        console.error('[CalendarSync] Error getting/creating calendar:', error);
        return null;
    }
}

/**
 * Get default calendar source for iOS
 */
async function getDefaultCalendarSource(Cal: typeof import('expo-calendar')): Promise<any | null> {
    const calendars = await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT);
    
    // Prefer iCloud calendar source
    const iCloudSource = calendars.find(cal => cal.source?.name === 'iCloud');
    if (iCloudSource) return iCloudSource.source;
    
    // Fall back to any available source
    const defaultCalendar = calendars.find(cal => cal.allowsModifications);
    return defaultCalendar?.source || null;
}

/**
 * Add an event to the device calendar
 */
export async function addEventToDeviceCalendar(event: CalendarEvent): Promise<string | null> {
    try {
        const Cal = await loadCalendarModule();
        if (!Cal) {
            console.log('[CalendarSync] Calendar module not available');
            return null;
        }
        
        const hasPermission = await hasCalendarPermissions();
        if (!hasPermission) {
            const granted = await requestCalendarPermissions();
            if (!granted) {
                console.log('[CalendarSync] Calendar permission denied');
                return null;
            }
        }

        const calendarId = await getOrCreateHedwigCalendar();
        if (!calendarId) {
            console.error('[CalendarSync] Could not get Hedwig calendar');
            return null;
        }

        const eventDate = new Date(event.eventDate);
        
        // Create all-day event for due dates
        const deviceEventId = await Cal.createEventAsync(calendarId, {
            title: event.title,
            notes: event.description || '',
            startDate: eventDate,
            endDate: eventDate,
            allDay: true,
            alarms: [
                { relativeOffset: -1440 }, // 1 day before
                { relativeOffset: -60 },   // 1 hour before
            ],
        });

        // Store mapping between Hedwig event and device event
        await storeSyncedEvent(event.id, deviceEventId);
        
        console.log('[CalendarSync] Added event to device calendar:', deviceEventId);
        return deviceEventId;
    } catch (error) {
        console.error('[CalendarSync] Error adding event:', error);
        return null;
    }
}

/**
 * Remove an event from the device calendar
 */
export async function removeEventFromDeviceCalendar(hedwigEventId: string): Promise<boolean> {
    try {
        const Cal = await loadCalendarModule();
        if (!Cal) return false;
        
        const deviceEventId = await getSyncedDeviceEventId(hedwigEventId);
        if (!deviceEventId) {
            console.log('[CalendarSync] Event not synced to device');
            return false;
        }

        await Cal.deleteEventAsync(deviceEventId);
        await removeSyncedEvent(hedwigEventId);
        
        console.log('[CalendarSync] Removed event from device calendar:', deviceEventId);
        return true;
    } catch (error) {
        console.error('[CalendarSync] Error removing event:', error);
        return false;
    }
}

/**
 * Sync multiple events to device calendar
 */
export async function syncEventsToDeviceCalendar(events: CalendarEvent[]): Promise<{ synced: number; failed: number }> {
    let synced = 0;
    let failed = 0;

    for (const event of events) {
        const isSynced = await isEventSynced(event.id);
        if (isSynced) {
            synced++;
            continue;
        }

        const result = await addEventToDeviceCalendar(event);
        if (result) {
            synced++;
        } else {
            failed++;
        }
    }

    return { synced, failed };
}

/**
 * Check if an event is already synced to device calendar
 */
export async function isEventSynced(hedwigEventId: string): Promise<boolean> {
    const deviceEventId = await getSyncedDeviceEventId(hedwigEventId);
    return !!deviceEventId;
}

/**
 * Store mapping between Hedwig event and device event
 */
async function storeSyncedEvent(hedwigEventId: string, deviceEventId: string): Promise<void> {
    try {
        const syncedEvents = await getSyncedEvents();
        syncedEvents[hedwigEventId] = deviceEventId;
        await AsyncStorage.setItem(SYNCED_EVENTS_KEY, JSON.stringify(syncedEvents));
    } catch (error) {
        console.error('[CalendarSync] Error storing synced event:', error);
    }
}

/**
 * Get device event ID for a Hedwig event
 */
async function getSyncedDeviceEventId(hedwigEventId: string): Promise<string | null> {
    try {
        const syncedEvents = await getSyncedEvents();
        return syncedEvents[hedwigEventId] || null;
    } catch (error) {
        console.error('[CalendarSync] Error getting synced event:', error);
        return null;
    }
}

/**
 * Remove synced event mapping
 */
async function removeSyncedEvent(hedwigEventId: string): Promise<void> {
    try {
        const syncedEvents = await getSyncedEvents();
        delete syncedEvents[hedwigEventId];
        await AsyncStorage.setItem(SYNCED_EVENTS_KEY, JSON.stringify(syncedEvents));
    } catch (error) {
        console.error('[CalendarSync] Error removing synced event:', error);
    }
}

/**
 * Get all synced events mapping
 */
async function getSyncedEvents(): Promise<Record<string, string>> {
    try {
        const data = await AsyncStorage.getItem(SYNCED_EVENTS_KEY);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error('[CalendarSync] Error getting synced events:', error);
        return {};
    }
}

/**
 * Clear all synced events (for debugging/reset)
 */
export async function clearSyncedEvents(): Promise<void> {
    try {
        await AsyncStorage.removeItem(SYNCED_EVENTS_KEY);
        console.log('[CalendarSync] Cleared synced events');
    } catch (error) {
        console.error('[CalendarSync] Error clearing synced events:', error);
    }
}
