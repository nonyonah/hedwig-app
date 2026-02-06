import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Contract, parseUnits } from 'ethers';
import { Wallet, DownloadSimple, CheckCircle, ArrowSquareOut } from '@phosphor-icons/react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { TOKENS, HEDWIG_PAYMENT_ABI, HEDWIG_CONTRACTS } from '../lib/appkit';
import {
    SOLANA_RPC,
    SOLANA_PLATFORM_WALLET,
    SOLANA_USDC_MINT,
    USDC_DECIMALS,
    calculateFeePercent,
    getFeeDisplayText,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTokenTransferInstruction,
    accountExists,
} from '../lib/solana';


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

export default function InvoicePage() {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const { open } = useAppKit();
    const { address, isConnected } = useAppKitAccount();
    const { walletProvider } = useAppKitProvider('eip155');

    const [invoice, setInvoice] = useState<InvoiceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedChain, setSelectedChain] = useState<ChainId>('baseSepolia');
    const [selectedToken, setSelectedToken] = useState<TokenSymbol>('USDC');
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

                // Initialize chain from document data if available
                if (doc.chain) {
                    const normalizedChain = doc.chain.toLowerCase();
                    if (normalizedChain.includes('solana')) setSelectedChain('solana' as any);
                    else if (normalizedChain.includes('celo')) setSelectedChain('celo');
                    else setSelectedChain('baseSepolia');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load invoice');
            } finally {
                setLoading(false);
            }
        };

        fetchInvoice();
    }, [id]);

    // Solana payment handler using Phantom wallet
    const handleSolanaPayment = async () => {
        if (!invoice) return;

        const merchantAddress = invoice.user?.solana_wallet_address;
        if (!merchantAddress) {
            alert('Merchant does not have a Solana wallet address configured.');
            setIsPaying(false);
            return;
        }

        // Check for Phantom wallet - prioritize window.phantom.solana
        const phantomProvider = (window as any).phantom?.solana || (window as any).solana;

        if (!phantomProvider) {
            alert('Please install Phantom wallet to pay with Solana!');
            setIsPaying(false);
            return;
        }

        try {
            const response = await phantomProvider.connect();
            const senderPubkey = response.publicKey;
            const connection = new Connection(SOLANA_RPC, 'confirmed');

            const merchantPubkey = new PublicKey(merchantAddress);
            const platformPubkey = new PublicKey(SOLANA_PLATFORM_WALLET);
            const mintPubkey = new PublicKey(SOLANA_USDC_MINT);

            const amount = invoice.amount;
            const transaction = new Transaction();

            // Calculate split with dynamic fee
            const currency = selectedToken || 'USDC';
            if (currency === 'USDC' || selectedToken === 'USDC') {
                const feePercent = calculateFeePercent(amount);
                const totalTokenAmount = BigInt(Math.floor(amount * Math.pow(10, USDC_DECIMALS)));
                const platformFee = BigInt(Math.floor(Number(totalTokenAmount) * feePercent));
                const merchantAmount = totalTokenAmount - platformFee;

                const senderATA = await getAssociatedTokenAddress(senderPubkey, mintPubkey);
                const merchantATA = await getAssociatedTokenAddress(merchantPubkey, mintPubkey);
                const platformATA = await getAssociatedTokenAddress(platformPubkey, mintPubkey);

                if (!(await accountExists(connection, merchantATA))) {
                    transaction.add(createAssociatedTokenAccountInstruction(senderPubkey, merchantATA, merchantPubkey, mintPubkey));
                }
                if (!(await accountExists(connection, platformATA))) {
                    transaction.add(createAssociatedTokenAccountInstruction(senderPubkey, platformATA, platformPubkey, mintPubkey));
                }

                transaction.add(createTokenTransferInstruction(senderATA, merchantATA, senderPubkey, merchantAmount));
                transaction.add(createTokenTransferInstruction(senderATA, platformATA, senderPubkey, platformFee));

            } else {
                throw new Error(`${currency} is not supported on Solana. Please use USDC.`);
            }

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = senderPubkey;

            const { signature } = await phantomProvider.signAndSendTransaction(transaction);

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

            if (!confirmed) throw new Error('Transaction confirmation timed out.');

            setTxHash(signature);

            const apiUrl = import.meta.env.VITE_API_URL || '';
            await fetch(`${apiUrl}/api/documents/${id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txHash: signature, payer: senderPubkey.toString(), chain: 'solana', token: 'USDC', amount }),
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
        if (!invoice) return;

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

        const recipientAddress = invoice.user?.ethereum_wallet_address;
        if (!recipientAddress) {
            alert('Merchant does not have a wallet address configured.');
            return;
        }

        setIsPaying(true);
        let finalTxHash = '';

        try {

            const provider = new BrowserProvider(walletProvider as import('ethers').Eip1193Provider);
            const signer = await provider.getSigner();

            // Get token address and HedwigPayment contract address
            const evmChain = selectedChain as Exclude<ChainId, 'solana'>;
            const tokenAddress = TOKENS[evmChain]?.[selectedToken as keyof (typeof TOKENS)[typeof evmChain]];
            const hedwigContractAddress = HEDWIG_CONTRACTS[evmChain as keyof typeof HEDWIG_CONTRACTS];

            if (selectedToken === 'ETH') {
                // Native ETH transfer - Direct (Fee disabled)
                const amountWei = parseUnits(invoice.amount.toString(), 18);

                console.log('[EVM Native] Direct payment (Fees disabled):', {
                    to: recipientAddress,
                    amount: amountWei.toString()
                });

                console.log('Sending to freelancer...');
                const tx = await signer.sendTransaction({
                    to: recipientAddress,
                    value: amountWei,
                });
                await tx.wait();

                finalTxHash = tx.hash;
                setTxHash(tx.hash);
            } else if (tokenAddress) {
                // ERC20 Transfer - Direct (Fee disabled), skip HedwigPayment contract
                const tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);
                const decimals = await tokenContract.decimals();
                const amountInUnits = parseUnits(invoice.amount.toString(), decimals);

                console.log('[EVM ERC20] Direct payment (Fees disabled):', {
                    token: tokenAddress,
                    amount: amountInUnits.toString(),
                    to: recipientAddress
                });

                console.log('[Payment] Sending tokens directly to freelancer...');
                const tx = await tokenContract.transfer(recipientAddress, amountInUnits);
                await tx.wait();

                finalTxHash = tx.hash;
                setTxHash(tx.hash);
            } else if (tokenAddress && hedwigContractAddress) {
                // Use HedwigPayment contract for atomic 99%/1% fee split
                const tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);
                const hedwigContract = new Contract(hedwigContractAddress, HEDWIG_PAYMENT_ABI, signer);
                const decimals = await tokenContract.decimals();
                const amountInUnits = parseUnits(invoice.amount.toString(), decimals);

                // Step 1: Check current allowance
                const currentAllowance = await tokenContract.allowance(address, hedwigContractAddress);

                console.log('[Payment] Checking allowance:', {
                    current: currentAllowance.toString(),
                    required: amountInUnits.toString(),
                    needsApproval: BigInt(currentAllowance.toString()) < BigInt(amountInUnits.toString())
                });

                // Step 2: Approve if needed (using explicit BigInt comparison)
                if (BigInt(currentAllowance.toString()) < BigInt(amountInUnits.toString())) {
                    console.log('[Payment] Approving tokens to HedwigPayment contract...');
                    const approveTx = await tokenContract.approve(hedwigContractAddress, amountInUnits);
                    console.log('[Payment] Approval tx submitted:', approveTx.hash);
                    await approveTx.wait();
                    console.log('[Payment] Tokens approved');
                } else {
                    console.log('[Payment] Sufficient allowance exists');
                }

                // Step 3: Call pay() on HedwigPayment contract
                // Contract handles 99%/1% split atomically
                console.log('[Payment] Calling HedwigPayment.pay()...');
                const tx = await hedwigContract.pay(
                    tokenAddress,
                    amountInUnits,
                    recipientAddress,
                    invoice.id // Use invoice ID as invoiceId
                );
                await tx.wait();
                finalTxHash = tx.hash;
                setTxHash(tx.hash);
                console.log('[Payment] Payment complete:', tx.hash);
            } else {
                throw new Error(`Token ${selectedToken} not available on ${selectedChain}`);
            }

            // Update invoice status on backend
            const apiUrl = import.meta.env.VITE_API_URL || '';
            await fetch(`${apiUrl}/api/documents/${id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    txHash: finalTxHash, // Fixed: use finalTxHash instead of stale txHash state
                    paidBy: address,
                    chain: selectedChain,
                    token: selectedToken,
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
                    <p>Loading invoice...</p>
                </div>
            </div>
        );
    }

    if (error || !invoice) {
        return (
            <div className="container">
                <div className="card error-container">
                    <div className="error-title">Invoice Not Found</div>
                    <p className="error-message">{error || 'The invoice you are looking for does not exist.'}</p>
                </div>
            </div>
        );
    }

    if (showSuccess) {
        return (
            <div className="container">
                <div className="card success-container">
                    <CheckCircle size={80} weight="fill" className="success-icon" />
                    <h2 className="success-title">Payment Successful!</h2>
                    <p className="success-message">
                        Your payment of {formatCurrency(invoice.amount)} has been sent successfully.
                    </p>
                    {txHash && (
                        <a
                            href={getExplorerUrl(txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tx-link"
                        >
                            View Transaction <ArrowSquareOut size={16} />
                        </a>
                    )}
                </div>
                <div className="footer">Secured by Hedwig</div>
            </div>
        );
    }

    const items = invoice.content?.items || [];
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0) || invoice.amount;
    const feePercent = calculateFeePercent(subtotal);
    const platformFee = subtotal * feePercent;
    const freelancerReceives = subtotal - platformFee;

    return (
        <div className="container">
            <div className="card">
                {/* Header */}
                <div className="header">
                    <div className="invoice-number">INV-{invoice.id.slice(0, 8).toUpperCase()}</div>
                    <span className={`status-badge ${invoice.status.toLowerCase()}`}>
                        {invoice.status}
                    </span>
                    <button className="icon-button" title="Download">
                        <DownloadSimple size={20} />
                    </button>
                </div>

                {/* Parties */}
                <div className="parties">
                    <div className="party-column">
                        <div className="party-label">From</div>
                        <div className="party-name">
                            {invoice.content?.from?.name ||
                                `${invoice.user?.first_name || ''} ${invoice.user?.last_name || ''}`.trim() ||
                                'Unknown'}
                        </div>
                        <div className="party-email">{invoice.content?.from?.email || invoice.user?.email}</div>
                    </div>
                    <div className="party-column">
                        <div className="party-label">To</div>
                        <div className="party-name">
                            {invoice.content?.to?.name || invoice.content?.client_name || 'Client'}
                        </div>
                        <div className="party-email">
                            {invoice.content?.to?.email || invoice.content?.recipient_email}
                        </div>
                    </div>
                </div>

                {/* Amount */}
                <div className="amount-section">
                    <div className="amount-label">Amount</div>
                    <div className="amount-value">{formatCurrency(invoice.amount)}</div>
                    {invoice.due_date && (
                        <div className="due-date">
                            Due {new Date(invoice.due_date).toLocaleDateString()}
                        </div>
                    )}
                </div>

                {/* Items */}
                {items.length > 0 && (
                    <div className="items-section">
                        <div className="items-header">
                            <span className="items-header-label">Item</span>
                            <span className="items-header-label">Amount</span>
                        </div>
                        {items.map((item, index) => (
                            <div key={index} className="item-row">
                                <span className="item-name">{item.description}</span>
                                <span className="item-price">{formatCurrency(item.amount)}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="divider" />

                {/* Summary */}
                <div className="summary-section">
                    <div className="summary-row">
                        <span className="summary-label">Subtotal</span>
                        <span className="summary-value">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="summary-row">
                        <span className="summary-label">Platform fee ({getFeeDisplayText(subtotal)})</span>
                        <span className="summary-value">-{formatCurrency(platformFee)}</span>
                    </div>
                    <div className="summary-row">
                        <span className="summary-label">Freelancer receives</span>
                        <span className="summary-value">{formatCurrency(freelancerReceives)}</span>
                    </div>
                    <div className="summary-row total-row">
                        <span className="total-label">Total</span>
                        <span className="total-value">{formatCurrency(invoice.amount)}</span>
                    </div>
                </div>

                {/* Payment */}
                {invoice.status.toLowerCase() !== 'paid' && (
                    <div className="payment-section">
                        {!invoice.content?.blockradar_url && (
                            <div className="selectors-row">
                                <button
                                    className={`selector-button ${selectedChain === 'baseSepolia' ? 'active' : ''}`}
                                    onClick={() => setSelectedChain('baseSepolia')}
                                >
                                    <img src="/assets/icons/networks/base.png" className="selector-icon" alt="Base" />
                                    <span className="selector-text">Base Sepolia</span>
                                </button>
                                <button
                                    className={`selector-button ${selectedChain === 'solana' ? 'active' : ''}`}
                                    onClick={() => setSelectedChain('solana')}
                                >
                                    <img src="/assets/icons/networks/solana.png" className="selector-icon" alt="Solana" />
                                    <span className="selector-text">Solana</span>
                                </button>
                                <button
                                    className={`selector-button ${selectedToken === 'USDC' ? 'active' : ''}`}
                                    onClick={() => setSelectedToken('USDC')}
                                >
                                    <img src="/assets/icons/tokens/usdc.png" className="selector-icon" alt="USDC" />
                                    <span className="selector-text">USDC</span>
                                </button>
                            </div>
                        )}

                        {invoice.content?.blockradar_url ? (
                            <button
                                className="pay-button"
                                onClick={() => window.location.href = invoice!.content!.blockradar_url!}
                            >
                                <Wallet size={20} />
                                <span>Pay with Crypto</span>
                            </button>
                        ) : (
                            <button
                                className="pay-button"
                                onClick={selectedChain === 'solana' || isConnected ? handlePayment : handleConnectWallet}
                                disabled={isPaying}
                            >
                                <Wallet size={20} />
                                <span>
                                    {isPaying
                                        ? 'Processing...'
                                        : selectedChain === 'solana'
                                            ? 'Pay with Phantom'
                                            : isConnected
                                                ? `Pay ${formatCurrency(invoice.amount)}`
                                                : 'Connect Wallet'}
                                </span>
                            </button>
                        )}

                        {isConnected && address && !invoice.content?.blockradar_url && (
                            <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', marginTop: '12px' }}>
                                Connected: {address.slice(0, 6)}...{address.slice(-4)}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="footer">Secured by Hedwig</div>
        </div>
    );
}
