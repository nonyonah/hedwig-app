import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Contract, parseUnits } from 'ethers';
import { CheckCircle, ArrowSquareOut, CurrencyCircleDollar } from '@phosphor-icons/react';
import { TOKENS } from '../lib/constants';
import { executePayment } from '../lib/paymentHandler';
import { usePrivyEvmWallet } from '../hooks/usePrivyEvmWallet';
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
        [key: string]: any;
    };
}

type ChainId = 'base' | 'baseSepolia' | 'celo' | 'solana';

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

            const evmChain = selectedChain as Exclude<ChainId, 'solana'>;
            const tokenAddress = TOKENS[evmChain]?.[selectedToken as keyof (typeof TOKENS)[typeof evmChain]];

            // Get the target chain ID
            const targetChainId = getChainId(selectedChain);

            // Switch chain if necessary
            if (evmChainId !== targetChainId) {
                console.log('[EVM] Switching chain to', targetChainId);
                try {
                    await evmWallet.switchChain(targetChainId);
                } catch (err) {
                    console.error('[EVM] Chain switch failed:', err);
                    throw new Error('Please switch to the correct network in your wallet');
                }
            }

            const provider = await evmWallet.getEthereumProvider();
            
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
                const decimals = 6;
                const amountInUnits = parseUnits(paymentLink.amount.toString(), decimals);
                
                const data = tokenContract.interface.encodeFunctionData('transfer', [
                    recipientAddress,
                    amountInUnits
                ]);
                
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
                if (receipt && (receipt as any).status === '0x1') {
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
                    chain: selectedChain,
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
            alert(err instanceof Error ? err.message : 'Payment failed');
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
        return `${explorers[selectedChain]}${hash}`;
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
                <div className="payment-card redesigned" style={{ width: '480px', minWidth: '480px', minHeight: '323px', backgroundColor: '#FFFFFF', borderRadius: '24px', boxShadow: 'none', padding: '40px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', border: '1px solid #F3F4F6' }}>
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
                <div className="payment-card redesigned" style={{ width: '480px', minWidth: '480px', minHeight: '323px', backgroundColor: '#FFFFFF', borderRadius: '24px', boxShadow: 'none', padding: '40px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', border: '1px solid #F3F4F6' }}>
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
                <div className="payment-card redesigned success-card" style={{ width: '480px', minWidth: '480px', minHeight: '323px', backgroundColor: '#FFFFFF', borderRadius: '24px', boxShadow: 'none', padding: '40px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', border: '1px solid #F3F4F6' }}>
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
                width: '480px',
                minWidth: '480px',
                minHeight: '323px',
                backgroundColor: '#FFFFFF',
                borderRadius: '24px',
                boxShadow: 'none', /* Flat - No Shadow */
                padding: '40px', /* Increased padding */
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
                                src={selectedChain === 'solana' ? '/assets/icons/networks/solana.png' : '/assets/icons/networks/base.png'}
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
                                <option value="base">Base</option>
                                <option value="solana">Solana</option>
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
                                evmAddress ? handleEVMPayment() : handleConnectWallet();
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
