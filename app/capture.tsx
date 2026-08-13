import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';

import { useThemeColors } from '../theme/colors';
import { joinApiUrl } from '../utils/apiBaseUrl';
import IOSGlassIconButton from '../components/ui/IOSGlassIconButton';
import { ChevronLeft, ScanLine, Pencil, X, Receipt as ReceiptIcon } from '../components/ui/AppIcon';
import OCRScanner, { ImportAnalysis } from '../components/OCRScanner';

const CATEGORIES = [
    'software', 'travel', 'meals', 'office', 'marketing', 'operations',
    'subscriptions', 'transportation', 'rent',
] as const;

const DEFAULT_CATEGORY = 'other';

const CATEGORY_LABELS: Record<string, string> = {
    software: 'Software',
    travel: 'Travel',
    meals: 'Meals',
    office: 'Office',
    marketing: 'Marketing',
    operations: 'Operations',
    subscriptions: 'Subscriptions',
    transportation: 'Transportation',
    rent: 'Rent',
    other: 'Other',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
    receipt: 'Receipt',
    invoice: 'Invoice',
    bank_statement: 'Bank statement',
    contract: 'Contract',
    other: 'Document',
};

function currencySymbol(code?: string): string {
    switch ((code || 'USD').toUpperCase()) {
        case 'USD': return '$';
        case 'EUR': return '€';
        case 'GBP': return '£';
        case 'NGN': return '₦';
        default: return `${code} `;
    }
}

function parseAmount(rawText: string): number | null {
    if (!rawText) return null;
    const matches = Array.from(
        rawText.matchAll(/(?:[$£€₹]|USD|EUR|GBP|NGN)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/gi),
    )
        .map((m) => parseFloat(m[1].replace(/,/g, '')))
        .filter((n) => Number.isFinite(n) && n > 0);
    if (matches.length === 0) return null;
    return Math.max(...matches);
}

type ScanMode = 'idle' | 'camera' | 'preview';

interface ExpenseFormProps {
    amount: string;
    onAmountChange: (text: string) => void;
    category: string;
    onCategoryChange: (key: string) => void;
    note: string;
    onNoteChange: (text: string) => void;
    onSave: () => void;
    saving: boolean;
    primary: string;
    surface: string;
    textPrimary: string;
    textSecondary: string;
    currency?: string;
    extraActions?: React.ReactNode;
}

