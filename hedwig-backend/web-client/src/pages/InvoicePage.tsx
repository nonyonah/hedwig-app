import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Contract, parseUnits } from 'ethers';
import { DownloadSimple, CheckCircle, ArrowSquareOut } from '@phosphor-icons/react';
import { TOKENS } from '../lib/constants';
import { executePayment } from '../lib/paymentHandler';
import { usePrivyEvmWallet } from '../hooks/usePrivyEvmWallet';
import './InvoicePage.css'; // Use dedicated CSS

// ERC20 ABI for transfers and approvals
const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
];

interface InvoiceItem {
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
}

interface InvoiceData {
    id: string;
    title: string;
    amount: number;
    status: string;
    due_date?: string;
    currency?: string;
    chain?: string;
    content?: {
        from?: { name: string; email?: string };
        to?: { name: string; email?: string };
        client_name?: string;
        recipient_email?: string;
        items?: InvoiceItem[];
        notes?: string;
        blockradar_url?: string;
    };
    user?: {
        first_name?: string;
        last_name?: string;
        email?: string;
        ethereum_wallet_address?: string;
        solana_wallet_address?: string;
    };
}

type ChainId = 'base' | 'baseSepolia' | 'celo' | 'solana';
type TokenSymbol = 'USDC' | 'USDT' | 'cUSD' | 'ETH';

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

