import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function LinksTab() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/wallet');
    }, [router]);

    return null;
}