function ExpenseForm(props: ExpenseFormProps) {
    const {
        amount, onAmountChange, category, onCategoryChange,
        note, onNoteChange, onSave, saving,
        primary, surface, textPrimary, textSecondary, currency, extraActions,
    } = props;

    return (
        <View>
            <Text style={[styles.fieldLabel, { color: textSecondary }]}>Amount</Text>
            <View style={[styles.amountField, { backgroundColor: surface }]}>
                <Text style={[styles.currencyPrefix, { color: textSecondary }]}>
                    {currencySymbol(currency)}
                </Text>
                <TextInput
                    style={[styles.amountInput, { color: textPrimary }]}
                    value={amount}
                    onChangeText={onAmountChange}
                    placeholder="0.00"
                    placeholderTextColor={textSecondary}
                    keyboardType="decimal-pad"
                    autoFocus
                />
            </View>

            <Text style={[styles.fieldLabel, { color: textSecondary }]}>Category</Text>
            <View style={styles.categoryWrap}>
                {[...CATEGORIES, 'other'].map((key) => (
                    <TouchableOpacity
                        key={key}
                        onPress={() => onCategoryChange(key)}
                        style={[
                            styles.categoryChip,
                            { backgroundColor: surface },
                            category === key && { backgroundColor: primary },
                        ]}
                    >
                        <Text
                            style={[
                                styles.categoryChipText,
                                { color: textSecondary },
                                category === key && styles.categoryChipTextActive,
                            ]}
                        >
                            {(CATEGORY_LABELS)[key] || key}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={[styles.fieldLabel, { color: textSecondary }]}>Note</Text>
            <TextInput
                style={[styles.noteInput, { backgroundColor: surface, color: textPrimary }]}
                value={note}
                onChangeText={onNoteChange}
                placeholder="What was this for?"
                placeholderTextColor={textSecondary}
                multiline
            />

            <View style={styles.saveRow}>
                <TouchableOpacity
                    style={[styles.saveButton, { backgroundColor: primary }]}
                    onPress={onSave}
                    disabled={saving}
                    activeOpacity={0.85}
                >
                    {saving ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text style={styles.saveButtonText}>Save expense</Text>
                    )}
                </TouchableOpacity>
                {extraActions}
            </View>
        </View>
    );
}

export default function CaptureScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ manual?: string; mode?: string }>();
    const themeColors = useThemeColors();
    const { getAccessToken } = usePrivy();

    const [manualMode, setManualMode] = useState(params.manual === '1' || params.mode === 'expense');
    const [scanMode, setScanMode] = useState<ScanMode>('idle');
    const [rawText, setRawText] = useState<string>('');
    const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
    const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
    const [currency, setCurrency] = useState<string>('USD');
    const [amount, setAmount] = useState<string>('');
    const [note, setNote] = useState<string>('');
    const [saving, setSaving] = useState(false);

    const detectedAmount = useMemo(() => {
        if (analysis?.amount) return analysis.amount;
        if (!rawText) return null;
        return parseAmount(rawText);
    }, [analysis, rawText]);

    const handleTextDetected = useCallback((text: string) => {
        setRawText(text);
        const parsed = parseAmount(text);
        if (parsed) setAmount(String(parsed.toFixed(2)));
        setScanMode('preview');
    }, []);

    const handleAnalyzed = useCallback((result: ImportAnalysis) => {
        setRawText('');
        setAnalysis(result);
        if (result.amount) setAmount(String(result.amount));
        if (result.currency) setCurrency(result.currency);
        setCategory(result.category || DEFAULT_CATEGORY);
        setNote([result.issuer, result.summary].filter(Boolean).join(' — '));
        setScanMode('preview');
    }, []);

    const finalAmount = useMemo(() => {
        const manual = amount && Number.isFinite(Number(amount)) ? Number(amount) : null;
        return manual ?? detectedAmount ?? null;
    }, [amount, detectedAmount]);

    const saveExpense = useCallback(async () => {
        if (!finalAmount || finalAmount <= 0) {
            Alert.alert('Check the amount', 'Enter how much you spent.');
            return;
        }
        setSaving(true);
        try {
            const token = await getAccessToken();
            if (!token) {
                Alert.alert('Not authenticated', 'Please sign in first.');
                return;
            }

            let ok = false;
            let errorMessage = 'Please try again.';

            if (analysis) {
                const response = await fetch(joinApiUrl('/api/revenue/import-document/confirm'), {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entryType: analysis.suggestedEntryType === 'expense' ? 'expense' : 'credit',
                        amount: String(finalAmount),
                        currency,
                        category,
                        note: note.trim() || analysis.summary || 'captured',
                        ...(analysis.date ? { date: analysis.date } : {}),
                        ...(analysis.suggestedTitle ? { suggestedTitle: analysis.suggestedTitle } : {}),
                        ...(analysis.issuer ? { issuer: analysis.issuer } : {}),
                        ...(analysis.issuerEmail ? { issuerEmail: analysis.issuerEmail } : {}),
                        classification: analysis.classification,
                    }),
                });
                const payload = await response.json();
                ok = response.ok && payload.success;
                errorMessage = payload?.error?.message || errorMessage;
            } else {
                const response = await fetch(joinApiUrl('/api/revenue/expenses'), {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: String(finalAmount),
                        currency,
                        category,
                        note: note.trim() || 'captured expense',
                        sourceType: 'manual',
                    }),
                });
                const payload = await response.json();
                ok = response.ok && payload.success;
                errorMessage = payload?.error?.message || errorMessage;
            }

            if (ok) {
                Alert.alert('Added', 'Saved to your ledger.', [
                    { text: 'Done', onPress: () => router.back() },
                ]);
            } else {
                Alert.alert('Could not save', errorMessage);
            }
        } catch {
            Alert.alert('Could not save', 'Please try again.');
        } finally {
            setSaving(false);
        }
    }, [finalAmount, analysis, currency, category, note, getAccessToken, router]);

    const goToManual = useCallback(() => {
        setManualMode(true);
        setScanMode('idle');
    }, []);

    const retryScan = useCallback(() => {
        setRawText('');
        setAnalysis(null);
        setAmount('');
        setCurrency('USD');
        setCategory(DEFAULT_CATEGORY);
        setNote('');
        setScanMode('camera');
    }, []);

    const back = useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/(drawer)/(tabs)/index');
    }, [router]);

    const isScanScreen = !manualMode && scanMode === 'camera';
    if (isScanScreen) {
        return (
            <OCRScanner
                getAccessToken={getAccessToken}
                useAiAnalysis
                onAnalyzed={handleAnalyzed}
                onTextDetected={handleTextDetected}
                onClose={() => setScanMode('idle')}
            />
        );
    }

    return (
        <SafeAreaView
            style={[styles.safe, { backgroundColor: themeColors.background }]}
            edges={['top']}
        >
            <View style={styles.header}>
                <IOSGlassIconButton
                    onPress={back}
                    systemImage="chevron.left"
                    circleStyle={styles.closeCircle}
                    icon={<ChevronLeft size={22} color={themeColors.textPrimary} strokeWidth={2.6} />}
                />
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
                    {manualMode ? 'Add expense' : 'Capture receipt'}
                </Text>
                <View style={styles.headerSpacer} />
            </View>

            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {manualMode ? (
                    <ScrollView
                        style={styles.flex}
                        contentContainerStyle={styles.content}
                        keyboardShouldPersistTaps="handled"
                    >
                        <ExpenseForm
                            amount={amount}
                            onAmountChange={setAmount}
                            category={category}
                            onCategoryChange={setCategory}
                            note={note}
                            onNoteChange={setNote}
                            onSave={saveExpense}
                            saving={saving}
                            surface={themeColors.surface}
                            textPrimary={themeColors.textPrimary}
                            textSecondary={themeColors.textSecondary}
                            primary={themeColors.primary}
                            extraActions={
                                <TouchableOpacity
                                    style={styles.scanAltButton}
                                    onPress={() => { setManualMode(false); }}
                                >
                                    <ScanLine size={16} color={themeColors.primary} strokeWidth={2.2} />
                                    <Text style={[styles.typeText, { color: themeColors.primary }]}>Scan instead</Text>
                                </TouchableOpacity>
                            }
                        />
                    </ScrollView>
                ) : scanMode === 'idle' ? (
                    <View style={styles.content}>
                        <View style={[styles.heroCard, { backgroundColor: themeColors.primaryLight }]}>
                            <ScanLine size={30} color={themeColors.primary} strokeWidth={2} />
                            <Text style={[styles.heroTitle, { color: themeColors.textPrimary }]}>
                                Snapshot a receipt or invoice
                            </Text>
                            <Text style={[styles.heroSubtitle, { color: themeColors.textSecondary }]}>
                                Hedwig reads the numbers and files it in your ledger.
                            </Text>
                            <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: themeColors.primary }]}
                                onPress={() => setScanMode('camera')}
                                activeOpacity={0.85}
                            >
                                <ScanLine size={18} color="#FFFFFF" strokeWidth={2.2} />
                                <Text style={styles.primaryButtonText}>Take a photo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.typeInsteadButton} onPress={goToManual}>
                                <Pencil size={16} color={themeColors.textSecondary} strokeWidth={2.2} />
                                <Text style={[styles.typeInsteadText, { color: themeColors.textSecondary }]}>
                                    Enter it manually
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <ScrollView
                        style={styles.flex}
                        contentContainerStyle={styles.content}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View style={[styles.previewCard, { backgroundColor: themeColors.surface }]}>
                            <View style={styles.previewHeader}>
                                <ReceiptIcon size={18} color={themeColors.primary} strokeWidth={2} />
                                <Text style={[styles.previewTitle, { color: themeColors.textPrimary }]}>
                                    {analysis ? 'Identified from the photo' : 'Details read from the photo'}
                                </Text>
                            </View>
                            {analysis ? (
                                <>
                                    {analysis.suggestedTitle ? (
                                        <Text style={[styles.analysisLine, { color: themeColors.textPrimary }]}>
                                            {analysis.suggestedTitle}
                                        </Text>
                                    ) : null}
                                    {analysis.summary ? (
                                        <Text
                                            style={[styles.extractedText, { color: themeColors.textSecondary }]}
                                            numberOfLines={3}
                                        >
                                            {analysis.summary}
                                        </Text>
                                    ) : null}
                                    <View style={styles.metaRow}>
                                        <View style={[styles.classificationChip, { backgroundColor: themeColors.primaryLight }]}>
                                            <Text style={[styles.classificationText, { color: themeColors.primary }]}>
                                                {CLASSIFICATION_LABELS[analysis.classification] || 'Document'}
                                            </Text>
                                        </View>
                                        {analysis.date ? (
                                            <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
                                                {new Date(analysis.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </Text>
                                        ) : null}
                                    </View>
                                </>
                            ) : (
                                <Text
                                    style={[styles.extractedText, { color: themeColors.textSecondary }]}
                                    numberOfLines={5}
                                >
                                    {rawText}
                                </Text>
                            )}
                        </View>

                        <ExpenseForm
                            amount={amount}
                            onAmountChange={(t) => { setAmount(t.replace(/[^0-9.]/g, '')); }}
                            category={category}
                            onCategoryChange={setCategory}
                            note={note}
                            onNoteChange={setNote}
                            onSave={saveExpense}
                            saving={saving}
                            currency={currency}
                            surface={themeColors.surface}
                            textPrimary={themeColors.textPrimary}
                            textSecondary={themeColors.textSecondary}
                            primary={themeColors.primary}
                            extraActions={
                                <TouchableOpacity style={styles.rescanButton} onPress={retryScan}>
                                    <ScanLine size={16} color={themeColors.primary} strokeWidth={2.2} />
                                    <Text style={[styles.typeText, { color: themeColors.primary }]}>Rescan</Text>
                                </TouchableOpacity>
                            }
                        />
                    </ScrollView>
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    flex: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    closeCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
        marginHorizontal: 8,
    },
    headerSpacer: { width: 40 },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    heroCard: {
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        marginTop: 8,
    },
    heroTitle: {
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 12,
    },
    heroSubtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 6,
        marginBottom: 20,
        lineHeight: 20,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 22,
        borderRadius: 16,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    typeInsteadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 14,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    typeInsteadText: {
        fontSize: 14,
        fontWeight: '600',
    },
    previewCard: {
        borderRadius: 20,
        padding: 16,
        marginBottom: 20,
    },
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    previewTitle: {
        fontSize: 15,
        fontWeight: '600',
    },
    extractedText: {
        fontSize: 13,
        lineHeight: 18,
    },
    analysisLine: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 12,
    },
    classificationChip: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    classificationText: {
        fontSize: 12,
        fontWeight: '600',
    },
    metaText: {
        fontSize: 12,
        fontWeight: '500',
    },
    fieldLabel: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 6,
        marginTop: 14,
    },
    amountField: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        paddingHorizontal: 16,
    },
    currencyPrefix: {
        fontSize: 22,
        fontWeight: '700',
    },
    amountInput: {
        flex: 1,
        fontSize: 22,
        fontWeight: '700',
        paddingVertical: 14,
        paddingLeft: 8,
    },
    categoryWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    categoryChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
    },
    categoryChipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    categoryChipTextActive: {
        color: '#FFFFFF',
    },
    noteInput: {
        borderRadius: 16,
        padding: 14,
        fontSize: 15,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    saveRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 24,
    },
    saveButton: {
        flex: 1,
        borderRadius: 16,
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    rescanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 14,
    },
    scanAltButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 14,
    },
    typeText: {
        fontSize: 14,
        fontWeight: '600',
    },
});