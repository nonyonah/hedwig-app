
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CaretLeft, Plus, X, CurrencyDollar, Calendar, User, FileText } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { useAuth } from '../../hooks/useAuth';

export default function CreateProjectScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { getAccessToken } = useAuth();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [clientName, setClientName] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [budget, setBudget] = useState('');
    const [deadline, setDeadline] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [date, setDate] = useState(new Date());

    // Milestones state
    const [milestones, setMilestones] = useState([{ title: 'Deposit', amount: '' }]);
    const [isLoading, setIsLoading] = useState(false);

    const addMilestone = () => {
        setMilestones([...milestones, { title: '', amount: '' }]);
    };

    const removeMilestone = (index: number) => {
        const newMilestones = [...milestones];
        newMilestones.splice(index, 1);
        setMilestones(newMilestones);
    };

    const updateMilestone = (index: number, field: string, value: string) => {
        const newMilestones = [...milestones];
        (newMilestones[index] as any)[field] = value;
        setMilestones(newMilestones);
    };

    const handleDateChange = (event: any, selectedDate?: Date) => {
        const currentDate = selectedDate || date;
        // On Android, the picker closes automatically. On iOS, we might want to keep it or close it.
        // For simplicity, we'll toggle off if it's Android or if user confirmed.
        console.log('Date changed:', selectedDate);
        // On Android, the picker closes automatically. On iOS, we might want to keep it or close it.
        // For simplicity, we'll toggle off if it's Android or if user confirmed.
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }
        if (selectedDate) {
            setDate(selectedDate);
            setDeadline(selectedDate.toISOString().split('T')[0]);
        }
    };

    const handleCreate = async () => {
        if (!title || !clientName || !clientEmail || !deadline || milestones.length === 0) {
            Alert.alert('Missing Fields', 'Please fill in the project title, client details, deadline, and at least one milestone.');
            return;
        }

        setIsLoading(true);

        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            // 1. Create Project
            const projectRes = await fetch(`${apiUrl}/api/projects`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description,
                    clientName,
                    clientEmail,
                    budget: parseFloat(budget || '0'),
                    currency: 'USD',
                    status: 'active',
                    startDate: new Date().toISOString().split('T')[0], // Default to today
                    deadline: deadline,
                    milestones: milestones // Pass milestones to be created with project
                })
            });
            const projectData = await projectRes.json();
            if (!projectData.success) throw new Error(projectData.error?.message || 'Failed to create project');

            const projectId = projectData.data.project.id;
            const clientId = projectData.data.project.clientId;
            const createdMilestones = projectData.data.milestones || []; // Get created milestones with IDs

            // 2. Create Contract (Auto-generated)
            const contractRes = await fetch(`${apiUrl}/api/documents`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'CONTRACT',
                    title: `${title} Contract`,
                    description: `Contract for project: ${title}`,
                    amount: milestones.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0),
                    clientName,
                    recipientEmail: clientEmail, // Auto-send enabled by backend logic
                    projectId,
                    items: milestones.map(m => ({ description: m.title, amount: parseFloat(m.amount) || 0 }))
                })
            });

            // 3. Create Invoices for Milestones
            // Use createdMilestones if available to link invoice to milestone record
            const milestonesProcess = createdMilestones.length > 0 ? createdMilestones : milestones;

            for (let i = 0; i < milestonesProcess.length; i++) {
                const milestone = milestonesProcess[i];
                // Handle both raw state (from create form) and DB object structure
                const mTitle = milestone.title;
                const mAmount = milestone.amount;
                const mId = milestone.id; // Only exists if returned from DB

                if (!mTitle || !mAmount) continue;

                await fetch(`${apiUrl}/api/documents/invoice`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: `Invoice: ${mTitle}`,
                        description: `Milestone for ${title}`,
                        amount: parseFloat(mAmount),
                        clientName,
                        recipientEmail: clientEmail, // Auto-send enabled
                        projectId,
                        items: [{ description: mTitle, amount: parseFloat(mAmount), milestone_id: mId }] // Pass milestone_id link if available
                    })
                });
            }

            Alert.alert('Success', 'Project created! Contract and invoices have been generated and sent.', [
                { text: 'OK', onPress: () => router.back() }
            ]);

        } catch (error: any) {
            console.error('Project creation error:', error);
            Alert.alert('Error', error.message || 'Failed to create project flow');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <CaretLeft size={24} color={themeColors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>New Project</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>

                    {/* Project Info */}
                    <Text style={styles.sectionTitle}>Project Details</Text>
                    <TextInput
                        placeholder="Project Title (e.g. Website Redesign)"
                        style={[styles.input, { color: themeColors.textPrimary, backgroundColor: themeColors.surface }]}
                        value={title}
                        onChangeText={setTitle}
                        placeholderTextColor={themeColors.textSecondary}
                    />
                    <TextInput
                        placeholder="Description"
                        style={[styles.input, { color: themeColors.textPrimary, backgroundColor: themeColors.surface, height: 80 }]}
                        multiline
                        value={description}
                        onChangeText={setDescription}
                        placeholderTextColor={themeColors.textSecondary}
                    />

                    {/* Client Info */}
                    <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Client</Text>
                    <TextInput
                        placeholder="Client Name"
                        style={[styles.input, { color: themeColors.textPrimary, backgroundColor: themeColors.surface }]}
                        value={clientName}
                        onChangeText={setClientName}
                        placeholderTextColor={themeColors.textSecondary}
                    />
                    <TextInput
                        placeholder="Client Email (for auto-sending)"
                        style={[styles.input, { color: themeColors.textPrimary, backgroundColor: themeColors.surface }]}
                        value={clientEmail}
                        onChangeText={setClientEmail} // Fixed typo
                        keyboardType="email-address"
                        autoCapitalize="none"
                        placeholderTextColor={themeColors.textSecondary}
                    />

                    <TouchableOpacity onPress={() => {
                        console.log('Opening date picker');
                        setShowDatePicker(true);
                    }}>
                        <View style={[styles.input, { color: themeColors.textPrimary, backgroundColor: themeColors.surface, justifyContent: 'center' }]}>
                            <Text style={{ color: deadline ? themeColors.textPrimary : themeColors.textSecondary, fontSize: 16 }}>
                                {deadline || "Deadline (YYYY-MM-DD)"}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    {showDatePicker && (
                        Platform.OS === 'ios' ? (
                            <Modal
                                transparent={true}
                                animationType="slide"
                                visible={showDatePicker}
                                onRequestClose={() => setShowDatePicker(false)}
                            >
                                <View style={styles.modalOverlay}>
                                    <View style={[styles.datePickerContainer, { backgroundColor: themeColors.surface }]}>
                                        <View style={styles.datePickerHeader}>
                                            <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                                <Text style={[styles.datePickerButton, { color: Colors.primary }]}>Done</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <DateTimePicker
                                            testID="dateTimePicker"
                                            value={date}
                                            mode="date"
                                            display="spinner"
                                            onChange={handleDateChange}
                                            textColor={themeColors.textPrimary}
                                            minimumDate={new Date()}
                                            style={{ height: 200, width: '100%' }}
                                        />
                                    </View>
                                </View>
                            </Modal>
                        ) : (
                            <DateTimePicker
                                testID="dateTimePicker"
                                value={date}
                                mode="date"
                                display="default"
                                onChange={handleDateChange}
                                minimumDate={new Date()}
                            />
                        )
                    )}

                    {/* Milestones */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                        <Text style={styles.sectionTitleWithoutMargin}>Milestones</Text>
                        <TouchableOpacity onPress={addMilestone} style={styles.addIndicesButton}>
                            <Plus size={16} color={Colors.primary} weight="bold" />
                            <Text style={styles.addIndicesText}>Add Milestone</Text>
                        </TouchableOpacity>
                    </View>

                    {milestones.map((milestone, index) => (
                        <View key={index} style={[styles.milestoneCard, { backgroundColor: themeColors.surface }]}>
                            <View style={styles.milestoneHeader}>
                                <Text style={[styles.milestoneIndex, { color: themeColors.textSecondary }]}>#{index + 1}</Text>
                                {milestones.length > 1 && (
                                    <TouchableOpacity onPress={() => removeMilestone(index)}>
                                        <X size={20} color={themeColors.textSecondary} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TextInput
                                placeholder="Milestone Title"
                                style={[styles.miniInput, { color: themeColors.textPrimary, borderBottomColor: themeColors.border }]}
                                value={milestone.title}
                                onChangeText={(text) => updateMilestone(index, 'title', text)}
                                placeholderTextColor={themeColors.textSecondary}
                            />
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TextInput
                                    placeholder="Amount ($)"
                                    style={[styles.miniInput, { flex: 1, color: themeColors.textPrimary, borderBottomColor: themeColors.border }]}
                                    value={milestone.amount}
                                    onChangeText={(text) => updateMilestone(index, 'amount', text)}
                                    keyboardType="numeric"
                                    placeholderTextColor={themeColors.textSecondary}
                                />
                            </View>
                        </View>
                    ))}

                    <View style={{ height: 100 }} />
                </ScrollView>

                <View style={[styles.footer, { backgroundColor: themeColors.background, borderTopColor: themeColors.border }]}>
                    <TouchableOpacity
                        style={[styles.createButton, { opacity: isLoading ? 0.7 : 1 }]}
                        onPress={handleCreate}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.createButtonText}>Create Project</Text>
                        )}
                    </TouchableOpacity>
                    <Text style={styles.helperText}>
                        This will be sent to the client together with a contract. The project commences when the client signs or approves the contract.
                    </Text>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerTitle: {
        ...Typography.h4,
        color: Colors.textPrimary,
    },
    content: {
        padding: 20,
    },
    sectionTitle: {
        ...Typography.subtitle,
        color: Colors.textSecondary,
        marginBottom: 12,
        textAlign: 'left', // Subtitle defaults to center
    },
    sectionTitleWithoutMargin: {
        ...Typography.subtitle,
        color: Colors.textSecondary,
        textAlign: 'left',
    },
    input: {
        ...Typography.input,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'transparent', // Can add focus state later
    },
    addIndicesButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary + '15',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 4,
    },
    addIndicesText: {
        ...Typography.bodyBold,
        fontSize: 14,
        color: Colors.primary,
    },
    milestoneCard: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    milestoneHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    milestoneIndex: {
        ...Typography.caption,
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    miniInput: {
        ...Typography.input,
        paddingVertical: 8,
        borderBottomWidth: 1,
        marginBottom: 8,
    },
    footer: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 40, // Increased for better spacing
        borderTopWidth: 1,
    },
    createButton: {
        backgroundColor: Colors.primary,
        borderRadius: 30, // Changed to pill shape
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    createButtonText: {
        ...Typography.button,
        color: '#FFFFFF',
    },
    helperText: {
        ...Typography.caption,
        textAlign: 'center',
        marginTop: 16,
        color: Colors.textSecondary,
        paddingHorizontal: 20,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    datePickerContainer: {
        width: '100%',
        paddingBottom: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    datePickerHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    datePickerButton: {
        fontSize: 16,
        fontWeight: '600',
    },
});
