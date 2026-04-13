import {
    createPublicClient,
    createWalletClient,
    http,
    keccak256,
    toHex,
    type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo, celoAlfajores } from 'viem/chains';
import { createLogger } from '../utils/logger';

const logger = createLogger('CeloProofRegistry');

const proofRegistryAbi = [
    {
        type: 'function',
        name: 'computeProofId',
        stateMutability: 'pure',
        inputs: [
            { name: 'documentIdHash', type: 'bytes32' },
            { name: 'actionHash', type: 'bytes32' },
            { name: 'payloadHash', type: 'bytes32' },
            { name: 'nonce', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bytes32' }],
    },
    {
        type: 'function',
        name: 'recordProof',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'documentIdHash', type: 'bytes32' },
            { name: 'actionHash', type: 'bytes32' },
            { name: 'payloadHash', type: 'bytes32' },
            { name: 'nonce', type: 'uint256' },
        ],
        outputs: [{ name: 'proofId', type: 'bytes32' }],
    },
] as const;

const documentPaidActionHash = keccak256(toHex('DOCUMENT_PAID'));

type DocumentPaidProofInput = {
    documentId: string;
    txHash?: string | null;
    chain?: string | null;
    token?: string | null;
    amount?: string | number | null;
    payer?: string | null;
    paidAtIso: string;
};

type ProofAnchorResult = {
    anchored: boolean;
    reason?: string;
    txHash?: string;
    proofId?: string;
    chainId?: number;
};

function parseEnabledFlag(value: string | undefined): boolean {
    return String(value || '').toLowerCase() === 'true';
}

function normalizeRegistryAddress(value: string | undefined): Address | null {
    if (!value) return null;
    return /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as Address) : null;
}

function normalizePrivateKey(value: string | undefined): `0x${string}` | null {
    if (!value) return null;
    return /^0x[a-fA-F0-9]{64}$/.test(value) ? (value as `0x${string}`) : null;
}

function resolveCeloChain() {
    const network = String(process.env.CELO_PROOF_REGISTRY_NETWORK || 'celo').toLowerCase();
    if (network === 'alfajores' || network === 'celoalfajores') {
        return {
            chain: celoAlfajores,
            rpcUrl: process.env.CELO_ALFAJORES_RPC_URL || 'https://alfajores-forno.celo-testnet.org',
        };
    }

    return {
        chain: celo,
        rpcUrl: process.env.CELO_RPC_URL || 'https://forno.celo.org',
    };
}

function buildPayloadHash(input: DocumentPaidProofInput): `0x${string}` {
    const payload = [
        `doc:${input.documentId}`,
        `tx:${input.txHash || ''}`,
        `chain:${input.chain || ''}`,
        `token:${input.token || ''}`,
        `amount:${input.amount == null ? '' : String(input.amount)}`,
        `payer:${input.payer || ''}`,
        `paidAt:${input.paidAtIso}`,
    ].join('|');

    return keccak256(toHex(payload));
}

export async function anchorDocumentPaidProof(input: DocumentPaidProofInput): Promise<ProofAnchorResult> {
    if (!parseEnabledFlag(process.env.CELO_PROOF_REGISTRY_ENABLED)) {
        return { anchored: false, reason: 'disabled' };
    }

    const contractAddress = normalizeRegistryAddress(process.env.CELO_PROOF_REGISTRY_ADDRESS);
    if (!contractAddress) {
        logger.warn('Proof anchoring skipped: invalid CELO_PROOF_REGISTRY_ADDRESS');
        return { anchored: false, reason: 'invalid_contract_address' };
    }

    const privateKey = normalizePrivateKey(process.env.CELO_PROOF_REGISTRY_WRITER_PRIVATE_KEY || process.env.CELO_DEPLOYER_PRIVATE_KEY);
    if (!privateKey) {
        logger.warn('Proof anchoring skipped: writer private key not configured');
        return { anchored: false, reason: 'missing_writer_key' };
    }

    try {
        const { chain, rpcUrl } = resolveCeloChain();
        const account = privateKeyToAccount(privateKey);
        const transport = http(rpcUrl);

        const publicClient = createPublicClient({
            chain,
            transport,
        });

        const walletClient = createWalletClient({
            account,
            chain,
            transport,
        });

        const documentIdHash = keccak256(toHex(input.documentId));
        const payloadHash = buildPayloadHash(input);
        const nonce = BigInt(Date.now());

        const proofId = await publicClient.readContract({
            address: contractAddress,
            abi: proofRegistryAbi,
            functionName: 'computeProofId',
            args: [documentIdHash, documentPaidActionHash, payloadHash, nonce],
        });

        const txHash = await walletClient.writeContract({
            address: contractAddress,
            abi: proofRegistryAbi,
            functionName: 'recordProof',
            args: [documentIdHash, documentPaidActionHash, payloadHash, nonce],
            account,
            chain,
        });

        await publicClient.waitForTransactionReceipt({ hash: txHash });

        logger.info('Document paid proof anchored', {
            chainId: chain.id,
            documentId: input.documentId,
            txHash,
            proofId,
        });

        return {
            anchored: true,
            txHash,
            proofId,
            chainId: chain.id,
        };
    } catch (error) {
        logger.error('Failed to anchor document paid proof', {
            documentId: input.documentId,
            message: error instanceof Error ? error.message : 'Unknown error',
        });
        return { anchored: false, reason: 'write_failed' };
    }
}
