# Solana Pay Migration - Design

## 1. Architecture Overview

### 1.1 Dual Payment Flow

**Option A: QR Code Flow (Mobile/Preferred)**
```
User visits payment link
    ↓
Frontend generates unique reference
    ↓
Frontend creates Solana Pay URL
    ↓
Frontend generates QR code
    ↓
User scans QR with mobile wallet
    ↓
Wallet opens with payment request
    ↓
User approves in wallet
    ↓
Transaction submitted to Solana
    ↓
Frontend polls for transaction
    ↓
Transaction found (findReference)
    ↓
Frontend validates transaction
    ↓
Backend updates payment status
    ↓
Show success screen
```

**Option B: Direct Wallet Flow (Desktop Fallback)**
```
User visits payment link
    ↓
Frontend generates unique reference
    ↓
User clicks "Connect Wallet"
    ↓
Phantom wallet connects
    ↓
User clicks "Pay"
    ↓
Build transaction with reference in memo
    ↓
User approves in wallet
    ↓
Transaction submitted to Solana
    ↓
Get transaction signature
    ↓
Validate transaction locally
    ↓
Backend updates payment status
    ↓
Show success screen
```

### 1.2 Component Structure
```typescript
PaymentLinkPage
├── Payment Details Display
├── Solana Pay QR Code (mobile - Option A)
├── "OR" Divider
├── Connect Wallet Button (if not connected)
├── Pay Button (if connected - Option B)
├── Payment Status Monitor (both flows)
└── Success/Error States
```

## 2. Implementation Details

### 2.1 Package Installation
```bash
npm install @solana/pay bignumber.js
# or
yarn add @solana/pay bignumber.js
```

### 2.2 Imports
```typescript
import { encodeURL, createQR, findReference, validateTransfer, FindReferenceError } from '@solana/pay';
import { Connection, PublicKey, Keypair, clusterApiUrl } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
```

### 2.3 State Management
```typescript
// Keep existing wallet connection state
const [solanaWallet, setSolanaWallet] = useState<any>(null);
const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
const [isConnectingSolana, setIsConnectingSolana] = useState(false);

// Add Solana Pay state
const [paymentReference, setPaymentReference] = useState<PublicKey | null>(null);
const [paymentUrl, setPaymentUrl] = useState<URL | null>(null);
const [qrCode, setQrCode] = useState<any>(null);
const [isMonitoringPayment, setIsMonitoringPayment] = useState(false);
```

### 2.4 Generate Payment Request
```typescript
const generateSolanaPayRequest = async () => {
    if (!paymentLink) return;

    try {
        // Generate unique reference for this payment
        const reference = Keypair.generate().publicKey;
        setPaymentReference(reference);

        // Get merchant wallet
        const recipient = new PublicKey(paymentLink.user?.solana_wallet_address || '');
        
        // Amount in SOL or USDC
        const amount = new BigNumber(paymentLink.amount);
        
        // Payment details
        const label = `Payment to ${merchantName}`;
        const message = `${paymentLink.title} - ${paymentLink.amount} ${paymentLink.currency || 'USDC'}`;
        const memo = `HEDWIG-${paymentLink.id}`;

        // Create payment URL
        let url: URL;
        
        if (selectedToken === 'USDC') {
            // SPL Token (USDC) payment
            const splToken = new PublicKey(SOLANA_USDC_MINT);
            url = encodeURL({
                recipient,
                amount,
                splToken,
                reference,
                label,
                message,
                memo,
            });
        } else {
            // Native SOL payment
            url = encodeURL({
                recipient,
                amount,
                reference,
                label,
                message,
                memo,
            });
        }

        setPaymentUrl(url);

        // Generate QR code
        const qr = createQR(url, 400, 'transparent');
        setQrCode(qr);

        console.log('[Solana Pay] Payment request created:', url.toString());
        console.log('[Solana Pay] Reference:', reference.toString());

    } catch (err) {
        console.error('[Solana Pay] Failed to generate payment request:', err);
        alert('Failed to generate payment request');
    }
};
```