export default function InvoicePage() {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const { evmWallet, address: evmAddress, chainId: evmChainId, connectEvmWallet } = usePrivyEvmWallet();

    const [invoice, setInvoice] = useState<InvoiceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedChain, setSelectedChain] = useState<ChainId>('base');
    const [selectedToken] = useState<TokenSymbol>('USDC');
    const [isPaying, setIsPaying] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(searchParams.get('status') === 'success');

    // Fetch invoice data
    useEffect(() => {
        const fetchInvoice = async () => {
            if (!id) return;

            try {
                setLoading(true);
                const apiUrl = import.meta.env.VITE_API_URL || '';
                // Use documents endpoint with full user data
                const response = await fetch(`${apiUrl}/api/documents/${id}`);

                if (!response.ok) {
                    throw new Error('Invoice not found');
                }

                const data = await response.json();
                // Backend returns { success: true, data: { document: {...} } }
                const doc = data.data?.document || data.data || data;

                // Map USD to USDC for crypto payments
                if (doc.currency === 'USD') {
                    doc.currency = 'USDC';
                }

                setInvoice(doc);

                // If invoice is already paid, show success screen
                if (doc.status && doc.status.toLowerCase() === 'paid') {
                    setShowSuccess(true);
                }

                // Initialize chain from document data if available
                if (doc.chain) {
                    const normalizedChain = doc.chain.toLowerCase();
                    if (normalizedChain.includes('solana')) setSelectedChain('solana' as any);
                    else if (normalizedChain.includes('celo')) setSelectedChain('celo');
                    else setSelectedChain('base');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load invoice');
            } finally {
                setLoading(false);
            }
        };

        fetchInvoice();
    }, [id]);

    // Solana payment handler using injected wallets (Phantom, Solflare, etc.)
    const handleSolanaPayment = async () => {
        if (!invoice) return;

        const merchantAddress = invoice.user?.solana_wallet_address;
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
            console.log('[Solana] Amount:', invoice.amount, 'USDC');

            // Use the new payment handler
            const result = await executePayment({
                chain: 'solana',
                token: 'USDC',
                amount: invoice.amount,
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
                    amount: invoice.amount,
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

    const handleConnectWallet = () => {
        connectEvmWallet();
    };

    const handleEVMPayment = async () => {
        if (!invoice) return;

        if (!evmWallet || !evmAddress) {
            alert('Please connect your EVM wallet first.');
            return;
        }

        const recipientAddress = invoice.user?.ethereum_wallet_address;
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
                const amountWei = parseUnits(invoice.amount.toString(), 18);
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
                const amountInUnits = parseUnits(invoice.amount.toString(), decimals);
                
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
                    amount: invoice.amount,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
                console.error('[EVM] Backend update failed:', errorData);
                throw new Error(`Failed to update payment status: ${errorData.error?.message || response.statusText}`);
            }

            const apiResult = await response.json();
            console.log('[EVM] Backend updated successfully:', apiResult);

            setShowSuccess(true);
        } catch (err) {
            console.error('[EVM] Payment failed:', err);
            const errorMessage = err instanceof Error ? err.message : 'Payment failed';
            alert(errorMessage);
        } finally {
            setIsPaying(false);
        }
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

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);
    };

    // Helper for displaying wallet address 
    const getDisplayWalletAddress = () => {
        if (selectedChain === 'solana') {
            const addr = invoice?.user?.solana_wallet_address;
            return addr ? `${addr.slice(0, 5)}...${addr.slice(-4)}` : 'Not configured';
        }
        const addr = invoice?.user?.ethereum_wallet_address;
        return addr ? `${addr.slice(0, 5)}...${addr.slice(-4)}` : 'Not configured';
    };

    if (loading) {
        return (
            <div className="page-container" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: '#FFFFFF', zIndex: 10000, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div className="payment-card redesigned" style={{ width: 'min(480px, calc(100vw - 32px))', minHeight: '323px', backgroundColor: '#FFFFFF', borderRadius: '24px', boxShadow: 'none', padding: 'clamp(20px, 5vw, 40px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', border: '1px solid #F3F4F6' }}>
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading invoice...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !invoice) {
        return (
            <div className="page-container" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: '#FFFFFF', zIndex: 10000, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div className="payment-card redesigned" style={{ width: 'min(480px, calc(100vw - 32px))', minHeight: '323px', backgroundColor: '#FFFFFF', borderRadius: '24px', boxShadow: 'none', padding: 'clamp(20px, 5vw, 40px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', border: '1px solid #F3F4F6' }}>
                    <div className="error-state">
                        <div className="error-title">Invoice Not Found</div>
                        <p className="error-message">{error || 'The invoice you are looking for does not exist.'}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (showSuccess) {
        return (
            <div className="page-container" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: '#FFFFFF', zIndex: 10000, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div className="payment-card redesigned" style={{ width: 'min(480px, calc(100vw - 32px))', minHeight: '323px', backgroundColor: '#FFFFFF', borderRadius: '24px', boxShadow: 'none', padding: 'clamp(20px, 5vw, 40px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', border: '1px solid #F3F4F6' }}>
                    <CheckCircle size={80} weight="fill" className="success-icon" style={{ color: '#059669', margin: '0 auto 16px' }} />
                    <h2 className="success-title" style={{ marginTop: '0', textAlign: 'center' }}>Payment Successful!</h2>
                    <p className="success-message" style={{ textAlign: 'center', color: '#6B7280' }}>
                        Your payment of {formatCurrency(invoice.amount)} has been sent successfully.
                    </p>
                    {txHash && (
                        <a
                            href={getExplorerUrl(txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 24px', backgroundColor: '#F3F4F6', borderRadius: '50px', textDecoration: 'none', color: '#111827', fontWeight: 500 }}
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

    const items = invoice.content?.items || [];
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0) || invoice.amount;

    return (
        <div
            className="invoice-page-container"
            style={{
                position: 'relative',
                minHeight: '100vh',
                width: '100vw',
                backgroundColor: '#FFFFFF',
                zIndex: 1, // Low z-index
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'center',
                padding: 'clamp(20px, 4vw, 60px) 16px',
                fontFamily: "'Google Sans Flex', sans-serif"
            }}
        >
            <div className="invoice-card" style={{
                width: 'min(600px, calc(100vw - 32px))',
                minHeight: 'auto',
                backgroundColor: '#FFFFFF',
                borderRadius: '24px',
                boxShadow: 'none',
                padding: 'clamp(20px, 4vw, 32px)',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                border: '1px solid #F3F4F6',
                margin: 'auto 0' // Ensure it centers if space allows, but scrolls if not
            }}>
                {/* Header */}
                <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div className="invoice-number" style={{ fontSize: '14px', color: '#6B7280', fontWeight: 500 }}>
                        INV-{invoice.id.slice(0, 8).toUpperCase()}
                    </div>
                    <button className="icon-button" title="Download" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6B7280' }}>
                        <DownloadSimple size={20} />
                    </button>
                </div>

                {/* Parties */}
                <div className="parties" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', borderBottom: '1px solid #F3F4F6', paddingBottom: '24px' }}>
                    <div className="party-column" style={{ flex: 1 }}>
                        <div className="party-label" style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>From</div>
                        <div className="party-name" style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                            {invoice.content?.from?.name ||
                                `${invoice.user?.first_name || ''} ${invoice.user?.last_name || ''}`.trim() ||
                                'Unknown'}
                        </div>
                        <div className="party-email" style={{ fontSize: '14px', color: '#6B7280' }}>
                            {invoice.content?.from?.email || invoice.user?.email}
                        </div>
                    </div>
                    <div className="party-column" style={{ flex: 1 }}>
                        <div className="party-label" style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>To</div>
                        <div className="party-name" style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                            {invoice.content?.to?.name || invoice.content?.client_name || 'Client'}
                        </div>
                        <div className="party-email" style={{ fontSize: '14px', color: '#6B7280' }}>
                            {invoice.content?.to?.email || invoice.content?.recipient_email}
                        </div>
                    </div>
                </div>

                {/* Amount */}
                <div className="amount-section" style={{ marginBottom: '24px' }}>
                    <div className="amount-label" style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>Amount</div>
                    <div className="amount-value" style={{ fontSize: '48px', fontWeight: 700, color: '#111827', letterSpacing: '-1px', marginBottom: '8px' }}>
                        {formatCurrency(invoice.amount)}
                    </div>
                    {invoice.due_date && (
                        <div className="due-date" style={{ fontSize: '14px', color: '#6B7280' }}>
                            Due {new Date(invoice.due_date).toLocaleDateString()}
                        </div>
                    )}
                </div>

                {/* Items */}
                {items.length > 0 && (
                    <div className="items-section" style={{ marginBottom: '24px' }}>
                        <div className="items-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                            <span className="items-header-label">Item</span>
                            <span className="items-header-label">Amount</span>
                        </div>
                        {items.map((item, index) => (
                            <div key={index} className="item-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                                <span className="item-name">{item.description}</span>
                                <span className="item-price">{formatCurrency(item.amount)}</span>
                            </div>
                        ))}
                        <div style={{ height: '1px', backgroundColor: '#F3F4F6', marginTop: '24px' }}></div>
                    </div>
                )}

                {/* Summary */}
                <div className="summary-section" style={{ marginBottom: '24px' }}>
                    <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px', color: '#6B7280' }}>
                        <span className="summary-label">Subtotal</span>
                        <span className="summary-value">{formatCurrency(subtotal)}</span>
                    </div>
                    {/* Removed Platform Fee and Freelancer receives rows as per request */}
                    <div className="summary-row total-row" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                        <span className="total-label">Total</span>
                        <span className="total-value">{formatCurrency(invoice.amount)}</span>
                    </div>
                </div>

                {/* Network & Wallet Section (Gray Box) */}
                <div className="network-section" style={{ backgroundColor: '#F9FAFB', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px' }}>
                    {/* Network Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '14px', color: '#6B7280', fontWeight: 500 }}>Network</span>
                        <div className="network-select-wrapper" style={{ width: 'auto', position: 'relative' }}>
                            {/* Logo Overlay */}
                            <img
                                src={selectedChain === 'solana' ? '/assets/icons/networks/solana.png' : '/assets/icons/networks/base.png'}
                                alt="Chain"
                                style={{
                                    position: 'absolute',
                                    left: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '18px',
                                    height: '18px',
                                    pointerEvents: 'none',
                                    zIndex: 1,
                                    borderRadius: '50%'
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
                                    backgroundPosition: 'right 8px center',
                                    backgroundSize: '12px',
                                    paddingRight: '28px',
                                    paddingLeft: '34px',
                                    paddingTop: '6px',
                                    paddingBottom: '6px',
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '50px',
                                    fontSize: '13px',
                                    height: '32px',
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

                    {/* Wallet Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', color: '#6B7280', fontWeight: 500 }}>Wallet</span>
                        <span style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>
                            {getDisplayWalletAddress()}
                        </span>
                    </div>
                </div>

                {/* Pay Button */}
                {invoice.status.toLowerCase() !== 'paid' && (
                    <>
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
                                {isPaying ? 'Processing...' : 'Pay now'}
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
                                {isPaying ? 'Processing...' : (evmAddress ? 'Pay now' : 'Connect Wallet')}
                            </button>
                        )}
                    </>
                )}
            </div>

            <div className="secured-footer" style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.6 }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280' }}>Secured with</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>Hedwig</span>
            </div>
        </div>
    );
}
