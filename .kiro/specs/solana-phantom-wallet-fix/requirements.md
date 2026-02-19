# Solana Phantom Wallet Connection Fix - Requirements

## 1. Overview
Fix the blank Phantom wallet modal issue when users try to pay with Solana on the payment link page. The current implementation attempts to connect and pay in a single action, causing the Phantom wallet popup to appear blank.

## 2. Problem Statement
When a user selects Solana network and clicks "Pay with Wallet", the Phantom wallet connection modal appears blank/empty, preventing users from completing the payment.

**Root Cause**: The `handleSolanaPayment` function tries to connect to Phantom and immediately process payment in one flow, which doesn't give Phantom's UI time to properly render.

## 3. User Stories

### 3.1 As a payer using Solana
**I want** to connect my Phantom wallet first, then pay
**So that** I can see the proper Phantom connection UI and approve the payment

**Acceptance Criteria**:
- When I select Solana network and am not connected, the button shows "Connect Wallet"
- When I click "Connect Wallet", Phantom opens with proper UI showing connection request
- After connecting, the button changes to "Pay now" or "Pay X USDC"
- When I click pay, Phantom shows the transaction approval UI properly
- The payment completes successfully and shows success state

### 3.2 As a payer who already connected Phantom
**I want** to see my connected wallet address
**So that** I know which wallet will be used for payment

**Acceptance Criteria**:
- If Phantom is already connected, show "Pay now" button immediately
- Display my connected Solana wallet address in the UI
- Allow me to disconnect and connect a different wallet if needed

### 3.3 As a developer
**I want** proper error handling for Phantom wallet interactions
**So that** users get clear feedback when something goes wrong

**Acceptance Criteria**:
- Show clear error messages if Phantom is not installed
- Handle user rejection of connection gracefully
- Handle user rejection of transaction gracefully
- Show loading states during connection and payment
- Log errors to console for debugging

## 4. Technical Requirements

### 4.1 Wallet Connection State Management
- Track Solana wallet connection state separately from EVM wallet state
- Store connected Solana public key in component state
- Check for existing Phantom connection on component mount
- Provide disconnect functionality

### 4.2 Two-Step Flow
- **Step 1**: Connect wallet (if not connected)
  - Show "Connect Wallet" button
  - Call `phantomProvider.connect()`
  - Wait for user approval
  - Store public key in state
  - Update button to "Pay now"

- **Step 2**: Process payment (if connected)
  - Show "Pay X USDC" button
  - Build transaction
  - Call `phantomProvider.signTransaction()`
  - Send transaction to network
  - Wait for confirmation
  - Show success state

### 4.3 Button State Logic
```
IF selectedChain === 'solana':
  IF solanaWalletConnected:
    SHOW "Pay {amount} {token}"
    ON_CLICK: handleSolanaPayment()
  ELSE:
    SHOW "Connect Wallet"
    ON_CLICK: connectSolanaWallet()
ELSE (EVM chains):
  IF isConnected (Reown):
    SHOW "Pay now"
    ON_CLICK: handleEVMPayment()
  ELSE:
    SHOW "Connect Wallet"
    ON_CLICK: handleConnectWallet()
```

### 4.4 Phantom Provider Detection
- Check for `window.phantom?.solana` first (preferred)
- Fallback to `window.solana` if phantom not found
- Verify `isPhantom` flag is true
- Show clear error if Phantom not detected

## 5. Non-Functional Requirements

### 5.1 User Experience
- Connection flow should feel natural and not rushed
- Loading states should be clear and informative
- Error messages should be user-friendly
- Success state should be celebratory

### 5.2 Performance
- Connection check should be fast (<100ms)
- Transaction building should not block UI
- Confirmation polling should not overwhelm RPC

### 5.3 Security
- Never store private keys
- Only request necessary permissions
- Validate all addresses before transactions
- Use confirmed commitment level for RPC calls

## 6. Out of Scope
- Multi-wallet support (Solflare, Backpack, etc.)
- Wallet adapter library integration
- Mobile wallet connect
- Hardware wallet support
- Transaction simulation/preview

## 7. Success Metrics
- Users can successfully connect Phantom wallet
- Users can successfully complete Solana payments
- Zero blank modal issues reported
- Clear error messages for all failure cases
