# Solana Phantom Wallet Connection Fix - Design

## 1. Architecture Overview

### 1.1 Component State
```typescript
// New state variables to add
const [solanaWallet, setSolanaWallet] = useState<any>(null);
const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
const [isConnectingSolana, setIsConnectingSolana] = useState(false);
```

### 1.2 Flow Diagram
```
User selects Solana network
    ↓
Check if Phantom connected
    ↓
NOT CONNECTED → Show "Connect Wallet" → User clicks → connectSolanaWallet()
    ↓                                                          ↓
    |                                                   Phantom popup opens
    |                                                          ↓
    |                                                   User approves
    |                                                          ↓
    |                                                   Store wallet & address
    |                                                          ↓
CONNECTED → Show "Pay X USDC" → User clicks → handleSolanaPayment()
                                                          ↓
                                                   Build transaction
                                                          ↓
                                                   Sign transaction
                                                          ↓
                                                   Send to network
                                                          ↓
                                                   Wait for confirmation
                                                          ↓
                                                   Show success
```

## 2. Implementation Details

### 2.1 Phantom Detection & Connection Check
```typescript
useEffect(() => {
    const checkSolanaConnection = async () => {
        const phantomProvider = (window as any).phantom?.solana;
        
        if (!phantomProvider) return;
        
        // Check if already connected
        if (phantomProvider.isConnected) {
            setSolanaWallet(phantomProvider);
            setSolanaAddress(phantomProvider.publicKey?.toString() || null);
        }
        
        // Listen for account changes
        phantomProvider.on('accountChanged', (publicKey: any) => {
            if (publicKey) {
                setSolanaAddress(publicKey.toString());
            } else {
                // Disconnected
                setSolanaWallet(null);
                setSolanaAddress(null);
            }
        });
    };
    
    if (selectedChain === 'solana') {
        checkSolanaConnection();
    }
}, [selectedChain]);
```

### 2.2 Connect Solana Wallet Function
```typescript
const connectSolanaWallet = async () => {
    setIsConnectingSolana(true);
    
    try {
        const phantomProvider = (window as any).phantom?.solana || (window as any).solana;
        
        if (!phantomProvider) {
            alert('Please install Phantom wallet to pay with Solana!');
            return;
        }
        
        console.log('[Solana] Requesting connection...');
        
        // This opens the Phantom popup
        const response = await phantomProvider.connect();
        
        console.log('[Solana] Connected:', response.publicKey.toString());
        
        setSolanaWallet(phantomProvider);
        setSolanaAddress(response.publicKey.toString());
        
    } catch (err) {
        console.error('[Solana] Connection failed:', err);
        if (err instanceof Error && err.message.includes('User rejected')) {
            alert('Connection cancelled');
        } else {
            alert('Failed to connect to Phantom wallet');
        }
    } finally {
        setIsConnectingSolana(false);
    }
};
```

### 2.3 Updated Payment Function
```typescript
const handleSolanaPayment = async () => {
    if (!paymentLink || !solanaWallet || !solanaAddress) {
        alert('Please connect your Solana wallet first');
        return;
    }

    const merchantAddress = paymentLink.user?.solana_wallet_address;
    if (!merchantAddress) {
        alert('Merchant does not have a Solana wallet address configured.');
        return;
    }

    setIsPaying(true);

    try {
        // Initialize Solana connection
        const connection = new Connection(SOLANA_RPC, 'confirmed');
        
        const senderPubkey = new PublicKey(solanaAddress);
        const merchantPubkey = new PublicKey(merchantAddress);
        const mintPubkey = new PublicKey(SOLANA_USDC_MINT);

        const amount = paymentLink.amount;
        const currency = selectedToken || paymentLink.currency || 'USDC';

        const transaction = new Transaction();

        if (currency === 'USDC') {
            // Calculate amount
            const amountInUnits = Math.floor(amount * Math.pow(10, USDC_DECIMALS));
            if (isNaN(amountInUnits)) throw new Error('Invalid amount calculation');
            const totalTokenAmount = BigInt(amountInUnits);

            console.log(`[Solana USDC] Total: ${totalTokenAmount.toString()}`);

            // Get Associated Token Accounts
            const senderATA = await getAssociatedTokenAddress(senderPubkey, mintPubkey);
            const merchantATA = await getAssociatedTokenAddress(merchantPubkey, mintPubkey);

            console.log('[Solana] Sender ATA:', senderATA.toString());
            console.log('[Solana] Merchant ATA:', merchantATA.toString());

            // Check if merchant ATA exists, create if not
            if (!(await accountExists(connection, merchantATA))) {
                console.log('[Solana] Creating merchant ATA...');
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        senderPubkey,
                        merchantATA,
                        merchantPubkey,
                        mintPubkey
                    )
                );
            }

            // Add USDC transfer to merchant (Full Amount)
            transaction.add(
                createTokenTransferInstruction(
                    senderATA,
                    merchantATA,
                    senderPubkey,
                    totalTokenAmount
                )
            );
        } else {
            throw new Error(`${currency} is not supported on Solana. Please use USDC.`);
        }

        // Get recent blockhash
        console.log('[Solana] Getting blockhash...');
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = senderPubkey;

        console.log('[Solana] Requesting signature...');

        // Sign transaction (opens Phantom approval UI)
        const signedTransaction = await solanaWallet.signTransaction(transaction);
        console.log('[Solana] Signed. Sending...');

        // Send transaction
        const rawTransaction = signedTransaction.serialize();
        const signature = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });
        
        console.log('[Solana] Transaction sent:', signature);

        // Wait for confirmation
        let confirmed = false;
        let attempts = 0;
        while (!confirmed && attempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
            const status = await connection.getSignatureStatuses([signature]);
            const confirmationStatus = status.value[0]?.confirmationStatus;
            if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
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
                payer: solanaAddress,
                chain: 'solana',
                token: 'USDC',
                amount: paymentLink.amount,
            }),
        });

        setShowSuccess(true);
        
    } catch (err) {
        console.error('[Solana] Payment failed:', err);
        if (err instanceof Error && err.message.includes('User rejected')) {
            alert('Transaction cancelled');
        } else {
            alert(err instanceof Error ? err.message : 'Solana payment failed');
        }
    } finally {
        setIsPaying(false);
    }
};
```

