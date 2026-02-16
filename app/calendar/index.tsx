import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, SectionList, Dimensions, FlatList, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { CaretLeft, CalendarBlank, Reference, Hash, ChatCircle, CalendarCheck, CaretRight, CaretDown, CaretUp, Plus } from 'phosphor-react-native';
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
}

interface Section {
    title: string;
    subtitle: string;
    isToday: boolean;
    dateISO: string;
    data: CalendarEvent[];
}

const SCREEN_WIDTH = Dimensions.get('window').width;

// Todoist-like colors
const EVENT_COLORS: Record<string, string> = {
    invoice_due: '#DC2626', // Red
    milestone_due: '#F59E0B', // Amber
    project_deadline: '#2563EB', // Blue
    reminder: '#6B7280', // Grey
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

// Sunday start
const generateMonthGrid = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun
    
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
    
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [expanded, setExpanded] = useState(false);
    
    const [viewDate, setViewDate] = useState(new Date()); 

    const flatListRef = useRef<FlatList>(null);
    const sectionListRef = useRef<SectionList>(null);

    useFocusEffect(
        useCallback(() => {
            fetchEvents();
        }, [])
    );

    useEffect(() => {
        if (!expanded && flatListRef.current && !isLoading) {
            const index = scrollableDates.findIndex(d => isSameDay(d, selectedDate));
            if (index !== -1) {
                setTimeout(() => {
                     flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
                }, 500);
            }
        }
    }, [isLoading, expanded]);

    const scrollableDates = useMemo(() => {
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return generateDateRange(start, 120);
    }, []);

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

    // Group ALL events by date + Include next 14 days even if empty
    const sections: Section[] = useMemo(() => {
        const grouped: Record<string, CalendarEvent[]> = {};

        // 1. Group existing events
        events.forEach(event => {
            const date = new Date(event.eventDate);
            const key = date.toISOString().split('T')[0];
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(event);
        });

        // 2. Ensure next 14 days exist
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
            now.setHours(0,0,0,0);
            const checkDate = new Date(properDate);
            checkDate.setHours(0,0,0,0);
            
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
             sectionListRef.current.scrollToLocation({
                 sectionIndex: index,
                 itemIndex: 0,
                 animated: true,
                 viewOffset: 100 
             });
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

    const handleMonthChange = (direction: 'prev' | 'next') => {
        const newDate = new Date(viewDate);
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        setViewDate(newDate);
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

    const handleDelete = async (eventId: string) => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert(
            'Delete Event',
            'Are you sure you want to delete this calendar event?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                            const response = await fetch(`${apiUrl}/api/calendar/${eventId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });
                             const data = await response.json();
                             if (data.success) {
                                 setEvents(prev => prev.filter(e => e.id !== eventId));
                             } else {
                                 Alert.alert('Error', 'Failed to delete');
                             }
                        } catch(e) { Alert.alert('Error', 'Failed'); }
                    }
                },
            ]
        );
    };

    const getEventColor = (eventType: string) => EVENT_COLORS[eventType] || '#8B5CF6';
    
    const renderEvent = ({ item }: { item: CalendarEvent }) => {
        const time = new Date(item.eventDate).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        const color = getEventColor(item.eventType);

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.eventRow, { borderBottomColor: themeColors.border }]}
                onLongPress={() => handleDelete(item.id)}
            >
                <View style={[styles.checkboxCircle, { borderColor: color }]} />
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
                             {item.eventType.replace('_', ' ')}
                        </Text>
                    </View>
                </View>
                <View style={styles.eventRight}>
                    <Text style={[styles.inboxLabel, { color: themeColors.textSecondary, fontFamily: 'GoogleSansFlex_400Regular' }]}>Inbox</Text>
                    <CalendarCheck size={14} color={themeColors.textSecondary} />
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
            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />
        </View>
    );

    return (
        <View style={{ flex: 1 }}>
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <View style={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}>
                                <CaretLeft size={24} color={themeColors.textPrimary} weight="bold" />
                            </View>
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: themeColors.textPrimary, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>Upcoming</Text>
                        <TouchableOpacity style={styles.headerAction}>
                             <View style={styles.headerDots}>
                                 <View style={[styles.dot, {backgroundColor: Colors.primary}]} />
                                 <View style={[styles.dot, {backgroundColor: Colors.primary}]} />
                                 <View style={[styles.dot, {backgroundColor: Colors.primary}]} />
                             </View>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={[styles.calendarContainer, { backgroundColor: themeColors.background }]}>
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
                            weight="bold" 
                            style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
                        />
                    </TouchableOpacity>

                   {expanded ? (
                        <View style={styles.monthView}>
                            <View style={styles.gridHeaderRow}>
                                {['S','M','T','W','T','F','S'].map((day, i) => (
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
                       />
                   )}
                </View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : (
                    <SectionList
                        ref={sectionListRef}
                        sections={sections}
                        renderItem={renderEvent}
                        renderSectionHeader={renderSectionHeader}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <View style={[styles.emptyIconCircle, { backgroundColor: themeColors.surface }]}>
                                    <CalendarBlank size={48} color={themeColors.textSecondary} weight="duotone" />
                                </View>
                                <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>No Upcoming Tasks</Text>
                                <Text style={[styles.emptyStateText, { color: themeColors.textSecondary, fontFamily: 'GoogleSansFlex_500Medium' }]}>
                                    All caught up!
                                </Text>
                            </View>
                        }
                    />
                )}
                
                <TouchableOpacity style={[styles.fab, { backgroundColor: Colors.primary }]}>
                    <Plus size={24} color="#FFFFFF" weight="bold" />
                </TouchableOpacity>
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
        display: 'none',
    },
    headerTitle: {
        fontSize: 18,
        textAlign: 'center',
        flex: 1,
    },
    headerRightPlaceholder: {
        width: 40,
    },
    headerAction: {
         width: 40,
         alignItems: 'flex-end',
         justifyContent: 'center',
    },
    headerDots: {
        flexDirection: 'row',
        gap: 3,
    },
    dot: {
        width: 4, 
        height: 4, 
        borderRadius: 2,
    },
    calendarContainer: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: '#E5E7EB',
        paddingBottom: 8,
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
        paddingHorizontal: 16,
    },
    gridHeaderRow: {
        flexDirection: 'row',
        marginBottom: 12,
        justifyContent: 'space-between',
    },
    gridHeaderCheck: {
        width: (SCREEN_WIDTH - 32) / 7,
        textAlign: 'center',
        fontSize: 11,
        textTransform: 'uppercase',
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    gridItem: {
        width: (SCREEN_WIDTH - 32) / 7,
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
    divider: {
        display: 'none',
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
    eventRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    inboxLabel: {
        fontSize: 12,
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 6,
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
    emptyStateText: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
    },
});
