import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Contract, parseUnits } from 'ethers';
import { CheckCircle, ArrowSquareOut, CurrencyCircleDollar } from '@phosphor-icons/react';
import { TOKENS } from '../lib/constants';
import { executePayment } from '../lib/paymentHandler';
import { usePrivyEvmWallet } from '../hooks/usePrivyEvmWallet';
import { getNetworkModeFromEvmChainId, resolveEvmChainForPayment, type RuntimeNetworkMode } from '../lib/networkMode';
import './PaymentLinkPage.css';

// ERC20 ABI for transfers and approvals
const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
];

interface PaymentLinkData {
    id: string;
    title: string;
    amount: number;
    description?: string;
    currency?: string;
    status: string;
    chain?: string;
    user?: {
        first_name?: string;
        last_name?: string;
        ethereum_wallet_address?: string;
        solana_wallet_address?: string;
    };
    content?: {
        blockradar_url?: string;
        [key: string]: unknown;
    };
}

type ChainId = 'base' | 'baseSepolia' | 'celo' | 'solana';
const AVAILABLE_PAYMENT_CHAINS: Array<{ id: ChainId; label: string }> = [
    { id: 'base', label: 'Base' },
    { id: 'solana', label: 'Solana' },
];

type Eip1193Provider = {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const getErrorMessage = (err: unknown): string => {
    if (typeof err === 'object' && err !== null && 'message' in err) {
        return String((err as { message: unknown }).message);
    }
    return String(err ?? '');
};

const getErrorCode = (err: unknown): number | undefined => {
    if (typeof err === 'object' && err !== null && 'code' in err) {
        const code = (err as { code: unknown }).code;
        return typeof code === 'number' ? code : undefined;
    }
    return undefined;
};

// Helper function to map chain names to chain IDs
const getChainId = (chain: ChainId): number => {
    const chainIds: Record<Exclude<ChainId, 'solana'>, number> = {
        base: 8453,
        baseSepolia: 84532,
        celo: 42220,
    };
    return chainIds[chain as Exclude<ChainId, 'solana'>];
};

const getInjectedSolanaWallet = () => {
    return window.phantom?.solana || window.solflare || window.solana;
};

const getChainIcon = (chain: ChainId) => {
    if (chain === 'solana') return '/assets/icons/networks/solana.png';
    if (chain === 'celo') return '/assets/icons/networks/celo.png';
    return '/assets/icons/networks/base.png';
};

const getSolanaNetworkMode = (wallet: any, evmChainId?: number): RuntimeNetworkMode => {
    const walletNetwork = String(wallet?.network || wallet?.networkVersion || '').toLowerCase();
    if (walletNetwork.includes('devnet') || walletNetwork.includes('testnet')) return 'testnet';
    return getNetworkModeFromEvmChainId(evmChainId);
};

const parseChainIdHex = (value: unknown): number => {
    if (typeof value !== 'string') return NaN;
    return value.startsWith('0x') ? parseInt(value, 16) : Number(value);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureWalletOnTargetChain = async (provider: Eip1193Provider, targetChainId: number): Promise<boolean> => {
    const targetHex = `0x${targetChainId.toString(16)}`;

    const readActiveChain = async () => parseChainIdHex(await provider.request({ method: 'eth_chainId' }));
    let activeChainId = await readActiveChain();
    if (activeChainId === targetChainId) return true;

    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: targetHex }],
        });
    } catch (switchError: unknown) {
        const code = getErrorCode(switchError);
        if (code === 4902 && targetChainId === 84532) {
            await provider.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: '0x14a34',
                    chainName: 'Base Sepolia',
                    nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
                    rpcUrls: ['https://sepolia.base.org'],
                    blockExplorerUrls: ['https://sepolia.basescan.org'],
                }],
            });
            await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: targetHex }],
            });
        } else {
            throw switchError;
        }
    }

    // Some connectors/wallets take a few seconds to emit the updated chainId.
    for (let i = 0; i < 40; i += 1) {
        await sleep(250);
        activeChainId = await readActiveChain();
        if (activeChainId === targetChainId) return true;
    }

    console.warn('[EVM] Wallet chainId did not update after switch attempt.', { activeChainId, targetChainId });
    throw new Error('Wallet is not on Base. Please switch network in your wallet and try again.');
};

