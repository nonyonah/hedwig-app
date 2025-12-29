import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Animated, RefreshControl, Platform, ScrollView, Alert, LayoutAnimation, UIManager, Image } from 'react-native';
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';
import { Briefcase, List, Calendar, User, CurrencyDollar, CheckCircle, Clock, Receipt, CaretRight, X, DotsThree, Trash, Check } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Milestone {
    id: string;
    title: string;
    amount: number;
    dueDate?: string;
    status: 'pending' | 'invoiced' | 'paid';
    invoiceId?: string;
}

interface Project {
    id: string;
    clientId: string;
    client: { id: string; name: string; email?: string; company?: string };
    title: string;
    description?: string;
    status: string;
    budget?: number;
    currency: string;
    startDate?: string;
    deadline?: string;
    createdAt: string;
    milestones: Milestone[];
    progress: {
        totalMilestones: number;
        completedMilestones: number;
        percentage: number;
        totalAmount: number;
        paidAmount: number;
    };
}

type StatusFilter = 'all' | 'ongoing' | 'completed' | 'paid';

export default function ProjectsScreen() {
    const router = useRouter();
    const { getAccessToken, user } = usePrivy();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [completingMilestone, setCompletingMilestone] = useState<string | null>(null);

    // Sidebar state
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });

    // Profile modal state
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [profileIcon, setProfileIcon] = useState<{ type: 'gradient' | 'emoji' | 'image'; colorIndex?: number; emoji?: string; imageUri?: string }>({ type: 'gradient', colorIndex: 0 });
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string; bitcoin?: string }>({});

    // Profile color gradient options
    const PROFILE_COLOR_OPTIONS: [string, string][] = [
        ['#3B82F6', '#8B5CF6'],
        ['#10B981', '#3B82F6'],
        ['#F59E0B', '#EF4444'],
        ['#EC4899', '#8B5CF6'],
        ['#14B8A6', '#22D3EE'],
    ];

    const slideAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        fetchProjects();
    }, [user]);

    useEffect(() => {
        const fetchUserData = async () => {
            if (!user) return;
            try {
                const token = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                const profileResponse = await fetch(`${apiUrl}/api/users/profile`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const profileData = await profileResponse.json();

                if (profileData.success && profileData.data) {
                    const userData = profileData.data.user || profileData.data;
                    setUserName({
                        firstName: userData.firstName || userData.displayName?.split(' ')[0] || '',
                        lastName: userData.lastName || userData.displayName?.split(' ').slice(1).join(' ') || ''
                    });

                    // Set profile icon
                    if (userData.avatar) {
                        try {
                            if (userData.avatar.trim().startsWith('{')) {
                                const parsed = JSON.parse(userData.avatar);
                                setProfileIcon(parsed);
                            } else {
                                setProfileIcon({ type: 'image', imageUri: userData.avatar });
                            }
                        } catch (e) {
                            setProfileIcon({ type: 'image', imageUri: userData.avatar });
                        }
                    } else if (userData.profileEmoji) {
                        setProfileIcon({ type: 'emoji', emoji: userData.profileEmoji });
                    } else if (userData.profileColorIndex !== undefined) {
                        setProfileIcon({ type: 'gradient', colorIndex: userData.profileColorIndex });
                    }

                    // Set wallet addresses
                    setWalletAddresses({
                        evm: userData.ethereumWalletAddress || userData.baseWalletAddress || userData.celoWalletAddress,
                        solana: userData.solanaWalletAddress
                    });
                }

                const conversationsResponse = await fetch(`${apiUrl}/api/chat/conversations`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (conversationsResponse.ok) {
                    const conversationsData = await conversationsResponse.json();
                    if (conversationsData.success && conversationsData.data) {
                        setConversations(conversationsData.data.slice(0, 10));
                    }
                }
            } catch (error) {
                console.error('Failed to fetch user data:', error);
            }
        };
        fetchUserData();
    }, [user]);

    const fetchProjects = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/projects`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                setProjects(data.data.projects || []);
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchProjects();
    };

    const openDetailModal = async (project: Project) => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedProject(project);
        setShowDetailModal(true);
        Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
    };

    const closeDetailModal = () => {
        setShowActionMenu(false);
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
            setShowDetailModal(false);
            setSelectedProject(null);
        });
    };

    const handleDeleteProject = async () => {
        if (!selectedProject) return;
        setShowActionMenu(false);

        Alert.alert(
            'Delete Project',
            'Are you sure you want to delete this project? This will also delete all milestones. This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                            const response = await fetch(`${apiUrl}/api/projects/${selectedProject.id}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });
                            const data = await response.json();
                            if (data.success) {
                                setProjects(prev => prev.filter(p => p.id !== selectedProject.id));
                                closeDetailModal();
                                Alert.alert('Success', 'Project deleted successfully');
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to delete project');
                            }
                        } catch (error) {
                            console.error('Failed to delete project:', error);
                            Alert.alert('Error', 'Failed to delete project');
                        }
                    }
                },
            ]
        );
    };

    const handleCompleteProject = async () => {
        if (!selectedProject) return;
        setShowActionMenu(false);

        const pendingMilestones = (selectedProject.milestones || []).filter(m => m.status === 'pending');
        if (pendingMilestones.length === 0) {
            Alert.alert('No Pending Milestones', 'All milestones have already been processed.');
            return;
        }

        Alert.alert(
            'Complete Project',
            `This will mark the project as completed and generate invoices for ${pendingMilestones.length} pending milestone(s). Continue?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Complete & Invoice',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            // Generate invoices for all pending milestones
                            for (const milestone of pendingMilestones) {
                                await fetch(`${apiUrl}/api/milestones/${milestone.id}/invoice`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ network: 'base', token: 'USDC' })
                                });
                            }

                            // Mark project as completed
                            await fetch(`${apiUrl}/api/projects/${selectedProject.id}`, {
                                method: 'PUT',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ status: 'COMPLETED' })
                            });

                            fetchProjects();
                            closeDetailModal();
                            Alert.alert('Success', `Project completed! ${pendingMilestones.length} invoice(s) generated.`);
                        } catch (error) {
                            console.error('Failed to complete project:', error);
                            Alert.alert('Error', 'Failed to complete project');
                        }
                    }
                },
            ]
        );
    };

    const handleCompleteMilestone = async (milestone: Milestone) => {
        if (milestone.status !== 'pending') {
            Alert.alert('Already Processed', `This milestone is already ${milestone.status}.`);
            return;
        }

        setCompletingMilestone(milestone.id);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/milestones/${milestone.id}/invoice`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ network: 'base', token: 'USDC' })
            });

            const data = await response.json();
            if (data.success) {
                // Refresh projects to get updated milestone status
                await fetchProjects();
                // Update selected project
                if (selectedProject) {
                    const updatedProject = projects.find(p => p.id === selectedProject.id);
                    if (updatedProject) setSelectedProject(updatedProject);
                }
                Alert.alert('Success', `Invoice generated for "${milestone.title}"`);
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to generate invoice');
            }
        } catch (error) {
            console.error('Failed to complete milestone:', error);
            Alert.alert('Error', 'Failed to generate invoice');
        } finally {
            setCompletingMilestone(null);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'ongoing': case 'active': return '#10B981';
            case 'completed': return '#3B82F6';
            case 'paid': return '#8B5CF6';
            case 'on_hold': return '#F59E0B';
            case 'cancelled': return '#EF4444';
            default: return Colors.textSecondary;
        }
    };

    const getMilestoneStatusIcon = (status: string) => {
        switch (status) {
            case 'paid': return <CheckCircle size={18} color="#10B981" weight="fill" />;
            case 'invoiced': return <Receipt size={18} color="#3B82F6" weight="fill" />;
            default: return <Clock size={18} color={Colors.textSecondary} />;
        }
    };

    const filteredProjects = projects.filter(project => {
        if (statusFilter === 'all') return true;
        return project.status.toLowerCase() === statusFilter;
    });

    const renderProjectItem = ({ item }: { item: Project }) => {
        const progress = item.progress;
        const isCompleted = ['completed', 'paid'].includes(item.status.toLowerCase()) || progress.percentage === 100;

        return (
            <TouchableOpacity style={styles.projectItem} onPress={() => openDetailModal(item)} activeOpacity={0.7}>
                <View style={styles.projectItemContent}>
                    {/* Left content */}
                    <View style={styles.projectItemLeft}>
                        <Text style={styles.projectItemClient}>{item.client?.name || 'No client'}</Text>
                        <Text style={styles.projectItemTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.projectItemMeta}>
                            ${progress.totalAmount.toLocaleString()} · {progress.completedMilestones}/{progress.totalMilestones} milestones
                        </Text>
                    </View>
                    {/* Right - Progress circle */}
                    <View style={[styles.projectIconCircle, isCompleted && styles.projectIconCircleCompleted]}>
                        <Text style={[styles.projectIconText, isCompleted && styles.projectIconTextCompleted]}>
                            {progress.percentage}%
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const sidebarElement = (
        <Sidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            conversations={conversations}
            userName={userName}
        />
    );

    if (isLoading) {
        return (
            <>
                {sidebarElement}
                <SafeAreaView style={styles.container} edges={['top']}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                        <Text style={styles.loadingText}>Loading projects...</Text>
                    </View>
                </SafeAreaView>
            </>
        );
    }

    return (
        <>
            {sidebarElement}
            <SafeAreaView style={styles.container} edges={['top']}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setIsSidebarOpen(true); }}>
                        <List size={24} color={Colors.textPrimary} weight="bold" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Projects</Text>
                    <TouchableOpacity onPress={() => setShowProfileModal(true)}>
                        {profileIcon.imageUri ? (
                            <Image source={{ uri: profileIcon.imageUri }} style={styles.profileIcon} />
                        ) : profileIcon.emoji ? (
                            <View style={[styles.profileIcon, { backgroundColor: PROFILE_COLOR_OPTIONS[profileIcon.colorIndex || 0][1], justifyContent: 'center', alignItems: 'center' }]}>
                                <Text style={{ fontSize: 16 }}>{profileIcon.emoji}</Text>
                            </View>
                        ) : (
                            <LinearGradient
                                colors={PROFILE_COLOR_OPTIONS[profileIcon.colorIndex || 0]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.profileIcon}
                            />
                        )}
                    </TouchableOpacity>
                </View>

                {/* Filter Chips */}
                <View style={styles.filterContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
                        {(['all', 'ongoing', 'completed', 'paid'] as StatusFilter[]).map(filter => (
                            <TouchableOpacity
                                key={filter}
                                style={[styles.filterChip, statusFilter === filter && styles.filterChipActive]}
                                onPress={() => { Haptics.selectionAsync(); setStatusFilter(filter); }}
                            >
                                <Text style={[styles.filterText, statusFilter === filter && styles.filterTextActive]}>
                                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Project List */}
                {filteredProjects.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Briefcase size={64} color={Colors.textSecondary} weight="light" />
                        <Text style={styles.emptyTitle}>No Projects Yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Projects help you track milestones and invoices for client work.
                        </Text>
                        <View style={styles.examplesContainer}>
                            <Text style={styles.exampleLabel}>Try saying:</Text>
                            <Text style={styles.exampleText}>"Create a project for [client] called [name]"</Text>
                            <Text style={styles.exampleText}>"Start a new project for Acme Corp"</Text>
                        </View>
                    </View>
                ) : (
                    <FlatList
                        data={filteredProjects}
                        keyExtractor={(item) => item.id}
                        renderItem={renderProjectItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                        }
                    />
                )}

                {/* Detail Modal */}
                <Modal visible={showDetailModal} transparent animationType="fade" onRequestClose={closeDetailModal}>
                    <View style={styles.modalOverlay}>
                        {Platform.OS === 'ios' ? (
                            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                        ) : (
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />
                        )}
                        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeDetailModal} />
                        <Animated.View
                            style={[
                                styles.detailModalContent,
                                { transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }] }
                            ]}
                        >
                            {/* Modal Header Row with X and Options */}
                            {selectedProject && (
                                <>
                                    <View style={styles.modalHeaderRow}>
                                        <View style={styles.modalHeaderLeft}>
                                            <Text style={styles.modalHeaderTitle} numberOfLines={1}>{selectedProject.title}</Text>
                                        </View>
                                        <View style={styles.modalHeaderRight}>
                                            <TouchableOpacity
                                                style={styles.menuButton}
                                                onPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    LayoutAnimation.configureNext(LayoutAnimation.create(
                                                        200,
                                                        LayoutAnimation.Types.easeInEaseOut,
                                                        LayoutAnimation.Properties.opacity
                                                    ));
                                                    setShowActionMenu(!showActionMenu);
                                                }}
                                            >
                                                <DotsThree size={24} color={Colors.textSecondary} weight="bold" />
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.closeButton} onPress={closeDetailModal}>
                                                <X size={20} color="#666666" weight="bold" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {/* Action Menu Dropdown */}
                                    {showActionMenu && (
                                        <>
                                            <TouchableOpacity
                                                style={styles.menuBackdrop}
                                                activeOpacity={1}
                                                onPress={() => {
                                                    LayoutAnimation.configureNext(LayoutAnimation.create(
                                                        150,
                                                        LayoutAnimation.Types.easeInEaseOut,
                                                        LayoutAnimation.Properties.opacity
                                                    ));
                                                    setShowActionMenu(false);
                                                }}
                                            />
                                            <View style={styles.pullDownMenu}>
                                                <TouchableOpacity style={styles.pullDownMenuItem} onPress={handleCompleteProject}>
                                                    <CheckCircle size={18} color={Colors.success} weight="fill" />
                                                    <Text style={styles.pullDownMenuText}>Complete Project</Text>
                                                </TouchableOpacity>
                                                <View style={styles.pullDownMenuDivider} />
                                                <TouchableOpacity style={styles.pullDownMenuItem} onPress={handleDeleteProject}>
                                                    <Trash size={18} color="#EF4444" weight="fill" />
                                                    <Text style={[styles.pullDownMenuText, { color: '#EF4444' }]}>Delete Project</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </>
                                    )}
                                </>
                            )}

                            {selectedProject && (
                                <ScrollView showsVerticalScrollIndicator={false} style={styles.detailModalBody} contentContainerStyle={{ paddingBottom: 32 }}>
                                    {/* Status Badge */}
                                    <View style={styles.modalHeader}>
                                        <View style={[styles.statusBadgeNew, { backgroundColor: getStatusColor(selectedProject.status) + '15' }]}>
                                            <Text style={[styles.statusTextNew, { color: getStatusColor(selectedProject.status) }]}>
                                                {selectedProject.status.charAt(0).toUpperCase() + selectedProject.status.slice(1)}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Client Info */}
                                    <View style={styles.clientInfoRow}>
                                        <User size={16} color={Colors.textSecondary} />
                                        <Text style={styles.clientInfoText}>{selectedProject.client?.name}</Text>
                                        {selectedProject.startDate && (
                                            <Text style={styles.clientInfoDate}>Started {new Date(selectedProject.startDate).toLocaleDateString()}</Text>
                                        )}
                                    </View>

                                    {/* Circular Progress */}
                                    {(() => {
                                        const size = 160;
                                        const strokeWidth = 10;
                                        const radius = (size - strokeWidth) / 2;
                                        const circumference = radius * 2 * Math.PI;
                                        const progress = selectedProject.progress.percentage / 100;
                                        const strokeDashoffset = circumference - (progress * circumference);

                                        return (
                                            <View style={styles.circularProgressContainer}>
                                                <View style={{ width: size, height: size, position: 'relative' }}>
                                                    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
                                                        {/* Background circle */}
                                                        <Circle
                                                            cx={size / 2}
                                                            cy={size / 2}
                                                            r={radius}
                                                            stroke="#E5E7EB"
                                                            strokeWidth={strokeWidth}
                                                            fill="transparent"
                                                        />
                                                        {/* Progress circle */}
                                                        <Circle
                                                            cx={size / 2}
                                                            cy={size / 2}
                                                            r={radius}
                                                            stroke={Colors.primary}
                                                            strokeWidth={strokeWidth}
                                                            fill="transparent"
                                                            strokeLinecap="round"
                                                            strokeDasharray={circumference}
                                                            strokeDashoffset={strokeDashoffset}
                                                        />
                                                    </Svg>
                                                    {/* Center text */}
                                                    <View style={styles.circularProgressCenter}>
                                                        <Text style={styles.circularProgressPercent}>{selectedProject.progress.percentage}%</Text>
                                                        <Text style={styles.circularProgressLabel}>
                                                            {(['completed', 'paid'].includes(selectedProject.status.toLowerCase()) || selectedProject.progress.percentage === 100) ? 'Completed' : 'Ongoing'}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        );
                                    })()}

                                    {/* Info Rows */}
                                    <View style={styles.infoSection}>
                                        <View style={styles.infoRow}>
                                            <Text style={styles.infoLabel}>Total Budget</Text>
                                            <Text style={styles.infoValue}>${selectedProject.progress.totalAmount.toLocaleString()}</Text>
                                        </View>
                                        <View style={styles.infoRowDivider} />

                                        <View style={styles.infoRow}>
                                            <Text style={styles.infoLabel}>Amount Paid</Text>
                                            <Text style={styles.infoValueHighlight}>${selectedProject.progress.paidAmount.toLocaleString()}</Text>
                                        </View>
                                        <View style={styles.infoRowDivider} />

                                        <View style={styles.infoRow}>
                                            <Text style={styles.infoLabel}>Amount Pending</Text>
                                            <Text style={styles.infoValue}>${(selectedProject.progress.totalAmount - selectedProject.progress.paidAmount).toLocaleString()}</Text>
                                        </View>
                                        <View style={styles.infoRowDivider} />

                                        <View style={styles.infoRow}>
                                            <Text style={styles.infoLabel}>Milestones Completed</Text>
                                            <Text style={styles.infoValue}>{selectedProject.progress.completedMilestones} / {selectedProject.progress.totalMilestones}</Text>
                                        </View>
                                    </View>

                                    {selectedProject.deadline && (
                                        <View style={styles.deadlineNote}>
                                            <Calendar size={16} color={Colors.warning} />
                                            <Text style={styles.deadlineTextHighlight}>
                                                Deadline: {new Date(selectedProject.deadline).toLocaleDateString()}
                                            </Text>
                                        </View>
                                    )}

                                    {/* Milestones Section */}
                                    <View style={styles.milestonesSection}>
                                        <View style={styles.milestonesHeaderRow}>
                                            <Text style={styles.milestonesTitle}>Milestones</Text>
                                            <Text style={styles.milestonesCount}>{selectedProject.milestones?.length || 0}</Text>
                                        </View>

                                        {(selectedProject.milestones?.length ?? 0) === 0 ? (
                                            <View style={styles.noMilestonesContainer}>
                                                <Text style={styles.noMilestones}>No milestones yet</Text>
                                                <Text style={styles.noMilestonesHint}>Ask Hedwig to add one!</Text>
                                            </View>
                                        ) : (
                                            (selectedProject.milestones || []).map((milestone, index) => (
                                                <View key={milestone.id} style={[styles.milestoneCard, index === (selectedProject.milestones?.length ?? 0) - 1 && { marginBottom: 0 }]}>
                                                    <View style={styles.milestoneCardHeader}>
                                                        <View style={styles.milestoneCardLeft}>
                                                            {getMilestoneStatusIcon(milestone.status)}
                                                            <Text style={styles.milestoneCardTitle}>{milestone.title}</Text>
                                                        </View>
                                                        <Text style={styles.milestoneCardAmount}>${milestone.amount.toLocaleString()}</Text>
                                                    </View>
                                                    <View style={styles.milestoneCardFooter}>
                                                        <View style={[styles.statusBadge,
                                                        milestone.status === 'paid' && styles.statusPaid,
                                                        milestone.status === 'invoiced' && styles.statusInvoiced,
                                                        milestone.status === 'pending' && styles.statusPending,
                                                        ]}>
                                                            <Text style={[styles.statusText,
                                                            milestone.status === 'paid' && styles.statusTextPaid,
                                                            milestone.status === 'invoiced' && styles.statusTextInvoiced,
                                                            milestone.status === 'pending' && styles.statusTextPending,
                                                            ]}>
                                                                {milestone.status.charAt(0).toUpperCase() + milestone.status.slice(1)}
                                                            </Text>
                                                        </View>
                                                        {milestone.dueDate && (
                                                            <Text style={styles.milestoneCardDate}>Due {new Date(milestone.dueDate).toLocaleDateString()}</Text>
                                                        )}
                                                        {milestone.status === 'pending' && (
                                                            <TouchableOpacity
                                                                style={styles.completeButton}
                                                                onPress={() => handleCompleteMilestone(milestone)}
                                                                disabled={completingMilestone === milestone.id}
                                                            >
                                                                {completingMilestone === milestone.id ? (
                                                                    <ActivityIndicator size="small" color={Colors.primary} />
                                                                ) : (
                                                                    <>
                                                                        <Check size={14} color={Colors.primary} weight="bold" />
                                                                        <Text style={styles.completeButtonText}>Invoice</Text>
                                                                    </>
                                                                )}
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                </View>
                                            ))
                                        )}
                                    </View>
                                </ScrollView>
                            )}
                        </Animated.View>
                    </View>
                </Modal>

                {/* Profile Modal */}
                <ProfileModal
                    visible={showProfileModal}
                    onClose={() => setShowProfileModal(false)}
                    userName={userName}
                    walletAddresses={walletAddresses}
                />
            </SafeAreaView >
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: Colors.background,
        height: 60,
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.primary,
    },
    headerTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 22,
        color: Colors.textPrimary,
    },
    filterContainer: {
        marginBottom: 16,
    },
    filterContent: {
        paddingHorizontal: 20,
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
    },
    filterChipActive: {
        backgroundColor: Colors.primary,
    },
    filterText: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    filterTextActive: {
        color: '#FFFFFF',
    },
    listContent: {
        padding: 16,
        gap: 12,
    },
    // Project list item styles (simpler design like reference)
    projectItem: {
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E5E7EB',
    },
    projectItemContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    projectItemLeft: {
        flex: 1,
        marginRight: 16,
    },
    projectItemClient: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    projectItemTitle: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    projectItemMeta: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textTertiary,
    },
    projectIconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#EEF2FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    projectIconCircleCompleted: {
        backgroundColor: '#DCFCE7',
    },
    projectIconText: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 12,
        color: Colors.primary,
    },
    projectIconTextCompleted: {
        color: '#16A34A',
    },
    // Keep status badge styles for modal
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    statusPaid: {
        backgroundColor: '#DCFCE7',
    },
    statusOngoing: {
        backgroundColor: '#FEF3C7',
    },
    statusText: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 12,
    },
    statusTextPaid: {
        color: '#16A34A',
    },
    statusTextOngoing: {
        color: '#D97706',
    },
    clientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    clientName: {
        ...Typography.body,
        fontSize: 14,
        color: Colors.textSecondary,
    },
    progressSection: {
        marginBottom: 12,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    progressLabel: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    progressPercent: {
        ...Typography.caption,
        color: Colors.primary,
        fontWeight: '600',
    },
    progressBarBg: {
        height: 6,
        backgroundColor: Colors.surface,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: Colors.primary,
        borderRadius: 3,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    amountText: {
        ...Typography.body,
        fontSize: 14,
        color: Colors.textSecondary,
    },
    deadlineContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    deadlineText: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyTitle: {
        ...Typography.h3,
        color: Colors.textPrimary,
        marginTop: 16,
    },
    emptySubtitle: {
        ...Typography.body,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
    },
    examplesContainer: {
        marginTop: 24,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    exampleLabel: {
        ...Typography.bodyBold,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    exampleText: {
        ...Typography.body,
        color: Colors.primary,
        fontStyle: 'italic',
        marginVertical: 4,
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    detailModalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        maxHeight: '85%',
        paddingTop: 12,
    },
    detailModalBody: {
        paddingHorizontal: 24,
    },
    detailModalTitle: {
        ...Typography.h2,
        fontSize: 24,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    detailClientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    detailClientName: {
        ...Typography.body,
        color: Colors.textSecondary,
        marginLeft: 6,
    },
    detailDescription: {
        ...Typography.body,
        color: Colors.textSecondary,
        marginBottom: 20,
    },
    progressCard: {
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
    },
    progressCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    progressCardTitle: {
        ...Typography.bodyBold,
        color: Colors.textPrimary,
    },
    progressCardPercent: {
        ...Typography.h3,
        color: Colors.primary,
    },
    progressBarBgLarge: {
        height: 10,
        backgroundColor: '#E5E7EB',
        borderRadius: 5,
        overflow: 'hidden',
        marginBottom: 16,
    },
    progressBarFillLarge: {
        height: '100%',
        backgroundColor: Colors.primary,
        borderRadius: 5,
    },
    progressCardStats: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressStat: {
        alignItems: 'center',
        flex: 1,
    },
    progressStatValue: {
        ...Typography.h3,
        color: Colors.textPrimary,
    },
    progressStatLabel: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    progressStatDivider: {
        width: 1,
        height: 30,
        backgroundColor: Colors.border,
    },
    milestonesHeader: {
        ...Typography.bodyBold,
        fontSize: 16,
        color: Colors.textPrimary,
        marginBottom: 12,
    },
    noMilestones: {
        ...Typography.body,
        color: Colors.textSecondary,
        fontStyle: 'italic',
    },
    milestoneItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    milestoneLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    milestoneInfo: {
        marginLeft: 12,
    },
    milestoneTitle: {
        ...Typography.body,
        color: Colors.textPrimary,
        fontWeight: '500',
    },
    milestoneStatus: {
        ...Typography.caption,
        color: Colors.textSecondary,
        textTransform: 'capitalize',
    },
    milestoneRight: {
        alignItems: 'flex-end',
    },
    milestoneAmount: {
        ...Typography.bodyBold,
        color: Colors.textPrimary,
    },
    milestoneDue: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    // New redesigned modal styles
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    modalHeaderTitle: {
        ...Typography.h2,
        color: Colors.textPrimary,
        fontSize: 24,
        flex: 1,
    },
    statusBadgeNew: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusTextNew: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 13,
    },
    clientInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24,
    },
    clientInfoText: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    clientInfoDate: {
        ...Typography.caption,
        color: Colors.textTertiary,
        marginLeft: 'auto',
    },
    circularProgressContainer: {
        alignItems: 'center',
        paddingVertical: 24,
        marginBottom: 16,
    },
    circularProgressCenter: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    circularProgressPercent: {
        fontSize: 42,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    circularProgressLabel: {
        ...Typography.caption,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    progressDot: {
        position: 'absolute',
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: Colors.primary,
    },
    infoSection: {
        backgroundColor: '#FAFAFA',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    infoRowDivider: {
        height: 1,
        backgroundColor: '#E5E7EB',
    },
    infoLabel: {
        ...Typography.body,
        color: Colors.textPrimary,
    },
    infoValue: {
        ...Typography.body,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    infoValueHighlight: {
        ...Typography.bodyBold,
        color: Colors.success,
    },
    deadlineNote: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: Colors.warning + '15',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        marginBottom: 24,
    },
    deadlineTextHighlight: {
        ...Typography.body,
        color: Colors.warning,
        fontWeight: '500',
    },
    milestonesSection: {
        marginTop: 8,
    },
    milestonesHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    milestonesTitle: {
        ...Typography.h3,
        color: Colors.textPrimary,
        fontSize: 18,
    },
    milestonesCount: {
        ...Typography.caption,
        color: Colors.textSecondary,
        backgroundColor: '#E5E7EB',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    noMilestonesContainer: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    noMilestonesHint: {
        ...Typography.caption,
        color: Colors.textTertiary,
        marginTop: 4,
    },
    milestoneCard: {
        backgroundColor: '#FAFAFA',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    milestoneCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    milestoneCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    milestoneCardTitle: {
        ...Typography.body,
        color: Colors.textPrimary,
        fontWeight: '600',
        flex: 1,
    },
    milestoneCardAmount: {
        ...Typography.bodyBold,
        color: Colors.textPrimary,
        fontSize: 16,
    },
    milestoneCardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    milestoneStatusPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    milestoneStatusPaid: {
        backgroundColor: Colors.success + '20',
    },
    milestoneStatusInvoiced: {
        backgroundColor: Colors.warning + '20',
    },
    milestoneStatusPending: {
        backgroundColor: Colors.textSecondary + '20',
    },
    milestoneStatusPillText: {
        fontSize: 12,
        fontWeight: '600',
    },
    milestoneStatusPaidText: {
        color: Colors.success,
    },
    milestoneStatusInvoicedText: {
        color: Colors.warning,
    },
    milestoneStatusPendingText: {
        color: Colors.textSecondary,
    },
    milestoneCardDate: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    // New modal header and menu styles - matching payment-links modal
    modalHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
        paddingHorizontal: 24,
    },
    modalHeaderLeft: {
        flex: 1,
        marginRight: 16,
    },
    modalHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    menuButton: {
        padding: 4,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        zIndex: 999,
    },
    pullDownMenu: {
        position: 'absolute',
        top: 70,
        right: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderRadius: 14,
        paddingVertical: 6,
        minWidth: 180,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
        zIndex: 1000,
    },
    pullDownMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 10,
    },
    pullDownMenuText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    pullDownMenuDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        marginHorizontal: 0,
    },
    // Milestone status styles
    statusInvoiced: {
        backgroundColor: '#FEF3C7',
    },
    statusPending: {
        backgroundColor: Colors.textSecondary + '20',
    },
    statusTextInvoiced: {
        color: '#D97706',
    },
    statusTextPending: {
        color: Colors.textSecondary,
    },
    // Complete button for milestones
    completeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.primary,
        backgroundColor: Colors.primary + '10',
    },
    completeButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.primary,
    },
});
