import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Contract, parseUnits } from 'ethers';
import { Wallet, CheckCircle, ArrowSquareOut, CurrencyCircleDollar } from '@phosphor-icons/react';
import { TOKENS, HEDWIG_PAYMENT_ABI, HEDWIG_CONTRACTS } from '../lib/appkit';
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
    };
}

type ChainId = 'base' | 'baseSepolia' | 'celo';

export default function PaymentLinkPage() {
    const { id } = useParams<{ id: string }>();
    const { open } = useAppKit();
    const { address, isConnected } = useAppKitAccount();
    const { walletProvider } = useAppKitProvider('eip155');

    const [paymentLink, setPaymentLink] = useState<PaymentLinkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPaying, setIsPaying] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [selectedChain] = useState<ChainId>('base');
    const [selectedToken] = useState<string>('USDC');

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
        let finalTxHash = '';

        try {
            const provider = new BrowserProvider(walletProvider as import('ethers').Eip1193Provider);
            const signer = await provider.getSigner();

            const tokenAddress = TOKENS[selectedChain]?.[selectedToken as keyof (typeof TOKENS)[typeof selectedChain]];
            const hedwigContractAddress = HEDWIG_CONTRACTS[selectedChain as keyof typeof HEDWIG_CONTRACTS];

            if (selectedToken === 'ETH') {
                const amountWei = parseUnits(paymentLink.amount.toString(), 18);
                const tx = await signer.sendTransaction({
                    to: recipientAddress,
                    value: amountWei,
                });
                await tx.wait();
                finalTxHash = tx.hash;
                setTxHash(tx.hash);
            } else if (tokenAddress && hedwigContractAddress) {
                const tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);
                const hedwigContract = new Contract(hedwigContractAddress, HEDWIG_PAYMENT_ABI, signer);
                const decimals = await tokenContract.decimals();
                const amountInUnits = parseUnits(paymentLink.amount.toString(), decimals);

                const currentAllowance = await tokenContract.allowance(address, hedwigContractAddress);

                console.log('[Payment] Checking allowance:', {
                    current: currentAllowance.toString(),
                    required: amountInUnits.toString(),
                    needsApproval: currentAllowance < amountInUnits
                });

                // Always approve if current allowance is less than required
                if (BigInt(currentAllowance.toString()) < BigInt(amountInUnits.toString())) {
                    console.log('[Payment] Approving tokens to HedwigPayment contract...');
                    const approveTx = await tokenContract.approve(hedwigContractAddress, amountInUnits);
                    console.log('[Payment] Approval tx submitted:', approveTx.hash);
                    await approveTx.wait();
                    console.log('[Payment] Tokens approved');
                } else {
                    console.log('[Payment] Sufficient allowance exists');
                }

                console.log('[Payment] Calling HedwigPayment.pay()...');
                const tx = await hedwigContract.pay(
                    tokenAddress,
                    amountInUnits,
                    recipientAddress,
                    paymentLink.id
                );
                await tx.wait();
                finalTxHash = tx.hash;
                setTxHash(tx.hash);
            } else {
                throw new Error(`Token ${selectedToken} not available on ${selectedChain}`);
            }

            const apiUrl = import.meta.env.VITE_API_URL || '';
            await fetch(`${apiUrl}/api/documents/${id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    txHash: finalTxHash,
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

    const formatAmount = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const merchantName = paymentLink?.user
        ? `${paymentLink.user.first_name || ''} ${paymentLink.user.last_name || ''}`.trim() || 'Merchant'
        : 'Merchant';

    const merchantWallet = paymentLink?.user?.ethereum_wallet_address
        ? `${paymentLink.user.ethereum_wallet_address.slice(0, 6)}...${paymentLink.user.ethereum_wallet_address.slice(-4)}`
        : '';

    // Loading state
    if (loading) {
        return (
            <div className="page-container">
                <div className="payment-card">
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading payment details...</p>
                    </div>
                </div>
                <div className="footer">Secured by Hedwig</div>
            </div>
        );
    }

    // Error state
    if (error || !paymentLink) {
        return (
            <div className="page-container">
                <div className="payment-card">
                    <div className="error-state">
                        <CurrencyCircleDollar size={64} weight="light" className="error-icon" />
                        <h2>Payment Link Not Found</h2>
                        <p>{error || 'This payment link may have expired or does not exist.'}</p>
                    </div>
                </div>
                <div className="footer">Secured by Hedwig</div>
            </div>
        );
    }

    // Success state
    if (showSuccess && txHash) {
        return (
            <div className="page-container">
                <div className="payment-card success-card">
                    <CheckCircle size={80} weight="fill" className="success-icon" />
                    <h2 className="success-title">Payment Successful!</h2>
                    <p className="success-amount">{formatAmount(paymentLink.amount)} {paymentLink.currency || 'USDC'}</p>
                    <p className="success-message">
                        Your payment has been sent to {merchantName}
                    </p>
                    <a
                        href={getExplorerUrl(txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="view-tx-button"
                    >
                        View Transaction <ArrowSquareOut size={16} />
                    </a>
                </div>
                <div className="footer">Secured by Hedwig</div>
            </div>
        );
    }

    // Already paid state
    if (paymentLink.status.toLowerCase() === 'paid') {
        return (
            <div className="page-container">
                <div className="payment-card">
                    <div className="paid-state">
                        <CheckCircle size={64} weight="fill" className="paid-icon" />
                        <h2>Payment Complete</h2>
                        <p className="paid-amount">{formatAmount(paymentLink.amount)} {paymentLink.currency || 'USDC'}</p>
                        <p>This payment has already been completed.</p>
                    </div>
                </div>
                <div className="footer">Secured by Hedwig</div>
            </div>
        );
    }

    // Main payment view
    return (
        <div className="page-container">
            <div className="payment-card">
                <h1 className="payment-title">Payment Link</h1>

                <div className="details-section">
                    <div className="detail-row">
                        <span className="detail-label">Sold by</span>
                        <span className="detail-value">{merchantWallet || merchantName}</span>
                    </div>

                    {paymentLink.title && (
                        <div className="detail-row">
                            <span className="detail-label">For</span>
                            <span className="detail-value">{paymentLink.title}</span>
                        </div>
                    )}

                    <div className="detail-row">
                        <span className="detail-label">Price</span>
                        <span className="detail-value highlight">
                            {formatAmount(paymentLink.amount)} {paymentLink.currency || 'USDC'}
                        </span>
                    </div>

                    <div className="detail-row">
                        <span className="detail-label">Network</span>
                        <span className="detail-value">
                            <span className="network-badge">
                                <img src="/assets/icons/networks/base.png" alt="Base" className="chain-icon" />
                                Base (Mainnet)
                            </span>
                        </span>
                    </div>
                </div>

                <button
                    className={`pay-button ${isPaying ? 'loading' : ''}`}
                    onClick={isConnected ? handlePayment : handleConnectWallet}
                    disabled={isPaying}
                >
                    {isPaying ? (
                        <>
                            <div className="button-spinner"></div>
                            <span>Processing...</span>
                        </>
                    ) : isConnected ? (
                        <>
                            <Wallet size={20} weight="bold" />
                            <span>Pay with wallet</span>
                        </>
                    ) : (
                        <>
                            <Wallet size={20} weight="bold" />
                            <span>Connect Wallet</span>
                        </>
                    )}
                </button>

                {isConnected && address && (
                    <div className="connected-status">
                        Connected: {address.slice(0, 6)}...{address.slice(-4)}
                    </div>
                )}
            </div>

            <div className="footer">Secured by Hedwig</div>
        </div>
    );
}