export default function PaymentLinkPage() {
    const { id } = useParams<{ id: string }>();
    const { evmWallet, address: evmAddress, chainId: evmChainId, connectEvmWallet } = usePrivyEvmWallet();

    const [paymentLink, setPaymentLink] = useState<PaymentLinkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPaying, setIsPaying] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [selectedChain, setSelectedChain] = useState<ChainId>('base');
    const [selectedToken, setSelectedToken] = useState<string>('USDC');

    useEffect(() => {
        const fetchPaymentLink = async () => {
            if (!id) return;

            try {
                setLoading(true);
                const apiUrl = import.meta.env.VITE_API_URL || '';
                const response = await fetch(`${apiUrl}/api/documents/${id}`);

                if (!response.ok) {
                    throw new Error('Payment link not found');
                }

                const data = await response.json();
                const doc = data.data?.document || data.data || data;
                setPaymentLink(doc);

                // If payment link is already paid, show success screen
                if (doc.status && doc.status.toLowerCase() === 'paid') {
                    setShowSuccess(true);
                }

                // Initialize chain and token from document data if available
                if (doc.chain) {
                    const normalizedChain = doc.chain.toLowerCase();
                    if (normalizedChain.includes('solana')) setSelectedChain('solana');
                    else if (normalizedChain.includes('celo')) setSelectedChain('celo');
                    else setSelectedChain('base');
                }

                if (doc.currency) {
                    const token = doc.currency === 'USD' ? 'USDC' : doc.currency;
                    setSelectedToken(token);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load payment link');
            } finally {
                setLoading(false);
            }
        };

        fetchPaymentLink();
    }, [id]);

    // Solana payment handler using injected wallets (Phantom, Solflare, etc.)
    const handleSolanaPayment = async () => {
        if (!paymentLink) return;

        const merchantAddress = paymentLink.user?.solana_wallet_address;
        if (!merchantAddress) {
            alert('Merchant does not have a Solana wallet address configured.');
            return;
        }

        const solanaWallet = getInjectedSolanaWallet();
        if (!solanaWallet) {
            alert('No Solana wallet found. Install Phantom or Solflare, then refresh this page.');
            return;
        }

        try {
            setIsPaying(true);

            // Connect to Solana wallet
            if (!solanaWallet.publicKey) {
                await solanaWallet.connect();
            }

            console.log('[Solana] Creating transfer...');
            console.log('[Solana] Recipient:', merchantAddress);
            console.log('[Solana] Amount:', paymentLink.amount, 'USDC');

            // Use the new payment handler
            const result = await executePayment({
                chain: 'solana',
                token: 'USDC',
                amount: paymentLink.amount,
                recipientAddress: merchantAddress,
                wallet: solanaWallet,
                networkMode: getSolanaNetworkMode(solanaWallet, evmChainId),
            });

            console.log('[Solana] Transaction sent:', result.txHash);

            setTxHash(result.txHash);

            // Update backend
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const response = await fetch(`${apiUrl}/api/documents/${id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    txHash: result.txHash,
                    payer: solanaWallet.publicKey.toString(),
                    chain: 'solana',
                    token: 'USDC',
                    amount: paymentLink.amount,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update payment status');
            }

            setShowSuccess(true);
        } catch (err) {
            console.error('[Solana] Payment failed:', err);
            alert(`Payment failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsPaying(false);
        }
    };

    const handleEVMPayment = async () => {
        if (!paymentLink) return;

        if (!evmWallet || !evmAddress) {
            alert('Please connect your EVM wallet first.');
            return;
        }

        const recipientAddress = paymentLink.user?.ethereum_wallet_address;
        if (!recipientAddress) {
            alert('Merchant does not have a wallet address configured.');
            return;
        }

        setIsPaying(true);
        let finalTxHash = '';

        try {
            console.log('[EVM] Starting payment...');

            const mode = getNetworkModeFromEvmChainId(evmChainId);
            const evmChain = resolveEvmChainForPayment(
                selectedChain as Exclude<ChainId, 'solana'>,
                mode
            );
            const tokenAddress = TOKENS[evmChain]?.[selectedToken as keyof (typeof TOKENS)[typeof evmChain]];

            // Get the target chain ID
            const targetChainId = getChainId(evmChain);

            const provider = (await evmWallet.getEthereumProvider()) as Eip1193Provider;
            console.log('[EVM] Ensuring wallet chain is', targetChainId);
            await ensureWalletOnTargetChain(provider, targetChainId);
            
            if (selectedToken === 'ETH') {
                // Native ETH transfer
                const amountWei = parseUnits(paymentLink.amount.toString(), 18);
                const txHash = await provider.request({
                    method: 'eth_sendTransaction',
                    params: [{
                        from: evmAddress,
                        to: recipientAddress,
                        value: '0x' + amountWei.toString(16),
                    }],
                });
                finalTxHash = txHash as string;
                setTxHash(txHash as string);
            } else if (tokenAddress) {
                // ERC20 Transfer
                const tokenContract = new Contract(tokenAddress, ERC20_ABI);
                let decimals = 6;
                try {
                    const decimalsData = tokenContract.interface.encodeFunctionData('decimals', []);
                    const decimalsHex = (await provider.request({
                        method: 'eth_call',
                        params: [{ to: tokenAddress, data: decimalsData }, 'latest'],
                    })) as string;
                    const [onchainDecimals] = tokenContract.interface.decodeFunctionResult('decimals', decimalsHex);
                    decimals = Number(onchainDecimals);
                } catch {
                    // Keep default (USDC/USDT are 6) if read fails.
                }
                const amountInUnits = parseUnits(paymentLink.amount.toString(), decimals);
                
                // Balance precheck to avoid "transfer amount exceeds balance" revert.
                try {
                    const balanceData = tokenContract.interface.encodeFunctionData('balanceOf', [evmAddress]);
                    const balanceHex = (await provider.request({
                        method: 'eth_call',
                        params: [{ to: tokenAddress, data: balanceData }, 'latest'],
                    })) as string;
                    const [balance] = tokenContract.interface.decodeFunctionResult('balanceOf', balanceHex);
                    if ((balance as bigint) < amountInUnits) {
                        throw new Error(`Insufficient ${selectedToken} balance on the selected network.`);
                    }
                } catch (balanceError: unknown) {
                    const message = getErrorMessage(balanceError);
                    if (message.toLowerCase().includes('insufficient')) throw balanceError;
                    // If RPC read fails, allow the send path; wallet will still revert if truly insufficient.
                    console.warn('[EVM] Could not precheck token balance. Continuing to send transaction.', balanceError);
                }

                const data = tokenContract.interface.encodeFunctionData('transfer', [
                    recipientAddress,
                    amountInUnits
                ]);

                // Dry-run call for clear failures before broadcast.
                try {
                    await provider.request({
                        method: 'eth_call',
                        params: [{
                            from: evmAddress,
                            to: tokenAddress,
                            data,
                        }, 'latest'],
                    });
                } catch (callError: unknown) {
                    const message = getErrorMessage(callError);
                    const lowerMessage = message.toLowerCase();
                    if (lowerMessage.includes('execution reverted')) {
                        throw new Error(`Transfer reverted. Ensure you have enough ${selectedToken} and ETH for gas on the selected network.`);
                    }
                    // WalletConnect/public RPC can intermittently fail on read calls.
                    // Do not block send flow for transport errors.
                    if (
                        lowerMessage.includes('failed to fetch') ||
                        lowerMessage.includes('http request failed') ||
                        lowerMessage.includes('rpc.walletconnect')
                    ) {
                        console.warn('[EVM] Preflight eth_call failed due to RPC transport issue. Continuing to send transaction.', callError);
                    } else {
                        throw callError;
                    }
                }
                
                const txHash = await provider.request({
                    method: 'eth_sendTransaction',
                    params: [{
                        from: evmAddress,
                        to: tokenAddress,
                        data: data,
                    }],
                });
                finalTxHash = txHash as string;
                setTxHash(txHash as string);
            } else {
                throw new Error(`Token ${selectedToken} not available on ${selectedChain}`);
            }

            // Wait for transaction confirmation
            console.log('[EVM] Waiting for transaction confirmation...');
            let confirmed = false;
            let attempts = 0;
            while (!confirmed && attempts < 60) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;
                const receipt = await provider.request({
                    method: 'eth_getTransactionReceipt',
                    params: [finalTxHash]
                });
                if (typeof receipt === 'object' && receipt !== null && 'status' in receipt && (receipt as { status: unknown }).status === '0x1') {
                    confirmed = true;
                }
            }

            if (!confirmed) {
                throw new Error('Transaction confirmation timed out. Transaction hash: ' + finalTxHash);
            }
            console.log('[EVM] Transaction confirmed');

            // Update backend
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const response = await fetch(`${apiUrl}/api/documents/${id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    txHash: finalTxHash,
                    payer: evmAddress,
                    chain: evmChain,
                    token: selectedToken,
                    amount: paymentLink.amount,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
                throw new Error(`Failed to update payment status: ${errorData.error?.message || response.statusText}`);
            }

            const apiResult = await response.json();
            console.log('[EVM] Backend updated successfully:', apiResult);

            setShowSuccess(true);
        } catch (err) {
            console.error('[EVM] Payment failed:', err);
            const raw = err instanceof Error ? err.message : getErrorMessage(err);
            const errorMessage = raw.toLowerCase().includes('execution reverted')
                ? 'Transfer reverted. Ensure you have enough token balance and native gas on the selected network.'
                : raw;
            alert(errorMessage);
        } finally {
            setIsPaying(false);
        }
    };

    const handleConnectWallet = () => {
        connectEvmWallet();
    };

    const getExplorerUrl = (hash: string) => {
        const explorers: Record<ChainId, string> = {
            base: 'https://basescan.org/tx/',
            baseSepolia: 'https://sepolia.basescan.org/tx/',
            celo: 'https://celoscan.io/tx/',
            solana: 'https://solscan.io/tx/',
        };
        if (selectedChain === 'solana') {
            const solanaMode = getNetworkModeFromEvmChainId(evmChainId);
            const clusterSuffix = solanaMode === 'testnet' ? '?cluster=devnet' : '';
            return `${explorers.solana}${hash}${clusterSuffix}`;
        }
        const runtimeChain = resolveEvmChainForPayment(
            selectedChain as Exclude<ChainId, 'solana'>,
            getNetworkModeFromEvmChainId(evmChainId)
        );
        return `${explorers[runtimeChain]}${hash}`;
    };

    const formatAmount = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const merchantName = paymentLink?.user
        ? `${paymentLink.user.first_name || ''} ${paymentLink.user.last_name || ''}`.trim() || 'Merchant'
        : 'Merchant';

    // Loading state
    if (loading) {
        return (
            <div className="page-container" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: '#FFFFFF', zIndex: 10000, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div className="payment-card redesigned" style={{ width: 'min(480px, calc(100vw - 32px))', minHeight: '323px', backgroundColor: '#FFFFFF', borderRadius: '24px', boxShadow: 'none', padding: 'clamp(20px, 5vw, 40px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', border: '1px solid #F3F4F6' }}>
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading payment details...</p>
                    </div>
                </div>
                <div className="secured-footer" style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.6 }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280' }}>Secured with</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>Hedwig</span>
                </div>
            </div>
        );
    }

    // Error state
    if (error || !paymentLink) {
        return (
            <div className="page-container" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: '#FFFFFF', zIndex: 10000, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div className="payment-card redesigned" style={{ width: 'min(480px, calc(100vw - 32px))', minHeight: '323px', backgroundColor: '#FFFFFF', borderRadius: '24px', boxShadow: 'none', padding: 'clamp(20px, 5vw, 40px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', border: '1px solid #F3F4F6' }}>
                    <div className="error-state">
                        <CurrencyCircleDollar size={64} weight="light" className="error-icon" />
                        <h2>Payment Link Not Found</h2>
                        <p>{error || 'This payment link may have expired or does not exist.'}</p>
                    </div>
                </div>
                <div className="secured-footer" style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.6 }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280' }}>Secured with</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>Hedwig</span>
                </div>
            </div>
        );
    }

    // Success state
    if (showSuccess) {
        return (
            <div className="page-container" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: '#FFFFFF', zIndex: 10000, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div className="payment-card redesigned success-card" style={{ width: 'min(480px, calc(100vw - 32px))', minHeight: '323px', backgroundColor: '#FFFFFF', borderRadius: '24px', boxShadow: 'none', padding: 'clamp(20px, 5vw, 40px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', border: '1px solid #F3F4F6' }}>
                    <CheckCircle size={80} weight="fill" className="success-icon" style={{ color: '#059669', margin: '0 auto 16px' }} />
                    <h2 className="success-title" style={{ marginTop: '0' }}>Payment Successful!</h2>
                    <p className="success-amount">{formatAmount(paymentLink.amount)} {paymentLink.currency || 'USDC'}</p>
                    <p className="success-message">
                        Your payment has been sent to {merchantName}
                    </p>
                    {txHash && (
                        <a
                            href={getExplorerUrl(txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="view-tx-button"
                            style={{ marginTop: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 24px', backgroundColor: '#F3F4F6', borderRadius: '50px', textDecoration: 'none', color: '#111827', fontWeight: 500 }}
                        >
                            View Transaction <ArrowSquareOut size={16} />
                        </a>
                    )}
                </div>
                <div className="secured-footer" style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.6 }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280' }}>Secured with</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>Hedwig</span>
                </div>
            </div>
        );
    }

    // Main payment view
    return (
        <div
            className="page-container"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: '#FFFFFF',
                zIndex: 10000,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                fontFamily: "'Google Sans Flex', sans-serif"
            }}
        >
            <div className="payment-card redesigned" style={{
                width: 'min(480px, calc(100vw - 32px))',
                minHeight: '323px',
                backgroundColor: '#FFFFFF',
                borderRadius: '24px',
                boxShadow: 'none', /* Flat - No Shadow */
                padding: 'clamp(20px, 5vw, 40px)', /* Increased padding */
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                border: '1px solid #F3F4F6'
            }}
            >
                <h1 className="payment-title" style={{ marginBottom: '32px' }}>Payment Link</h1>

                <div className="info-grid" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span className="info-label" style={{ color: '#6B7280' }}>Sold by</span>
                        <span className="info-value" style={{ fontWeight: 500, color: '#111827' }}>{merchantName}</span>
                    </div>

                    <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span className="info-label" style={{ color: '#6B7280' }}>Wallet</span>
                        <span className="info-value" style={{ fontWeight: 500, color: '#6B7280' }}>
                            {selectedChain === 'solana'
                                ? (paymentLink.user?.solana_wallet_address ? `${paymentLink.user.solana_wallet_address.slice(0, 6)}...${paymentLink.user.solana_wallet_address.slice(-4)}` : 'N/A')
                                : (paymentLink.user?.ethereum_wallet_address ? `${paymentLink.user.ethereum_wallet_address.slice(0, 6)}...${paymentLink.user.ethereum_wallet_address.slice(-4)}` : 'N/A')
                            }
                        </span>
                    </div>

                    <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span className="info-label" style={{ color: '#6B7280' }}>For</span>
                        <span className="info-value" style={{ fontWeight: 500 }}>{paymentLink.title || 'Payment'}</span>
                    </div>

                    <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span className="info-label" style={{ color: '#6B7280' }}>Price</span>
                        <div className="info-value price-value" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                            <img src="/assets/icons/tokens/usdc.png" alt="USDC" className="token-icon-inline" style={{ width: '20px', height: '20px' }} onError={(e) => e.currentTarget.style.display = 'none'} />
                            <span>{formatAmount(paymentLink.amount)} {paymentLink.currency || 'USDC'}</span>
                        </div>
                    </div>

                    <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span className="info-label" style={{ color: '#6B7280' }}>Network</span>
                        <div className="network-select-wrapper" style={{ width: 'auto', position: 'relative' }}>
                            {/* Logo Overlay */}
                            <img
                                src={getChainIcon(selectedChain)}
                                alt="Chain"
                                style={{
                                    position: 'absolute',
                                    left: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '20px',
                                    height: '20px',
                                    pointerEvents: 'none',
                                    zIndex: 1,
                                    borderRadius: '50%' /* Rounded Logo */
                                }}
                            />
                            <select
                                value={selectedChain}
                                onChange={(e) => {
                                    setSelectedChain(e.target.value as ChainId);
                                }}
                                style={{
                                    appearance: 'none',
                                    backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23333%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E")`,
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'right 12px center',
                                    backgroundSize: '16px',
                                    paddingRight: '36px',
                                    paddingLeft: '40px', /* Space for logo */
                                    paddingTop: '8px',
                                    paddingBottom: '8px',
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '50px', /* Rounded 50px */
                                    fontSize: '14px',
                                    height: '40px',
                                    color: '#111827',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: 'white',
                                    fontWeight: 500
                                }}
                            >
                                {AVAILABLE_PAYMENT_CHAINS.map((chainOption) => (
                                    <option key={chainOption.id} value={chainOption.id}>
                                        {chainOption.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="action-section" style={{ marginTop: '32px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {selectedChain === 'solana' ? (
                        <button
                            className={`pay-button redesigned ${isPaying ? 'loading' : ''}`}
                            onClick={handleSolanaPayment}
                            disabled={isPaying}
                            style={{
                                width: '100%',
                                height: '48px',
                                backgroundColor: '#2563EB',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50px',
                                fontSize: '16px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: 'none'
                            }}
                        >
                            {isPaying ? (
                                <>
                                    <div className="button-spinner"></div>
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <span>Pay now</span>
                            )}
                        </button>
                    ) : (
                        <button
                            className={`pay-button redesigned ${isPaying ? 'loading' : ''}`}
                            onClick={() => {
                                if (evmAddress) {
                                    handleEVMPayment();
                                } else {
                                    handleConnectWallet();
                                }
                            }}
                            disabled={isPaying}
                            style={{
                                width: '100%',
                                height: '48px',
                                backgroundColor: '#2563EB',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50px',
                                fontSize: '16px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: 'none'
                            }}
                        >
                            {isPaying ? (
                                <>
                                    <div className="button-spinner"></div>
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <span>
                                    {evmAddress ? 'Pay now' : 'Connect Wallet'}
                                </span>
                            )}
                        </button>
                    )}
                </div>
            </div>

            <div className="secured-footer" style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.6 }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280' }}>Secured with</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>Hedwig</span>
            </div>
        </div >
    );
}
