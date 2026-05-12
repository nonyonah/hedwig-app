// Mobile-side Circle Gateway API client.
// Wraps /balances, /transfer (with optional Forwarding Service), /estimate,
// and the GET /transfer/{id} polling endpoint we need when forwarding.

import {
    GATEWAY_API_BASE_URL,
    GATEWAY_FORWARDER_FEE_USDC,
    GATEWAY_TRANSFER_FEE_DEN,
    GATEWAY_TRANSFER_FEE_NUM,
    type GatewayChainKey,
} from '../lib/gateway/constants';
import type {
    BurnIntentRequestEntry,
    GatewayBalancesResponse,
    GatewayTransferRecord,
} from '../lib/gateway/types';
import type { Hex } from 'viem';

const apiUrl = (path: string, query?: Record<string, string | undefined>): string => {
    const base = GATEWAY_API_BASE_URL.replace(/\/$/, '');
    const search = query
        ? '?' + Object.entries(query)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&')
        : '';
    return `${base}${path.startsWith('/') ? path : '/' + path}${search}`;
};

const handleJson = async <T>(res: Response): Promise<T> => {
    let body: any = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }
    if (!res.ok) {
        const message = body?.error?.message || body?.message || `Gateway API error ${res.status}`;
        const error = new Error(message) as Error & { status?: number; body?: any };
        error.status = res.status;
        error.body = body;
        throw error;
    }
    return body as T;
};

/**
 * Fetch the unified USDC balance for a depositor across every domain.
 * The Gateway API returns one entry per domain (per-chain liquidity); summing
 * gives the unified balance. Pending deposits are returned separately so the
 * UI can show an "Awaiting confirmation" line.
 */
export async function getGatewayBalances(depositor: string): Promise<GatewayBalancesResponse> {
    const res = await fetch(apiUrl('/balances', { depositor }));
    return handleJson<GatewayBalancesResponse>(res);
}

export async function getGatewayUnifiedBalance(depositor: string): Promise<bigint> {
    const data = await getGatewayBalances(depositor);
    return (data.balances ?? []).reduce<bigint>(
        (sum, entry) => sum + BigInt(entry.balance ?? '0'),
        0n
    );
}

interface RequestTransferOptions {
    /** Use Circle's Forwarding Service so Circle submits the destination mint. */
    useForwarder?: boolean;
}

/**
 * Submit one or more signed burn intents to Gateway.
 * Returns the raw response — when `useForwarder` is true the response may
 * omit `attestation`/`signature` and instead provide a `transfer.id` to poll.
 */
export async function submitBurnIntents(
    entries: BurnIntentRequestEntry[],
    options: RequestTransferOptions = {}
): Promise<any> {
    if (entries.length === 0 || entries.length > 16) {
        throw new Error(`burnIntents must contain 1..16 entries; got ${entries.length}`);
    }

    const res = await fetch(
        apiUrl('/transfer', options.useForwarder ? { enableForwarder: 'true' } : undefined),
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entries.map((entry) => ({
                burnIntent: serializeBurnIntent(entry.burnIntent),
                signature: entry.signature,
                ...(entry.recipientSetupOptions
                    ? { recipientSetupOptions: entry.recipientSetupOptions }
                    : {}),
            }))),
        }
    );
    return handleJson<any>(res);
}

export async function getTransferRecord(id: string): Promise<GatewayTransferRecord> {
    const res = await fetch(apiUrl(`/transfer/${encodeURIComponent(id)}`));
    return handleJson<GatewayTransferRecord>(res);
}

interface PollForwardedTransferOptions {
    intervalMs?: number;
    timeoutMs?: number;
    onTick?: (record: GatewayTransferRecord) => void;
}

const TERMINAL_STATUSES = new Set(['success', 'completed', 'failed', 'cancelled', 'expired']);
const FAILURE_STATUSES = new Set(['failed', 'cancelled', 'expired']);

export async function pollForwardedTransfer(
    id: string,
    {
        intervalMs = 4_000,
        timeoutMs = 45_000,
        onTick,
    }: PollForwardedTransferOptions = {}
): Promise<GatewayTransferRecord> {
    const deadline = Date.now() + timeoutMs;
    let lastRecord: GatewayTransferRecord | null = null;

    while (Date.now() < deadline) {
        try {
            const record = await getTransferRecord(id);
            lastRecord = record;
            if (onTick) onTick(record);
            if (record.status && TERMINAL_STATUSES.has(record.status.toLowerCase())) {
                return record;
            }
        } catch {
            // Network blip — keep polling until deadline.
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    // Burn intent was submitted successfully (we got here past submission).
    // If status isn't an explicit failure, treat as pending-success: the
    // webhook handler will deliver `gateway.mint.finalized` when it lands.
    if (lastRecord) {
        if (lastRecord.status && FAILURE_STATUSES.has(lastRecord.status.toLowerCase())) {
            return lastRecord;
        }
        return { ...lastRecord, status: lastRecord.status || 'pending' };
    }
    return { id, status: 'pending' } as GatewayTransferRecord;
}

interface FeePreview {
    gasFeeUsdc: bigint;
    transferFeeUsdc: bigint;
    forwarderFeeUsdc: bigint;
    totalFeeUsdc: bigint;
    netDeliveredUsdc: bigint;
}

/**
 * Local fee preview for the confirm sheet — does NOT call Gateway. Use
 * `/estimate` if/when we want server-side authoritative numbers.
 */
export function previewGatewayFees({
    sourceChain,
    destChain,
    valueUsdc,
    sourceGasFeeUsdc,
    useForwarder,
}: {
    sourceChain: GatewayChainKey;
    destChain: GatewayChainKey;
    valueUsdc: bigint;
    sourceGasFeeUsdc: bigint;
    useForwarder: boolean;
}): FeePreview {
    const isSameChain = sourceChain === destChain;
    const transferFee = isSameChain
        ? 0n
        : (valueUsdc * GATEWAY_TRANSFER_FEE_NUM) / GATEWAY_TRANSFER_FEE_DEN;
    const forwarderFee = useForwarder ? GATEWAY_FORWARDER_FEE_USDC : 0n;
    const total = sourceGasFeeUsdc + transferFee + forwarderFee;

    return {
        gasFeeUsdc: sourceGasFeeUsdc,
        transferFeeUsdc: transferFee,
        forwarderFeeUsdc: forwarderFee,
        totalFeeUsdc: total,
        netDeliveredUsdc: valueUsdc > total ? valueUsdc - total : 0n,
    };
}

const serializeBurnIntent = (intent: { maxBlockHeight: bigint; maxFee: bigint; spec: any }) => ({
    maxBlockHeight: intent.maxBlockHeight.toString(),
    maxFee: intent.maxFee.toString(),
    spec: {
        ...intent.spec,
        value: intent.spec.value.toString(),
    },
});

const _typecheckHex: Hex = '0x' as Hex;
void _typecheckHex;
