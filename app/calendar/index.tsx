import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, SectionList, Dimensions, FlatList, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft as CaretLeft, Calendar as CalendarBlank, CalendarCheck, ChevronRight as CaretRight, Plus, CheckCircle, Clock, Tag } from '../../components/ui/AppIcon';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';

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
    relatedId?: string;
    relatedType?: string;
    amount?: number;
    currency?: string;
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

    // UI State
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [expanded, setExpanded] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());

    const flatListRef = useRef<FlatList<Date>>(null);
    const sectionListRef = useRef<SectionList<CalendarEvent, Section>>(null);

    useFocusEffect(
        useCallback(() => {
            fetchEvents();
        }, [])
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
            const date = new Date(event.eventDate);
            const key = date.toISOString().split('T')[0];
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(event);
        });

        const today = new Date();
        for (let i = 0; i < 14; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const key = d.toISOString().split('T')[0];
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
        const key = date.toISOString().split('T')[0];
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
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/calendar?status=upcoming`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                setEvents(data.data.events);
            }
        } catch (error) {
            console.error('Error fetching events:', error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchEvents();
    };

    const toggleExpanded = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
        if (!expanded) {
            setViewDate(new Date(selectedDate));
        }
    };

    const handleMarkAsPaid = async (event: CalendarEvent) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Optimistic update
        setEvents(prev => prev.filter(e => e.id !== event.id));
        Alert.alert("Success", "Marked as paid.");
    };

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
        if (item.relatedType) return item.relatedType;
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

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.eventRow, { borderBottomColor: themeColors.border }]}
            // onPress={() => openEventDetails(item)}
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
                        <Text style={[styles.metaText, { color: themeColors.textSecondary, fontFamily: 'GoogleSansFlex_400Regular' }]}>
                            {getEventLabel(item)}
                        </Text>
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
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <View style={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}>
                                <CaretLeft size={24} color={themeColors.textPrimary} strokeWidth={3} />
                            </View>
                        </TouchableOpacity>

                        <Text style={[styles.headerTitle, { color: themeColors.textPrimary, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>Upcoming</Text>

                        <View style={styles.headerRightPlaceholder} />
                    </View>
                </View>

                <View style={[styles.calendarContainer, { borderColor: themeColors.border }]}>
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
                                {monthGridDates.map((d, i) => renderGridItem(d, i))}
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
                </View>

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
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <View style={[styles.emptyIconCircle, { backgroundColor: themeColors.surface }]}>
                                    <CalendarBlank size={48} color={themeColors.textSecondary} />
                                </View>
                                <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>No Upcoming Tasks</Text>
                            </View>
                        }
                    />
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        marginBottom: 8,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        height: 60,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        zIndex: 10,
    },
    backButtonCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        // No border
    },
    headerTitle: {
        fontSize: 18,
        textAlign: 'center',
        flex: 1,
    },
    headerRightPlaceholder: {
        width: 40,
    },
    calendarContainer: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingBottom: 8,
        overflow: 'hidden', // Add overflow hidden for animation clipping
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
        marginBottom: 12,
        justifyContent: 'space-between',
        // Should use full width items now
    },
    gridHeaderCheck: {
        width: SCREEN_WIDTH / 7, // Changed from (SCREEN_WIDTH - 32) / 7
        textAlign: 'center',
        fontSize: 11,
        textTransform: 'uppercase',
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    gridItem: {
        width: SCREEN_WIDTH / 7, // Changed from (SCREEN_WIDTH - 32) / 7
        height: 44,
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
});
