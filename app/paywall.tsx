import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function PaywallScreen() {
    const router = useRouter();
    useEffect(() => {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/(drawer)/(tabs)');
        }
    }, [router]);
    return null;
}
