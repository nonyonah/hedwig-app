import React from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import UniversalCreationBox from '../components/UniversalCreationBox';

export default function CreationBoxScreen() {
    const router = useRouter();

    const handleClose = React.useCallback(() => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/(drawer)/(tabs)/index');
    }, [router]);

    const handleTransfer = React.useCallback((data: any) => {
        const chain = data?.network === 'solana' ? 'solana' : 'base';
        const recipient = typeof data?.recipient === 'string' ? data.recipient : '';
        const token = typeof data?.token === 'string' ? data.token : '';

        router.replace({
            pathname: '/wallet/send',
            params: { chain, recipient, token },
        });
    }, [router]);

    return (
        <UniversalCreationBox
            visible
            onClose={handleClose}
            onTransfer={handleTransfer}
            presentation={Platform.OS === 'android' ? 'inline' : 'auto'}
        />
    );
}
