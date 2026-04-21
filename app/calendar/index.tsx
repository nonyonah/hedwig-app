import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, SectionList, Dimensions, FlatList, Animated, Platform, UIManager, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import { TrueSheet } from '@hedwig/true-sheet';
import { Typography } from '../../styles/typography';
import { joinApiUrl } from '../../utils/apiBaseUrl';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import {
    ChevronLeft as ChevronLeftIcon,
    Calendar as CalendarIcon,
    ChevronRight as ChevronRightIcon,
    CheckCircle as CheckCircleIcon,
    Clock as ClockIcon,
    Tag as TagIcon,
    RefreshCw as RefreshCwIcon,
} from '../../components/ui/AppIcon';

const CaretLeft = (props: any) => <ChevronLeftIcon {...props} />;
const CalendarBlank = (props: any) => <CalendarIcon {...props} />;
const CaretRight = (props: any) => <ChevronRightIcon {...props} />;
const CheckCircle = (props: any) => <CheckCircleIcon {...props} />;
const Clock = (props: any) => <ClockIcon {...props} />;
const Tag = (props: any) => <TagIcon {...props} />;
const RefreshCw = (props: any) => <RefreshCwIcon {...props} />;


// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    eventType: string;
    eventDate: string;
    sourceType?: string;
    sourceId?: string;
    status?: string;
    createdAt?: string;
}

interface Section {
    title: string;
    subtitle: string;
    isToday: boolean;
    dateISO: string;
    data: CalendarEvent[];
}

const SCREEN_WIDTH = Dimensions.get('window').width;

// Calendar heights for animation
const STRIP_HEIGHT = 124;  // collapsed: monthLabel (~36) + strip row (~72) + paddingBottom (8) + margin (8)
const GRID_HEIGHT  = 340;  // expanded: monthLabel + day headers + 6 rows × 40 + drag handle + padding

const toLocalDateKey = (input: Date | string) => {
    const d = new Date(input);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const EVENT_COLORS: Record<string, string> = {
    invoice_due: '#DC2626',
    milestone_due: '#F59E0B',
    project_deadline: '#2563EB',
    reminder: '#6B7280',
};

const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
};

const generateDateRange = (startDate: Date, days: number) => {
    const dates = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }
    return dates;
};

const generateMonthGrid = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const startOffset = startDayOfWeek;

    const grid = [];
    for (let i = 0; i < startOffset; i++) {
        const d = new Date(year, month, 0 - i);
        grid.unshift(d);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        grid.push(new Date(year, month, i));
    }
    const remaining = 42 - grid.length;
    for (let i = 1; i <= remaining; i++) {
        grid.push(new Date(year, month + 1, i));
    }
    return grid;
};