### 2.4 Button Logic Update
```typescript
const getButtonText = () => {
    if (isPaying) return 'Processing...';
    if (isConnectingSolana) return 'Connecting...';
    
    if (selectedChain === 'solana') {
        if (solanaAddress) {
            return `Pay ${formatAmount(paymentLink.amount)} ${selectedToken}`;
        }
        return 'Connect Wallet';
    }
    
    // EVM chains
    if (isConnected) {
        return 'Pay now';
    }
    return 'Connect Wallet';
};

const getButtonAction = () => {
    if (selectedChain === 'solana') {
        if (solanaAddress) {
            return handleSolanaPayment;
        }
        return connectSolanaWallet;
    }
    
    // EVM chains
    if (isConnected) {
        return handleEVMPayment;
    }
    return handleConnectWallet;
};

// In JSX
<button
    className={`pay-button redesigned ${isPaying || isConnectingSolana ? 'loading' : ''}`}
    onClick={getButtonAction()}
    disabled={isPaying || isConnectingSolana}
    style={{...}}
>
    {(isPaying || isConnectingSolana) ? (
        <>
            <div className="button-spinner"></div>
            <span>{getButtonText()}</span>
        </>
    ) : (
        <span>{getButtonText()}</span>
    )}
</button>
```

### 2.5 Display Connected Wallet
```typescript
// In the wallet info row
<div className="info-row" style={{...}}>
    <span className="info-label" style={{ color: '#6B7280' }}>Wallet</span>
    <span className="info-value" style={{ fontWeight: 500, color: '#6B7280' }}>
        {selectedChain === 'solana'
            ? (solanaAddress 
                ? `${solanaAddress.slice(0, 6)}...${solanaAddress.slice(-4)}` 
                : (paymentLink.user?.solana_wallet_address 
                    ? `${paymentLink.user.solana_wallet_address.slice(0, 6)}...${paymentLink.user.solana_wallet_address.slice(-4)}` 
                    : 'N/A'))
            : (paymentLink.user?.ethereum_wallet_address 
                ? `${paymentLink.user.ethereum_wallet_address.slice(0, 6)}...${paymentLink.user.ethereum_wallet_address.slice(-4)}` 
                : 'N/A')
        }
    </span>
</div>
```

## 3. Error Handling

### 3.1 Connection Errors
- **Phantom not installed**: Show alert with link to install
- **User rejected connection**: Show "Connection cancelled" message
- **Network error**: Show "Failed to connect" with retry option

### 3.2 Payment Errors
- **Insufficient balance**: Show clear message with required amount
- **User rejected transaction**: Show "Transaction cancelled"
- **Network error**: Show error with transaction details
- **Timeout**: Show message to check explorer

## 4. Testing Checklist

### 4.1 Connection Flow
- [ ] Phantom not installed → Shows install message
- [ ] Phantom installed, not connected → Shows "Connect Wallet"
- [ ] Click connect → Phantom popup opens properly
- [ ] User approves → Wallet connected, button changes to "Pay"
- [ ] User rejects → Shows cancellation message
- [ ] Already connected → Shows "Pay" immediately

### 4.2 Payment Flow
- [ ] Click pay → Phantom transaction approval opens
- [ ] User approves → Transaction sent and confirmed
- [ ] User rejects → Shows cancellation message
- [ ] Insufficient balance → Shows clear error
- [ ] Network error → Shows error with details

### 4.3 State Management
- [ ] Switching from EVM to Solana → Checks Phantom connection
- [ ] Switching from Solana to EVM → Uses Reown connection
- [ ] Phantom account change → Updates displayed address
- [ ] Phantom disconnect → Resets to "Connect Wallet"

## 5. Correctness Properties

### Property 5.1: Connection State Consistency
**For all user interactions**, if Phantom is connected, then `solanaAddress` is not null and `solanaWallet` is not null.

### Property 5.2: Button State Correctness
**For all button states**, if `selectedChain === 'solana'` and `solanaAddress !== null`, then button text includes "Pay" and onClick handler is `handleSolanaPayment`.

### Property 5.3: Payment Preconditions
**For all payment attempts**, `handleSolanaPayment` is only called when `solanaWallet !== null` and `solanaAddress !== null`.

### Property 5.4: Error Recovery
**For all errors**, the component returns to a valid state where the user can retry the operation.

## 6. Implementation Notes

- Use `useEffect` to check for existing Phantom connection on mount
- Listen to Phantom's `accountChanged` event for wallet switches
- Separate connection state from payment state
- Clear loading states in finally blocks
- Log all steps for debugging
- Use proper TypeScript types for Phantom provider
