import { SendChain } from './sendFlow';

export interface SavedRecipient {
    id: string;
    address: string;
    chain: SendChain;
    label?: string | null;
    updatedAt: number;
}

interface ResolveResult {
    address: string;
    chain: SendChain;
    source: 'address' | 'ens' | 'sns';
}

const getApiUrl = (): string => process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const getAuthHeaders = (token: string): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
});

export async function listRecipients(getAccessToken: () => Promise<string | null>): Promise<SavedRecipient[]> {
    const token = await getAccessToken();
    if (!token) return [];

    const response = await fetch(`${getApiUrl()}/api/recipients`, {
        headers: getAuthHeaders(token),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'Failed to load recipients');
    }

    const recipients = Array.isArray(payload?.data?.recipients) ? payload.data.recipients : [];
    return recipients;
}

export async function saveRecipient(
    getAccessToken: () => Promise<string | null>,
    address: string,
    chain: SendChain,
    label?: string | null
): Promise<SavedRecipient | null> {
    const token = await getAccessToken();
    if (!token) return null;

    const response = await fetch(`${getApiUrl()}/api/recipients`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ address, chain, label: label || null }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'Failed to save recipient');
    }

    return payload?.data?.recipient || null;
}

export async function deleteRecipient(getAccessToken: () => Promise<string | null>, id: string): Promise<void> {
    const token = await getAccessToken();
    if (!token) return;

    const response = await fetch(`${getApiUrl()}/api/recipients/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'Failed to delete recipient');
    }
}

export async function resolveRecipientInput(
    getAccessToken: () => Promise<string | null>,
    input: string
): Promise<ResolveResult> {
    const token = await getAccessToken();
    if (!token) throw new Error('You must be signed in to resolve wallet names.');

    const baseUrl = `${getApiUrl()}/api/recipients`;
    const attempts: Array<() => Promise<Response>> = [
        () =>
            fetch(`${baseUrl}/resolve`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ input }),
            }),
        () =>
            fetch(`${baseUrl}/resolve-recipient`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ input }),
            }),
        () =>
            fetch(`${baseUrl}/resolve?input=${encodeURIComponent(input)}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            }),
        () =>
            fetch(`${baseUrl}/resolve-recipient?input=${encodeURIComponent(input)}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            }),
    ];

    let lastErrorMessage = 'Could not resolve recipient';

    for (const attempt of attempts) {
        const response = await attempt();
        const payload = await response.json().catch(() => null);

        if (response.ok && payload?.success) {
            return payload.data as ResolveResult;
        }

        // Try next fallback when endpoint/method is missing on older backend revisions.
        if (response.status === 404 || response.status === 405) {
            continue;
        }

        lastErrorMessage = payload?.error?.message || lastErrorMessage;
        break;
    }

    throw new Error(lastErrorMessage);
}
