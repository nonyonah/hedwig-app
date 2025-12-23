import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Contract, parseUnits } from 'ethers';
import { Wallet, CheckCircle, ArrowSquareOut } from '@phosphor-icons/react';
import { TOKENS } from '../lib/appkit';

// ERC20 ABI for transfers
const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
];

interface PaymentLinkData {
    id: string;
    title: string;
    amount: number;
    description?: string;
    status: string;
    user?: {
        first_name?: string;
        last_name?: string;
        email?: string;
        ethereum_wallet_address?: string;
    };
}

type ChainId = 'base' | 'baseSepolia' | 'celo';
type TokenSymbol = 'USDC' | 'USDT' | 'cUSD' | 'ETH';

export default function PaymentLinkPage() {
    const { id } = useParams<{ id: string }>();
    const { open } = useAppKit();
    const { address, isConnected } = useAppKitAccount();
    const { walletProvider } = useAppKitProvider('eip155');

    const [paymentLink, setPaymentLink] = useState<PaymentLinkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedChain, setSelectedChain] = useState<ChainId>('baseSepolia');
    const [selectedToken, setSelectedToken] = useState<TokenSymbol>('USDC');
    const [isPaying, setIsPaying] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);

    // Fetch payment link data
    useEffect(() => {
        const fetchPaymentLink = async () => {
            if (!id) return;

            try {
                setLoading(true);
                const apiUrl = import.meta.env.VITE_API_URL || '';
                // Use documents endpoint - payment links are stored as documents
                const response = await fetch(`${apiUrl}/api/documents/${id}`);

                if (!response.ok) {
                    throw new Error('Payment link not found');
                }

                const data = await response.json();
                // Backend returns { success: true, data: { document: {...} } }
                const doc = data.data?.document || data.data || data;
                setPaymentLink(doc);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load payment link');
            } finally {
                setLoading(false);
            }
        };

        fetchPaymentLink();
    }, [id]);

    const handleConnectWallet = () => {
        open();
    };

    const handlePayment = async () => {
        if (!paymentLink || !walletProvider || !address) return;

        const recipientAddress = paymentLink.user?.ethereum_wallet_address;
        if (!recipientAddress) {
            alert('Merchant does not have a wallet address configured.');
            return;
        }

        setIsPaying(true);

        try {
            const provider = new BrowserProvider(walletProvider as import('ethers').Eip1193Provider);
            const signer = await provider.getSigner();

            // Get token address
            const tokenAddress = TOKENS[selectedChain]?.[selectedToken as keyof (typeof TOKENS)[typeof selectedChain]];

            if (selectedToken === 'ETH') {
                // Native ETH transfer
                const amountWei = parseUnits(paymentLink.amount.toString(), 18);
                const tx = await signer.sendTransaction({
                    to: recipientAddress,
                    value: amountWei,
                });
                await tx.wait();
                setTxHash(tx.hash);
            } else if (tokenAddress) {
                // ERC20 token transfer
                const contract = new Contract(tokenAddress, ERC20_ABI, signer);
                const decimals = await contract.decimals();
                const amountInUnits = parseUnits(paymentLink.amount.toString(), decimals);

                const tx = await contract.transfer(recipientAddress, amountInUnits);
                await tx.wait();
                setTxHash(tx.hash);
            } else {
                throw new Error(`Token ${selectedToken} not available on ${selectedChain}`);
            }

            // Update payment link status on backend
            const apiUrl = import.meta.env.VITE_API_URL || '';
            await fetch(`${apiUrl}/api/documents/${id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    txHash: txHash,
                    payer: address,
                    chain: selectedChain,
                    token: selectedToken,
                    amount: paymentLink.amount,
                }),
            });

            setShowSuccess(true);
        } catch (err) {
            console.error('Payment failed:', err);
            alert(err instanceof Error ? err.message : 'Payment failed');
        } finally {
            setIsPaying(false);
        }
    };

    const getExplorerUrl = (hash: string) => {
        const explorers: Record<ChainId, string> = {
            base: 'https://basescan.org/tx/',
            baseSepolia: 'https://sepolia.basescan.org/tx/',
            celo: 'https://celoscan.io/tx/',
        };
        return `${explorers[selectedChain]}${hash}`;
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);
    };

    if (loading) {
        return (
            <div className="container">
                <div className="card loading-container">
                    <div className="spinner" />
                    <p>Loading payment link...</p>
                </div>
            </div>
        );
    }

    if (error || !paymentLink) {
        return (
            <div className="container">
                <div className="card error-container">
                    <div className="error-title">Payment Link Not Found</div>
                    <p className="error-message">{error || 'The payment link you are looking for does not exist.'}</p>
                </div>
            </div>
        );
    }

    if (showSuccess && txHash) {
        return (
            <div className="container">
                <div className="card success-container">
                    <CheckCircle size={80} weight="fill" className="success-icon" />
                    <h2 className="success-title">Payment Successful!</h2>
                    <p className="success-message">
                        Your payment of {formatCurrency(paymentLink.amount)} has been sent successfully.
                    </p>
                    <a
                        href={getExplorerUrl(txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tx-link"
                    >
                        View Transaction <ArrowSquareOut size={16} />
                    </a>
                </div>
                <div className="footer">Secured by Hedwig</div>
            </div>
        );
    }

    const merchantName = paymentLink.user
        ? `${paymentLink.user.first_name || ''} ${paymentLink.user.last_name || ''}`.trim()
        : 'Merchant';

    return (
        <div className="container">
            <div className="card" style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '32px' }}>
                    {paymentLink.title || 'Payment Request'}
                </h1>

                {/* Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
                    <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#666' }}>To</span>
                        <span style={{ fontWeight: 500 }}>{merchantName}</span>
                    </div>

                    <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#666' }}>Amount</span>
                        <span style={{ fontWeight: 600, fontSize: '18px' }}>{formatCurrency(paymentLink.amount)}</span>
                    </div>

                    {paymentLink.description && (
                        <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#666' }}>Description</span>
                            <span style={{ fontWeight: 500 }}>{paymentLink.description}</span>
                        </div>
                    )}
                </div>

                {/* Payment */}
                {paymentLink.status.toLowerCase() !== 'paid' && (
                    <div className="payment-section">
                        <div className="selectors-row">
                            <button
                                className={`selector-button ${selectedChain === 'baseSepolia' ? 'active' : ''}`}
                                onClick={() => setSelectedChain('baseSepolia')}
                            >
                                <img src="/assets/icons/networks/base.png" className="selector-icon" alt="Base" />
                                <span className="selector-text">Base Sepolia</span>
                            </button>
                            <button
                                className={`selector-button ${selectedToken === 'USDC' ? 'active' : ''}`}
                                onClick={() => setSelectedToken('USDC')}
                            >
                                <img src="/assets/icons/tokens/usdc.png" className="selector-icon" alt="USDC" />
                                <span className="selector-text">USDC</span>
                            </button>
                        </div>

                        <button
                            className="pay-button"
                            onClick={isConnected ? handlePayment : handleConnectWallet}
                            disabled={isPaying}
                        >
                            <Wallet size={20} />
                            <span>
                                {isPaying
                                    ? 'Processing...'
                                    : isConnected
                                        ? `Pay ${formatCurrency(paymentLink.amount)}`
                                        : 'Connect Wallet'}
                            </span>
                        </button>

                        {isConnected && address && (
                            <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', marginTop: '12px' }}>
                                Connected: {address.slice(0, 6)}...{address.slice(-4)}
                            </div>
                        )}


                    </div>
                )}

                {paymentLink.status.toLowerCase() === 'paid' && (
                    <div style={{ padding: '24px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '16px' }}>
                        <CheckCircle size={48} weight="fill" color="#10B981" />
                        <p style={{ marginTop: '12px', fontWeight: 600, color: '#10B981' }}>
                            This payment has already been completed
                        </p>
                    </div>
                )}
            </div>

            <div className="footer">Secured by Hedwig</div>
        </div>
    );
}