export default function CalendarScreen() {
    const router = useRouter();
    useAnalyticsScreen('Calendar');
    const { getAccessToken } = useAuth();
    const themeColors = useThemeColors();

    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // UI State
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [expanded, setExpanded] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());
    const [daysPastWindow, setDaysPastWindow] = useState(21);
    const [daysFutureWindow, setDaysFutureWindow] = useState(90);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const eventSheetRef = useRef<TrueSheet>(null);

    const flatListRef = useRef<FlatList<Date>>(null);
    const sectionListRef = useRef<SectionList<CalendarEvent, Section>>(null);
    const calendarHeight = useRef(new Animated.Value(STRIP_HEIGHT)).current;

    useFocusEffect(
        useCallback(() => {
            fetchEvents();
        }, [selectedDate, daysPastWindow, daysFutureWindow])
    );

    // Initial Scroll Alignment (Left-align start of week)
    // We only need this if selecting a new date while already collapsed
    useEffect(() => {
        if (!expanded && flatListRef.current) {
            const startOfWeek = getStartOfWeek(selectedDate);
            const index = scrollableDates.findIndex(d => isSameDay(d, startOfWeek));

            if (index !== -1) {
                // Only animate if we are already mounted.
                // However, initialScrollIndex handles the mount case.
                // We use this for updates.
                flatListRef.current?.scrollToIndex({ index: Math.max(0, index), animated: true, viewPosition: 0 });
            }
        }
    }, [selectedDate, expanded]);

    const scrollableDates = useMemo(() => {
        const today = new Date();
        const startOfWeek = getStartOfWeek(today);
        startOfWeek.setDate(startOfWeek.getDate() - 28);
        return generateDateRange(startOfWeek, 120);
    }, []);

    const getInitialScrollIndex = () => {
        const startOfWeek = getStartOfWeek(selectedDate);
        const index = scrollableDates.findIndex(d => isSameDay(d, startOfWeek));
        return Math.max(0, index);
    };

    const monthGridDates = useMemo(() => {
        return generateMonthGrid(viewDate.getFullYear(), viewDate.getMonth());
    }, [viewDate]);

    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getDate() === d2.getDate() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getFullYear() === d2.getFullYear();
    };

    const isToday = (date: Date) => {
        const today = new Date();
        return isSameDay(date, today);
    };

    const sections: Section[] = useMemo(() => {
        const grouped: Record<string, CalendarEvent[]> = {};

        events.forEach(event => {
            const key = toLocalDateKey(event.eventDate);
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(event);
        });

        const today = new Date();
        for (let i = 0; i < 14; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const key = toLocalDateKey(d);
            if (!grouped[key]) grouped[key] = [];
        }

        const sortedKeys = Object.keys(grouped).sort();

        return sortedKeys.map(key => {
            const [y, m, d] = key.split('-').map(Number);
            const properDate = new Date(y, m - 1, d);

            const dayName = properDate.toLocaleDateString('en-US', { weekday: 'long' });
            const monthDay = properDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const checkDate = new Date(properDate);
            checkDate.setHours(0, 0, 0, 0);

            let relativeDay = '';
            const diffTime = checkDate.getTime() - now.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 0) relativeDay = 'Today';
            else if (diffDays === 1) relativeDay = 'Tomorrow';
            else if (diffDays === -1) relativeDay = 'Yesterday';

            const subtitle = relativeDay ? `${relativeDay} · ${dayName}` : dayName;

            return {
                title: monthDay,
                subtitle: subtitle,
                isToday: diffDays === 0,
                dateISO: key,
                data: grouped[key]
            };
        });
    }, [events]);

    const scrollToDateSection = (date: Date) => {
        const key = toLocalDateKey(date);
        const index = sections.findIndex(s => s.dateISO === key);
        if (index !== -1 && sectionListRef.current) {
            setTimeout(() => {
                sectionListRef.current?.scrollToLocation({
                    sectionIndex: index,
                    itemIndex: 0,
                    animated: true,
                    viewOffset: 60
                });
            }, 10);
        }
    };

    const fetchEvents = async () => {
        try {
            const token = await getAccessToken();
            const rangeFrom = new Date(selectedDate);
            rangeFrom.setDate(rangeFrom.getDate() - daysPastWindow);
            const rangeTo = new Date(selectedDate);
            rangeTo.setDate(rangeTo.getDate() + daysFutureWindow);
            const response = await fetch(
                joinApiUrl(`/api/calendar?from=${encodeURIComponent(rangeFrom.toISOString())}&to=${encodeURIComponent(rangeTo.toISOString())}&limit=200`),
                {
                headers: { 'Authorization': `Bearer ${token}` }
                }
            );
            const data = await response.json();
            if (data.success) {
                setEvents(data.data.events);
            }
        } catch (error) {
            console.error('Error fetching events:', error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
            setIsLoadingMore(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchEvents();
    };

    const syncCalendar = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            await fetch(`${apiUrl}/api/integrations/sync`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'google_calendar' }),
            });
            await fetchEvents();
        } catch {
            // non-fatal
        } finally {
            setIsSyncing(false);
        }
    };

    const onLoadMore = () => {
        if (isLoadingMore) return;
        setIsLoadingMore(true);
        setDaysFutureWindow(prev => prev + 60);
    };

    const toggleExpanded = () => {
        const toValue = expanded ? STRIP_HEIGHT : GRID_HEIGHT;
        if (!expanded) setViewDate(new Date(selectedDate));
        setExpanded(prev => !prev);
        Animated.spring(calendarHeight, {
            toValue,
            useNativeDriver: false,
            damping: 18,
            stiffness: 180,
            mass: 0.8,
        }).start();
    };

    const handleMarkAsPaid = async (event: CalendarEvent) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const previous = events;
        setEvents(prev => prev.filter(e => e.id !== event.id));

        try {
            const token = await getAccessToken();
            const response = await fetch(joinApiUrl(`/api/calendar/${event.id}/complete`), {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to update event');
            Alert.alert('Success', 'Marked as paid.');
        } catch (error) {
            setEvents(previous);
            Alert.alert('Update failed', 'Could not mark event as paid. Please try again.');
        }
    };

    const openEventDetails = (event: CalendarEvent) => {
        setSelectedEvent(event);
        requestAnimationFrame(() => {
            eventSheetRef.current?.present();
        });
    };

    const closeEventDetails = () => {
        eventSheetRef.current?.dismiss();
    };

    const openEventSource = (event: CalendarEvent) => {
        if (!event.sourceId || !event.sourceType) {
            Alert.alert('Unavailable', 'No linked source found for this event.');
            return;
        }
        if (event.sourceType === 'invoice') {
            router.push(`/invoice/${event.sourceId}`);
            return;
        }
        if (event.sourceType === 'payment_link' || event.sourceType === 'link') {
            router.push(`/payment-link/${event.sourceId}`);
            return;
        }
        Alert.alert('Unavailable', 'Source navigation is not available for this event type.');
    };

    const getStatusChip = (status?: string) => {
        const value = (status || 'upcoming').toLowerCase();
        if (value === 'completed') return { label: 'Completed', bg: '#DCFCE7', color: '#166534' };
        if (value === 'cancelled') return { label: 'Cancelled', bg: '#FEE2E2', color: '#B91C1C' };
        return { label: 'Upcoming', bg: '#DBEAFE', color: '#1D4ED8' };
    };

    const formatEventType = (value: string) =>
        value.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const renderDayItem = ({ item }: { item: Date }) => {
        const isSelected = isSameDay(item, selectedDate);
        const isTodayDate = isToday(item);

        return (
            <TouchableOpacity
                style={[styles.dayItem]}
                onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedDate(item);
                    scrollToDateSection(item);
                }}
            >
                <Text style={[styles.dayName, { color: isTodayDate ? Colors.primary : themeColors.textSecondary, fontFamily: 'GoogleSansFlex_500Medium' }]}>
                    {item.toLocaleDateString('en-US', { weekday: 'narrow' })}
                </Text>
                <View style={[
                    styles.dayNumberContainer,
                    isSelected && { backgroundColor: Colors.primary },
                ]}>
                    <Text style={[
                        styles.dayNumber,
                        { fontFamily: 'GoogleSansFlex_600SemiBold' },
                        { color: isSelected ? '#FFFFFF' : (isTodayDate ? Colors.primary : themeColors.textPrimary) }
                    ]}>
                        {item.getDate()}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderGridItem = (date: Date, index: number) => {
        const isSelected = isSameDay(date, selectedDate);
        const isTodayDate = isToday(date);
        const isSameMonth = date.getMonth() === viewDate.getMonth();

        return (
            <TouchableOpacity
                key={index}
                style={styles.gridItem}
                onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedDate(date);
                    scrollToDateSection(date);
                }}
            >
                <View style={[
                    styles.gridNumberContainer,
                    isSelected && { backgroundColor: Colors.primary }
                ]}>
                    <Text style={[
                        styles.gridNumber,
                        { fontFamily: 'GoogleSansFlex_500Medium' },
                        { color: isSelected ? '#FFFFFF' : (isTodayDate ? Colors.primary : (isSameMonth ? themeColors.textPrimary : themeColors.textSecondary)) }
                    ]}>
                        {date.getDate()}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const getEventColor = (eventType: string) => EVENT_COLORS[eventType] || '#8B5CF6';

    const getEventLabel = (item: CalendarEvent) => {
        if (item.sourceType) return item.sourceType;
        return item.eventType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const renderEvent = ({ item }: { item: CalendarEvent }) => {
        // Fallback to item.createdAt if item.eventDate is just a YYYY-MM-DD
        const timeSource = item.createdAt || item.eventDate;
        const time = new Date(timeSource).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        const color = getEventColor(item.eventType);
        const statusChip = getStatusChip(item.status);

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.eventRow, { borderBottomColor: themeColors.border }]}
                onPress={() => openEventDetails(item)}
            >
                <TouchableOpacity
                    style={[styles.checkboxCircle, { borderColor: color }]}
                    onPress={() => handleMarkAsPaid(item)}
                >
                </TouchableOpacity>

                <View style={styles.eventContent}>
                    <Text style={[styles.eventTitle, { color: themeColors.textPrimary, fontFamily: 'GoogleSansFlex_500Medium' }]} numberOfLines={2}>
                        {item.title}
                    </Text>
                    {item.description && (
                        <Text style={[styles.eventDescription, { color: themeColors.textSecondary, fontFamily: 'GoogleSansFlex_400Regular' }]} numberOfLines={1}>
                            {item.description}
                        </Text>
                    )}
                    <View style={styles.eventMeta}>
                        <Text style={[styles.metaText, { color: themeColors.textSecondary, fontFamily: 'GoogleSansFlex_400Regular' }]}>
                            {time}
                        </Text>
                        <View style={styles.metaDot} />
                        <Text style={[styles.metaText, { color: themeColors.textSecondary, fontFamily: 'GoogleSansFlex_500Medium' }]}>
                            {getEventLabel(item)}
                        </Text>
                    </View>
                    <View style={styles.chipsRow}>
                        <View style={[styles.typeChip, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}>
                            <Tag size={12} color={themeColors.textSecondary} strokeWidth={2.8} />
                            <Text style={[styles.typeChipText, { color: themeColors.textSecondary, fontFamily: 'GoogleSansFlex_500Medium' }]}>
                                {formatEventType(item.eventType)}
                            </Text>
                        </View>
                        <View style={[styles.statusChip, { backgroundColor: statusChip.bg }]}>
                            <Text style={[styles.statusChipText, { color: statusChip.color, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>
                                {statusChip.label}
                            </Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const renderSectionHeader = ({ section }: { section: Section }) => (
        <View style={[styles.sectionHeader, { backgroundColor: themeColors.background }]}>
            <View style={styles.sectionRow}>
                <Text style={[styles.sectionDate, { color: themeColors.textPrimary, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>
                    {section.title} · {section.subtitle}
                </Text>
            </View>
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: themeColors.background }}>
            <SafeAreaView style={[styles.container]}>
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <IOSGlassIconButton
                            onPress={() => router.back()}
                            systemImage="chevron.left"
                            containerStyle={styles.headerButton}
                            circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                            icon={<CaretLeft size={26} color={themeColors.textPrimary} strokeWidth={3.5} />}
                        />
                        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Calendar</Text>
                        <IOSGlassIconButton
                            onPress={syncCalendar}
                            systemImage="arrow.clockwise"
                            containerStyle={styles.headerButton}
                            circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface, opacity: isSyncing ? 0.5 : 1 }]}
                            icon={<RefreshCw size={18} color={themeColors.textPrimary} strokeWidth={2.8} />}
                        />
                    </View>
                </View>

                <Animated.View style={[styles.calendarContainer, { height: calendarHeight, borderColor: themeColors.border }]}>
                    <TouchableOpacity
                        style={styles.monthLabel}
                        activeOpacity={0.7}
                        onPress={toggleExpanded}
                    >
                        <Text style={[styles.monthText, { color: themeColors.textPrimary, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>
                            {expanded
                                ? viewDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                : selectedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                            }
                        </Text>
                        <CaretRight
                            size={14}
                            color={themeColors.textPrimary}
                            strokeWidth={3}
                            style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
                        />
                    </TouchableOpacity>

                    {expanded ? (
                        <View style={styles.monthView}>
                            <View style={styles.gridHeaderRow}>
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                                    <Text key={i} style={[styles.gridHeaderCheck, { color: themeColors.textSecondary, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>{day}</Text>
                                ))}
                            </View>
                            <View style={styles.gridContainer}>
                                {Array.from({ length: 6 }, (_, row) => (
                                    <View key={row} style={styles.gridRow}>
                                        {monthGridDates.slice(row * 7, row * 7 + 7).map((d, col) =>
                                            renderGridItem(d, row * 7 + col)
                                        )}
                                    </View>
                                ))}
                            </View>
                            <View style={styles.dragHandleContainer}>
                                <View style={[styles.dragHandle, { backgroundColor: themeColors.border }]} />
                            </View>
                        </View>
                    ) : (
                        <FlatList
                            ref={flatListRef}
                            data={scrollableDates}
                            renderItem={renderDayItem}
                            keyExtractor={(item) => item.toISOString()}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.stripContent}
                            getItemLayout={(data, index) => (
                                { length: (SCREEN_WIDTH / 7), offset: (SCREEN_WIDTH / 7) * index, index }
                            )}
                            initialNumToRender={14}
                            initialScrollIndex={getInitialScrollIndex()}
                        />
                    )}
                </Animated.View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : (
                    <SectionList<CalendarEvent, Section>
                        ref={sectionListRef}
                        sections={sections}
                        renderItem={renderEvent}
                        renderSectionHeader={renderSectionHeader}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        stickySectionHeadersEnabled={false}
                        showsVerticalScrollIndicator={false}
                        onEndReached={onLoadMore}
                        onEndReachedThreshold={0.6}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                        }
                        ListFooterComponent={isLoadingMore ? (
                            <View style={styles.loadMoreFooter}>
                                <ActivityIndicator size="small" color={Colors.primary} />
                            </View>
                        ) : null}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <View style={[styles.emptyIconCircle, { backgroundColor: themeColors.surface }]}>
                                    <CalendarBlank size={48} color={themeColors.textSecondary} />
                                </View>
                                <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>No Upcoming Tasks</Text>
                                <View style={styles.emptyActions}>
                                    <TouchableOpacity
                                        style={[styles.emptyActionBtn, { backgroundColor: Colors.primary }]}
                                        onPress={() => router.push('/invoice/create')}
                                    >
                                        <Text style={[styles.emptyActionBtnText, { color: '#FFFFFF', fontFamily: 'GoogleSansFlex_600SemiBold' }]}>Create Invoice</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.emptyActionBtnAlt, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}
                                        onPress={() => router.push('/payment-link/create')}
                                    >
                                        <Text style={[styles.emptyActionBtnText, { color: themeColors.textPrimary, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>Create Payment Link</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        }
                    />
                )}

                <TrueSheet
                    ref={eventSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDismiss={() => setSelectedEvent(null)}
                >
                    <View style={styles.eventSheetContent}>
                        {selectedEvent ? (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <Text style={[styles.detailsTitle, { color: themeColors.textPrimary }]}>
                                    {selectedEvent.title}
                                </Text>
                                {!!selectedEvent.description && (
                                    <Text style={[styles.detailsDescription, { color: themeColors.textSecondary }]}>
                                        {selectedEvent.description}
                                    </Text>
                                )}
                                <View style={styles.detailsMetaRow}>
                                    <Clock size={16} color={themeColors.textSecondary} strokeWidth={2.8} />
                                    <Text style={[styles.detailsMetaText, { color: themeColors.textSecondary }]}>
                                        {new Date(selectedEvent.eventDate).toLocaleString()}
                                    </Text>
                                </View>
                                <View style={styles.detailsActions}>
                                    <TouchableOpacity
                                        style={[styles.detailsActionPrimary, { backgroundColor: Colors.primary }]}
                                        onPress={async () => {
                                            await handleMarkAsPaid(selectedEvent);
                                            closeEventDetails();
                                        }}
                                    >
                                        <CheckCircle size={16} color="#FFFFFF" strokeWidth={2.8} />
                                        <Text style={[styles.detailsActionText, { color: '#FFFFFF' }]}>Mark as paid</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.detailsActionAlt, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}
                                        onPress={() => openEventSource(selectedEvent)}
                                    >
                                        <Text style={[styles.detailsActionText, { color: themeColors.textPrimary }]}>Open source</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.detailsActionAlt, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}
                                        onPress={closeEventDetails}
                                    >
                                        <Text style={[styles.detailsActionText, { color: themeColors.textPrimary }]}>Close</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        ) : null}
                    </View>
                </TrueSheet>

            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {},
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        height: 60,
    },
    headerButton: {
        width: 44,
        height: 44,
        alignItems: 'flex-start',
    },
    backButtonCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: Platform.OS === 'android' ? 18 : 20,
        color: Colors.textPrimary,
        textAlign: 'center',
        flex: 1,
    },
    headerSpacer: {
        width: 44,
    },
    calendarContainer: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingBottom: 8,
        overflow: 'hidden',
    },
    monthLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    monthText: {
        fontSize: 16,
    },
    stripContent: {
        // paddingHorizontal: 16,
    },
    dayItem: {
        width: (SCREEN_WIDTH) / 7,
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
    },
    dayName: {
        fontSize: 11,
        textTransform: 'uppercase',
    },
    dayNumberContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dayNumber: {
        fontSize: 16,
    },
    monthView: {
        // paddingHorizontal: 16, // REMOVED padding
    },
    gridHeaderRow: {
        flexDirection: 'row',
        width: SCREEN_WIDTH,
        marginBottom: 8,
    },
    gridHeaderCheck: {
        flex: 1,
        textAlign: 'center',
        fontSize: 11,
        textTransform: 'uppercase',
    },
    gridContainer: {
        flexDirection: 'column',
        width: SCREEN_WIDTH,
    },
    gridRow: {
        flexDirection: 'row',
        width: SCREEN_WIDTH,
    },
    gridItem: {
        flex: 1,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gridNumberContainer: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16,
    },
    gridNumber: {
        fontSize: 15,
    },
    dragHandleContainer: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    dragHandle: {
        width: 32,
        height: 4,
        borderRadius: 2,
    },
    sectionHeader: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 8,
    },
    sectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionDate: {
        fontSize: 14,
    },
    eventRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        alignItems: 'flex-start',
    },
    checkboxCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        marginRight: 12,
        marginTop: 2,
    },
    eventContent: {
        flex: 1,
        gap: 4,
    },
    eventTitle: {
        fontSize: 15,
    },
    eventDescription: {
        fontSize: 13,
    },
    eventMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    chipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    typeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    typeChipText: {
        fontSize: 11,
    },
    statusChip: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    statusChipText: {
        fontSize: 11,
    },
    metaText: {
        fontSize: 12,
    },
    metaDot: {
        width: 2,
        height: 2,
        borderRadius: 1,
        backgroundColor: '#6B7280'
    },
    listContent: {
        paddingBottom: 100,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 80,
    },
    emptyIconCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyStateTitle: {
        fontSize: 18,
        marginTop: 4,
    },
    emptyActions: {
        width: '100%',
        marginTop: 18,
        gap: 10,
        paddingHorizontal: 24,
    },
    emptyActionBtn: {
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    emptyActionBtnAlt: {
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
    },
    emptyActionBtnText: {
        fontSize: 14,
    },
    loadMoreFooter: {
        paddingVertical: 14,
        alignItems: 'center',
    },
    eventSheetContent: {
        padding: 24,
        paddingBottom: 40,
    },
    detailsTitle: {
        ...Typography.h3,
        marginBottom: 8,
    },
    detailsDescription: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 10,
    },
    detailsMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    detailsMetaText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
        flex: 1,
    },
    detailsActions: {
        gap: 10,
    },
    detailsActionPrimary: {
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    detailsActionAlt: {
        borderRadius: 12,
        borderWidth: 1,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailsActionText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
});
