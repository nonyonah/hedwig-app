# Solana Pay Migration - Requirements

## 1. Overview
Migrate the current custom Solana payment implementation to use the official Solana Pay protocol. This provides a standardized, secure, and wallet-agnostic payment flow using QR codes and payment request URLs. The implementation will target devnet for testing.

## 2. Problem Statement
The current implementation uses custom transaction building and signing, which:
- Requires manual wallet connection and transaction management
- Is not standardized across wallets
- Lacks the security best practices of Solana Pay
- Doesn't support QR code-based payments
- Requires more complex error handling

## 3. User Stories

### 3.1 As a payer
**I want** to pay using any Solana wallet that supports Solana Pay
**So that** I have flexibility in choosing my preferred wallet

**Acceptance Criteria**:
- Payment link page shows a Solana Pay QR code
- I can scan the QR code with my mobile wallet (Phantom, Solflare, etc.)
- I can also click a button to pay if using desktop wallet
- The payment request includes all necessary details (amount, recipient, memo)
- Payment is validated automatically after confirmation

### 3.2 As a merchant
**I want** payments to be validated securely on-chain
**So that** I can trust that payments are legitimate

**Acceptance Criteria**:
- Each payment has a unique reference ID
- Payment validation checks amount, recipient, and reference
- Backend stores and tracks payment references
- Payment status updates automatically when confirmed
- Failed payments are handled gracefully

### 3.3 As a developer
**I want** to use the standard Solana Pay protocol
**So that** the implementation is maintainable and follows best practices

**Acceptance Criteria**:
- Uses `@solana/pay` official library
- Follows Solana Pay specification
- Implements proper reference tracking
- Uses devnet for testing
- Can easily switch to mainnet later

## 4. Technical Requirements

### 4.1 Solana Pay Integration
- Install `@solana/pay` package
- Use `encodeURL` to create payment request URLs
- Use `createQR` to generate QR codes for mobile wallets
- Use `findReference` to locate transactions on-chain
- Use `validateTransfer` to verify payment details

### 4.2 Payment Flow
1. **Generate Payment Request**
   - Create unique reference for each payment
   - Encode payment URL with recipient, amount, reference, label, message
   - Support both SOL and SPL tokens (USDC)
   - Generate QR code from payment URL

2. **Display Payment Options**
   - Show QR code for mobile wallet scanning
   - Provide "Pay with Wallet" button for desktop
   - Display payment details (amount, recipient, network)
   - Show loading state while waiting for payment

3. **Monitor Payment**
   - Poll for transaction using reference
   - Use `findReference` with confirmed finality
   - Implement retry logic with exponential backoff
   - Timeout after reasonable period (60 seconds)

4. **Validate Payment**
   - Verify transaction signature
   - Validate amount matches expected
   - Validate recipient matches merchant wallet
   - Update backend with payment status

### 4.3 Backend Integration
- Generate and store unique references for each payment
- Store expected amount with reference
- Validate payment against stored reference
- Update document status when payment confirmed
- Handle payment failures and timeouts

### 4.4 Network Configuration
- Use devnet for all transactions
- Connect to `https://api.devnet.solana.com`
- Use devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Display "DEVNET" badge prominently
- Warn users this is test network

## 5. Non-Functional Requirements

### 5.1 Security
- Generate references server-side
- Validate all payments server-side
- Never trust client-side payment status
- Use confirmed finality for production-readiness
- Implement proper error handling

### 5.2 User Experience
- QR code should be large and scannable
- Show clear payment instructions
- Display real-time payment status
- Provide helpful error messages
- Support both mobile and desktop flows

### 5.3 Performance
- QR code generation should be instant
- Payment detection within 1-2 seconds of confirmation
- Polling should not overwhelm RPC
- Use efficient retry strategy

## 6. Migration Strategy

### 6.1 Phase 1: Add Solana Pay (Keep Old Flow)
- Install Solana Pay packages
- Add QR code display option
- Implement payment monitoring
- Test alongside existing flow

### 6.2 Phase 2: Replace Old Flow
- Remove custom transaction building
- Remove direct wallet connection for Solana
- Use Solana Pay as primary method
- Update UI to focus on QR code

### 6.3 Phase 3: Backend Integration
- Add reference generation endpoint
- Add payment validation endpoint
- Update payment status tracking
- Add webhook for payment notifications

## 7. Out of Scope
- Transaction requests (more complex than transfer requests)
- Custom program interactions
- Multi-signature payments
- Recurring payments
- Mainnet deployment (devnet only for now)

## 8. Success Metrics
- Users can successfully pay via QR code
- Users can successfully pay via desktop wallet
- Payments are validated correctly
- Payment status updates in real-time
- Zero false positives in payment validation
- Clear error messages for all failure cases

## 9. Testing Requirements
- Test with Phantom wallet (mobile and desktop)
- Test with Solflare wallet
- Test payment validation
- Test reference uniqueness
- Test timeout handling
- Test network errors
- Test insufficient balance
- Test wrong amount
- Test wrong recipient
