import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    ActivityIndicator,
    DeviceEventEmitter,
    SafeAreaView,
    Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { MagnifyingGlass, X, Bank as BankIcon, CaretLeft } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';

interface Bank {
    code: string;
    name: string;
}

export default function BankSelectionScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { getAccessToken } = useAuth();

    const [searchQuery, setSearchQuery] = useState('');
    const [banks, setBanks] = useState<Bank[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        fetchBanks();
    }, []);

    const fetchBanks = async () => {
        try {
            setIsLoading(true);
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/offramp/institutions?currency=NGN`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data?.banks) {
                    const bankList = data.data.banks.map((b: any) => ({
                        code: b.code || b.institutionCode || b.id,
                        name: b.name || b.institutionName || 'Unknown Bank'
                    }))
                        .filter((b: Bank) => b.name !== 'Unknown Bank')
                        .sort((a: Bank, b: Bank) => a.name.localeCompare(b.name));

                    setBanks(bankList);
                }
            }
        } catch (error) {
            console.error('Failed to fetch banks:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredBanks = useMemo(() => {
        return banks.filter(b =>
            b.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [banks, searchQuery]);

    const handleSelectBank = (bank: Bank) => {
        // Emit event to update parent screen
        DeviceEventEmitter.emit('onBankSelected', bank);
        router.back();
    };

    const renderBankItem = ({ item }: { item: Bank }) => (
        <TouchableOpacity
            style={[styles.bankItem, { borderBottomColor: themeColors.border }]}
            onPress={() => handleSelectBank(item)}
        >
            <View style={[styles.bankIconPlaceholder, { backgroundColor: themeColors.surface }]}>
                <BankIcon size={20} color={themeColors.textSecondary} />
            </View>
            <Text style={[styles.bankName, { color: themeColors.textPrimary }]}>{item.name}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Select Bank</Text>
                <TouchableOpacity onPress={() => router.back()} style={[styles.closeButton, { backgroundColor: themeColors.surface }]}>
                    <X size={20} color={themeColors.textPrimary} weight="bold" />
                </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
                <View style={[styles.searchBar, { backgroundColor: themeColors.surface }]}>
                    <MagnifyingGlass size={20} color={themeColors.textSecondary} weight="bold" />
                    <TextInput
                        style={[styles.searchInput, { color: themeColors.textPrimary }]}
                        placeholder="Search bank..."
                        placeholderTextColor={themeColors.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoFocus={false}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X size={16} color={themeColors.textSecondary} weight="bold" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {isLoading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={filteredBanks}
                    keyExtractor={(item) => item.code}
                    renderItem={renderBankItem}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        position: 'relative',
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    closeButton: {
        position: 'absolute',
        right: 20,
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        fontFamily: 'GoogleSansFlex_400Regular',
        height: '100%', // ensure it takes height
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    bankItem: {
        paddingVertical: 16,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    bankIconPlaceholder: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    bankName: {
        fontSize: 16,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