### 2.5 Display QR Code
```typescript
useEffect(() => {
    if (qrCode && selectedChain === 'solana') {
        const qrElement = document.getElementById('solana-pay-qr');
        if (qrElement) {
            qrElement.innerHTML = ''; // Clear previous QR
            qrCode.append(qrElement);
        }
    }
}, [qrCode, selectedChain]);
```

### 2.6 Monitor Payment
```typescript
const monitorPayment = async () => {
    if (!paymentReference || !paymentLink) return;

    setIsMonitoringPayment(true);
    setIsPaying(true);

    try {
        const connection = new Connection(SOLANA_RPC, 'confirmed');
        
        console.log('[Solana Pay] Monitoring for payment...');
        
        // Poll for transaction with reference
        const signatureInfo = await new Promise<any>((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 60; // 60 seconds timeout
            
            const interval = setInterval(async () => {
                attempts++;
                console.log(`[Solana Pay] Checking for transaction... (${attempts}/${maxAttempts})`);
                
                try {
                    const signature = await findReference(connection, paymentReference, {
                        finality: 'confirmed'
                    });
                    
                    console.log('[Solana Pay] Transaction found:', signature.signature);
                    clearInterval(interval);
                    resolve(signature);
                    
                } catch (error) {
                    if (error instanceof FindReferenceError) {
                        // Transaction not found yet, continue polling
                        if (attempts >= maxAttempts) {
                            clearInterval(interval);
                            reject(new Error('Payment timeout - transaction not found'));
                        }
                    } else {
                        // Other error
                        clearInterval(interval);
                        reject(error);
                    }
                }
            }, 1000); // Check every second
        });

        // Validate the transaction
        console.log('[Solana Pay] Validating transaction...');
        
        const recipient = new PublicKey(paymentLink.user?.solana_wallet_address || '');
        const amount = new BigNumber(paymentLink.amount);
        
        if (selectedToken === 'USDC') {
            const splToken = new PublicKey(SOLANA_USDC_MINT);
            await validateTransfer(
                connection,
                signatureInfo.signature,
                {
                    recipient,
                    amount,
                    splToken,
                    reference: paymentReference,
                }
            );
        } else {
            await validateTransfer(
                connection,
                signatureInfo.signature,
                {
                    recipient,
                    amount,
                    reference: paymentReference,
                }
            );
        }

        console.log('[Solana Pay] Payment validated successfully');
        
        setTxHash(signatureInfo.signature);

        // Update backend
        const apiUrl = import.meta.env.VITE_API_URL || '';
        await fetch(`${apiUrl}/api/documents/${id}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                txHash: signatureInfo.signature,
                payer: 'solana-pay', // We don't know payer address with Solana Pay
                chain: 'solana',
                token: selectedToken,
                amount: paymentLink.amount,
                reference: paymentReference.toString(),
            }),
        });

        setShowSuccess(true);

    } catch (err) {
        console.error('[Solana Pay] Payment failed:', err);
        alert(err instanceof Error ? err.message : 'Payment failed');
    } finally {
        setIsMonitoringPayment(false);
        setIsPaying(false);
    }
};
```

### 2.7 Direct Wallet Payment (Fallback)
```typescript
const handleDirectWalletPayment = async () => {
    if (!paymentLink || !solanaWallet || !solanaAddress || !paymentReference) {
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
        const connection = new Connection(SOLANA_RPC, 'confirmed');
        
        const senderPubkey = new PublicKey(solanaAddress);
        const merchantPubkey = new PublicKey(merchantAddress);
        const mintPubkey = new PublicKey(SOLANA_USDC_MINT);

        const amount = paymentLink.amount;
        const currency = selectedToken || paymentLink.currency || 'USDC';

        const transaction = new Transaction();

        if (currency === 'USDC') {
            const amountInUnits = Math.floor(amount * Math.pow(10, USDC_DECIMALS));
            if (isNaN(amountInUnits)) throw new Error('Invalid amount calculation');
            const totalTokenAmount = BigInt(amountInUnits);

            console.log(`[Direct Wallet] USDC Payment: ${totalTokenAmount.toString()}`);

            // Get Associated Token Accounts
            const senderATA = await getAssociatedTokenAddress(senderPubkey, mintPubkey);
            const merchantATA = await getAssociatedTokenAddress(merchantPubkey, mintPubkey);

            // Check if merchant ATA exists, create if not
            if (!(await accountExists(connection, merchantATA))) {
                console.log('[Direct Wallet] Creating merchant ATA...');
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        senderPubkey,
                        merchantATA,
                        merchantPubkey,
                        mintPubkey
                    )
                );
            }

            // Add USDC transfer with reference in memo
            transaction.add(
                createTokenTransferInstruction(
                    senderATA,
                    merchantATA,
                    senderPubkey,
                    totalTokenAmount
                )
            );
            
            // Add memo with reference for tracking
            transaction.add(
                new TransactionInstruction({
                    keys: [{ pubkey: senderPubkey, isSigner: true, isWritable: true }],
                    data: Buffer.from(`HEDWIG-${paymentLink.id}-${paymentReference.toString()}`, 'utf-8'),
                    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
                })
            );
        } else {
            throw new Error(`${currency} is not supported on Solana. Please use USDC.`);
        }

        // Get recent blockhash
        console.log('[Direct Wallet] Getting blockhash...');
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = senderPubkey;

        console.log('[Direct Wallet] Requesting signature...');

        // Sign transaction
        const signedTransaction = await solanaWallet.signTransaction(transaction);
        console.log('[Direct Wallet] Signed. Sending...');

        // Send transaction
        const rawTransaction = signedTransaction.serialize();
        const signature = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });
        
        console.log('[Direct Wallet] Transaction sent:', signature);

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

        // Update backend (same as before)
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
                reference: paymentReference.toString(),
            }),
        });

        setShowSuccess(true);
        
    } catch (err) {
        console.error('[Direct Wallet] Payment failed:', err);
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

### 2.8 UI Layout with Both Options
```tsx
{selectedChain === 'solana' && (
    <div className="solana-pay-section">
        {/* Devnet Warning */}
        <div className="devnet-warning" style={{
            backgroundColor: '#FEF3C7',
            border: '1px solid #F59E0B',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '24px',
            textAlign: 'center'
        }}>
            <span style={{ color: '#92400E', fontWeight: 600, fontSize: '14px' }}>
                ⚠️ DEVNET - Test Network Only
            </span>
        </div>

        {/* QR Code for Mobile (Option A) */}
        <div className="qr-code-container" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '24px'
        }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
                Option 1: Scan to Pay with Mobile Wallet
            </h3>
            <div 
                id="solana-pay-qr" 
                style={{
                    padding: '16px',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    border: '1px solid #E5E7EB'
                }}
            />
            <p style={{ 
                marginTop: '12px', 
                fontSize: '14px', 
                color: '#6B7280',
                textAlign: 'center'
            }}>
                Open Phantom or Solflare on your phone and scan this QR code
            </p>
            
            {/* Start monitoring button for QR flow */}
            {!isMonitoringPayment && (
                <button
                    onClick={monitorPayment}
                    style={{
                        marginTop: '12px',
                        padding: '8px 16px',
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '14px',
                        cursor: 'pointer'
                    }}
                >
                    I've scanned the QR code
                </button>
            )}
        </div>

        {/* Divider */}
        <div style={{
            display: 'flex',
            alignItems: 'center',
            margin: '24px 0',
            gap: '12px'
        }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
            <span style={{ color: '#6B7280', fontSize: '14px' }}>OR</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
        </div>

        {/* Direct Wallet Payment (Option B) */}
        <div style={{ marginBottom: '16px', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
                Option 2: Pay with Desktop Wallet
            </h3>
        </div>

        {/* Connect or Pay Button */}
        {!solanaAddress ? (
            <button
                onClick={connectSolanaWallet}
                disabled={isConnectingSolana}
                style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: '#2563EB',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}
            >
                {isConnectingSolana ? 'Connecting...' : 'Connect Wallet'}
            </button>
        ) : (
            <button
                onClick={handleDirectWalletPayment}
                disabled={isPaying}
                style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: '#2563EB',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}
            >
                {isPaying ? 'Processing...' : `Pay ${formatAmount(paymentLink.amount)} ${selectedToken}`}
            </button>
        )}

        {/* Status Messages */}
        {isMonitoringPayment && (
            <p style={{
                marginTop: '16px',
                textAlign: 'center',
                fontSize: '14px',
                color: '#6B7280'
            }}>
                Waiting for payment confirmation...
            </p>
        )}
        
        {solanaAddress && !isPaying && !isMonitoringPayment && (
            <p style={{
                marginTop: '12px',
                textAlign: 'center',
                fontSize: '14px',
                color: '#059669'
            }}>
                ✓ Wallet connected: {solanaAddress.slice(0, 4)}...{solanaAddress.slice(-4)}
            </p>
        )}
    </div>
)}
```

### 2.9 Generate Payment on Load
```typescript
useEffect(() => {
    if (selectedChain === 'solana' && paymentLink && !paymentReference) {
        generateSolanaPayRequest();
    }
}, [selectedChain, paymentLink]);
```

## 3. Configuration

### 3.1 Devnet Settings
```typescript
// Use devnet RPC
const SOLANA_RPC = 'https://api.devnet.solana.com';

// Devnet USDC mint
const SOLANA_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Explorer URLs for devnet
const SOLANA_EXPLORER = 'https://explorer.solana.com/tx/';
const SOLANA_EXPLORER_CLUSTER = '?cluster=devnet';
```

### 3.2 Environment Variables
```env
VITE_SOLANA_NETWORK=devnet
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

## 4. Backend Changes

### 4.1 Payment Validation Endpoint
```typescript
// POST /api/documents/:id/pay
// Add reference field to request body
{
    txHash: string;
    payer: string;
    chain: string;
    token: string;
    amount: number;
    reference?: string; // Solana Pay reference
}
```

### 4.2 Reference Storage
```sql
-- Add reference column to payments table
ALTER TABLE payments ADD COLUMN reference VARCHAR(255);
ALTER TABLE payments ADD INDEX idx_reference (reference);
```

## 5. Error Handling

### 5.1 Common Errors
- **FindReferenceError**: Transaction not found (continue polling)
- **Validation Error**: Amount/recipient mismatch (reject payment)
- **Timeout Error**: No transaction after 60 seconds (show retry option)
- **Network Error**: RPC connection failed (show error, allow retry)

### 5.2 User Messages
```typescript
const ERROR_MESSAGES = {
    TIMEOUT: 'Payment timeout. Please try again or check your wallet.',
    VALIDATION_FAILED: 'Payment validation failed. Amount or recipient mismatch.',
    NETWORK_ERROR: 'Network error. Please check your connection and try again.',
    INSUFFICIENT_BALANCE: 'Insufficient balance in your wallet.',
    USER_REJECTED: 'Payment cancelled by user.',
};
```

## 6. Testing Checklist

### 6.1 QR Code Flow
- [ ] QR code generates correctly
- [ ] QR code is scannable
- [ ] Mobile wallet opens with correct details
- [ ] Payment completes successfully
- [ ] Status updates in real-time

### 6.2 Desktop Flow
- [ ] Pay button opens wallet
- [ ] Payment details are correct
- [ ] Payment completes successfully
- [ ] Monitoring detects payment
- [ ] Validation passes

### 6.3 Error Cases
- [ ] Timeout handling works
- [ ] Wrong amount rejected
- [ ] Wrong recipient rejected
- [ ] Network errors handled
- [ ] User cancellation handled

## 7. Migration Path

### 7.1 Keep Existing Code
- Keep `connectSolanaWallet` function for direct wallet connection
- Keep `solanaWallet`, `solanaAddress`, `isConnectingSolana` state
- Keep wallet connection check on mount
- Keep account change listeners

### 7.2 Add New Code
- Add Solana Pay payment request generation
- Add QR code display
- Add payment monitoring for QR flow
- Add reference tracking to direct wallet flow

### 7.3 Update Existing Code
- Update direct wallet payment to include reference in memo
- Update backend API call to include reference
- Update UI to show both payment options

## 8. Future Enhancements
- Add transaction request support (more complex flows)
- Add partial payment support
- Add refund functionality
- Add payment expiration
- Add webhook notifications
- Switch to mainnet
