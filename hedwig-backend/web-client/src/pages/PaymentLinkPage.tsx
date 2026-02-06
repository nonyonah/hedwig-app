import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Contract, parseUnits } from 'ethers';
import { Wallet, CheckCircle, ArrowSquareOut, CurrencyCircleDollar } from '@phosphor-icons/react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { TOKENS, HEDWIG_PAYMENT_ABI, HEDWIG_CONTRACTS } from '../lib/appkit';
import {
    SOLANA_RPC,
    SOLANA_PLATFORM_WALLET,
    SOLANA_USDC_MINT,
    USDC_DECIMALS,
    calculateFeePercent,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTokenTransferInstruction,
    accountExists,
} from '../lib/solana';
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
}

type ChainId = 'base' | 'baseSepolia' | 'celo' | 'solana';

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
    const [selectedChain, setSelectedChain] = useState<ChainId>('baseSepolia');
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
                // Backend returns { success: true, data: { document: {...} } }
                const doc = data.data?.document || data.data || data;
                setPaymentLink(doc);

                // Initialize chain and token from document data if available
                if (doc.chain) {
                    const normalizedChain = doc.chain.toLowerCase();
                    if (normalizedChain.includes('solana')) setSelectedChain('solana' as any); // cast for now if type update needed
                    else if (normalizedChain.includes('celo')) setSelectedChain('celo');
                    else setSelectedChain('baseSepolia');
                }

                if (doc.currency) {
                    // Map USD to USDC for crypto payments
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

    // Solana payment handler using Phantom wallet
    const handleSolanaPayment = async () => {
        if (!paymentLink) return;

        const merchantAddress = paymentLink.user?.solana_wallet_address;
        if (!merchantAddress) {
            alert('Merchant does not have a Solana wallet address configured.');
            setIsPaying(false);
            return;
        }

        // Check for Phantom wallet - prioritize window.phantom.solana
        const phantomProvider = (window as any).phantom?.solana || (window as any).solana;
        if (!phantomProvider?.isPhantom) {
            // If provider exists but isn't Phantom, might be another wallet interfering
            console.warn('Solana provider found but isPhantom flag missing or false');
        }

        if (!phantomProvider) {
            alert('Please install Phantom wallet to pay with Solana!');
            setIsPaying(false);
            return;
        }

        try {
            // Connect to Phantom
            const response = await phantomProvider.connect();
            const senderPubkey = response.publicKey;

            // Initialize Solana connection
            const connection = new Connection(SOLANA_RPC, 'confirmed');

            const merchantPubkey = new PublicKey(merchantAddress);
            const platformPubkey = new PublicKey(SOLANA_PLATFORM_WALLET);
            const mintPubkey = new PublicKey(SOLANA_USDC_MINT);

            const amount = paymentLink.amount;
            // Use selectedToken which handles the USD->USDC normalization
            const currency = selectedToken || paymentLink.currency || 'USDC';

            const transaction = new Transaction();

            if (currency === 'USDC') {
                // Calculate split amounts with dynamic fee
                const feePercent = calculateFeePercent(amount);
                const totalTokenAmount = BigInt(Math.floor(amount * Math.pow(10, USDC_DECIMALS)));
                const platformFee = BigInt(Math.floor(Number(totalTokenAmount) * feePercent));
                const merchantAmount = totalTokenAmount - platformFee;

                console.log(`[Solana USDC] Total: ${totalTokenAmount}, Merchant: ${merchantAmount}, Platform: ${platformFee} (${feePercent * 100}%)`);

                // Get Associated Token Accounts
                const senderATA = await getAssociatedTokenAddress(senderPubkey, mintPubkey);
                const merchantATA = await getAssociatedTokenAddress(merchantPubkey, mintPubkey);
                const platformATA = await getAssociatedTokenAddress(platformPubkey, mintPubkey);

                // Check if merchant ATA exists, create if not
                if (!(await accountExists(connection, merchantATA))) {
                    transaction.add(
                        createAssociatedTokenAccountInstruction(senderPubkey, merchantATA, merchantPubkey, mintPubkey)
                    );
                }

                // Check if platform ATA exists, create if not
                if (!(await accountExists(connection, platformATA))) {
                    transaction.add(
                        createAssociatedTokenAccountInstruction(senderPubkey, platformATA, platformPubkey, mintPubkey)
                    );
                }

                // Add USDC transfer to merchant
                transaction.add(createTokenTransferInstruction(senderATA, merchantATA, senderPubkey, merchantAmount));

                // Add USDC transfer to platform
                transaction.add(createTokenTransferInstruction(senderATA, platformATA, senderPubkey, platformFee));
            } else {
                throw new Error(`${currency} is not supported on Solana. Please use USDC.`);
            }

            // Get recent blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = senderPubkey;

            // Sign and send transaction
            const { signature } = await phantomProvider.signAndSendTransaction(transaction);
            console.log('[Solana] Transaction sent:', signature);

            // Wait for confirmation
            let confirmed = false;
            let attempts = 0;
            while (!confirmed && attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;
                const status = await connection.getSignatureStatuses([signature]);
                if (status.value[0]?.confirmationStatus === 'confirmed' || status.value[0]?.confirmationStatus === 'finalized') {
                    confirmed = true;
                }
            }

            if (!confirmed) {
                throw new Error('Transaction confirmation timed out.');
            }

            setTxHash(signature);

            // Update backend
            const apiUrl = import.meta.env.VITE_API_URL || '';
            await fetch(`${apiUrl}/api/documents/${id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    txHash: signature,
                    payer: senderPubkey.toString(),
                    chain: 'solana',
                    token: 'USDC',
                    amount: paymentLink.amount,
                }),
            });

            setShowSuccess(true);
        } catch (err) {
            console.error('[Solana] Payment failed:', err);
            alert(err instanceof Error ? err.message : 'Solana payment failed');
        } finally {
            setIsPaying(false);
        }
    };

    const handleConnectWallet = () => {
        open();
    };

    const handlePayment = async () => {
        if (!paymentLink) return;

        // Solana payments use Phantom wallet - no EVM wallet needed
        if (selectedChain === 'solana') {
            setIsPaying(true);
            await handleSolanaPayment();
            return;
        }

        // EVM payments require wallet connection
        if (!walletProvider || !address) {
            alert('Please connect your wallet first.');
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

            const provider = new BrowserProvider(walletProvider as import('ethers').Eip1193Provider);
            const signer = await provider.getSigner();

            const evmChain = selectedChain as Exclude<ChainId, 'solana'>;
            const tokenAddress = TOKENS[evmChain]?.[selectedToken as keyof (typeof TOKENS)[typeof evmChain]];
            const hedwigContractAddress = HEDWIG_CONTRACTS[evmChain as keyof typeof HEDWIG_CONTRACTS];

            if (selectedToken === 'ETH') {
                // Native ETH transfer - Manual 0.5% / 99.5% split
                const EVM_PLATFORM_WALLET = '0x72e9193B11BF60E8E79B346126545f1B98Ff8496';
                const totalWei = parseUnits(paymentLink.amount.toString(), 18);
                const platformFee = totalWei * 5n / 1000n; // 0.5% (5/1000)
                const freelancerAmount = totalWei - platformFee;

                console.log('[EVM Native] Split payment:', {
                    total: totalWei.toString(),
                    toFreelancer: freelancerAmount.toString(),
                    toPlatform: platformFee.toString()
                });

                // First transfer: 99.5% to freelancer
                // Update UI to show status
                const originalText = (document.querySelector('.pay-button span') as HTMLElement)?.innerText;
                const payButton = document.querySelector('.pay-button') as HTMLButtonElement;

                // We can't easily update React state from here without triggering re-renders, 
                // but we can proceed with the sequence.

                console.log('Sending to freelancer...');
                const tx = await signer.sendTransaction({
                    to: recipientAddress,
                    value: freelancerAmount,
                });
                await tx.wait();

                // Second transfer: 0.5% to platform
                console.log('Sending platform fee...');
                const platformTx = await signer.sendTransaction({
                    to: EVM_PLATFORM_WALLET,
                    value: platformFee
                });
                await platformTx.wait();

                finalTxHash = tx.hash; // Use the main transfer hash for record
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
                        <div className="chain-selector">
                            <button
                                className={`chain-option ${selectedChain === 'baseSepolia' ? 'active' : ''}`}
                                onClick={() => setSelectedChain('baseSepolia')}
                            >
                                <img src="/assets/icons/networks/base.png" alt="Base" className="chain-icon" />
                                Base Sepolia
                            </button>
                            <button
                                className={`chain-option ${selectedChain === 'solana' ? 'active' : ''}`}
                                onClick={() => setSelectedChain('solana')}
                            >
                                <img src="/assets/icons/networks/solana.png" alt="Solana" className="chain-icon" />
                                Solana
                            </button>
                        </div>
                    </div>
                </div>

                <button
                    className={`pay-button ${isPaying ? 'loading' : ''}`}
                    onClick={selectedChain === 'solana' || isConnected ? handlePayment : handleConnectWallet}
                    disabled={isPaying}
                >
                    {isPaying ? (
                        <>
                            <div className="button-spinner"></div>
                            <span>Processing...</span>
                        </>
                    ) : selectedChain === 'solana' ? (
                        <>
                            <Wallet size={20} weight="bold" />
                            <span>Pay with Phantom</span>
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
