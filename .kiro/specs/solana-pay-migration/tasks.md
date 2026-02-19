# Solana Pay Migration - Tasks

## 1. Setup and Installation
- [ ] 1.1 Install `@solana/pay` package
- [ ] 1.2 Install `bignumber.js` package
- [ ] 1.3 Add Solana Pay imports to PaymentLinkPage.tsx
- [ ] 1.4 Update SOLANA_RPC to use devnet URL
- [ ] 1.5 Update SOLANA_USDC_MINT to devnet mint address

## 2. State Management
- [ ] 2.1 Add `paymentReference` state for unique payment tracking
- [ ] 2.2 Add `paymentUrl` state for Solana Pay URL
- [ ] 2.3 Add `qrCode` state for QR code instance
- [ ] 2.4 Add `isMonitoringPayment` state for payment monitoring status

## 3. Generate Payment Request
- [ ] 3.1 Create `generateSolanaPayRequest` function
- [ ] 3.2 Generate unique reference using Keypair
- [ ] 3.3 Create payment URL for USDC using `encodeURL`
- [ ] 3.4 Create payment URL for SOL using `encodeURL`
- [ ] 3.5 Generate QR code using `createQR`
- [ ] 3.6 Store reference, URL, and QR code in state
- [ ] 3.7 Add error handling for payment request generation

## 4. Display QR Code
- [ ] 4.1 Create QR code container in JSX
- [ ] 4.2 Add useEffect to append QR code to DOM element
- [ ] 4.3 Style QR code container (centered, bordered, padded)
- [ ] 4.4 Add instructions for mobile wallet scanning
- [ ] 4.5 Add devnet warning badge

## 5. Payment Monitoring
- [ ] 5.1 Create `monitorPayment` function
- [ ] 5.2 Implement polling logic using `findReference`
- [ ] 5.3 Add retry logic with 1-second intervals
- [ ] 5.4 Add 60-second timeout
- [ ] 5.5 Handle FindReferenceError (transaction not found yet)
- [ ] 5.6 Log monitoring progress to console

## 6. Payment Validation
- [ ] 6.1 Validate USDC payment using `validateTransfer`
- [ ] 6.2 Validate SOL payment using `validateTransfer`
- [ ] 6.3 Check recipient matches merchant wallet
- [ ] 6.4 Check amount matches expected amount
- [ ] 6.5 Check reference matches generated reference
- [ ] 6.6 Handle validation errors

## 7. Backend Integration
- [ ] 7.1 Update payment API call to include reference field
- [ ] 7.2 Send transaction signature to backend
- [ ] 7.3 Send reference to backend for tracking
- [ ] 7.4 Handle backend response
- [ ] 7.5 Update payment status on success

## 8. UI Updates
- [ ] 8.1 Add devnet warning banner
- [ ] 8.2 Create QR code section for mobile payments
- [ ] 8.3 Add "OR" divider between QR and button
- [ ] 8.4 Update desktop pay button to open Solana Pay URL
- [ ] 8.5 Show monitoring status message
- [ ] 8.6 Update button text based on monitoring state
- [ ] 8.7 Disable button during monitoring

## 9. Auto-generate Payment Request
- [ ] 9.1 Add useEffect to generate payment request when Solana selected
- [ ] 9.2 Only generate if payment link loaded
- [ ] 9.3 Only generate once (check if reference exists)
- [ ] 9.4 Regenerate if chain or token changes

## 10. Remove Old Solana Code
- [ ] 10.1 Remove `connectSolanaWallet` function
- [ ] 10.2 Remove old `handleSolanaPayment` function
- [ ] 10.3 Remove `solanaWallet` state
- [ ] 10.4 Remove `solanaAddress` state
- [ ] 10.5 Remove `isConnectingSolana` state
- [ ] 10.6 Remove manual transaction building code
- [ ] 10.7 Remove ATA creation logic
- [ ] 10.8 Remove token transfer instruction code
- [ ] 10.9 Update button logic to remove Solana wallet connection

## 11. Configuration Updates
- [ ] 11.1 Update SOLANA_RPC constant to devnet
- [ ] 11.2 Update SOLANA_USDC_MINT to devnet mint
- [ ] 11.3 Update explorer URL to include devnet cluster parameter
- [ ] 11.4 Add environment variables for Solana config

## 12. Error Handling
- [ ] 12.1 Handle payment timeout (60 seconds)
- [ ] 12.2 Handle validation failures
- [ ] 12.3 Handle network errors
- [ ] 12.4 Handle user cancellation
- [ ] 12.5 Show user-friendly error messages
- [ ] 12.6 Add retry option for failed payments

## 13. Testing
- [ ] 13.1 Test QR code generation
- [ ] 13.2 Test QR code scanning with Phantom mobile
- [ ] 13.3 Test desktop wallet payment flow
- [ ] 13.4 Test payment monitoring and detection
- [ ] 13.5 Test payment validation
- [ ] 13.6 Test USDC payments
- [ ] 13.7 Test SOL payments (if supported)
- [ ] 13.8 Test timeout handling
- [ ] 13.9 Test validation failures
- [ ] 13.10 Test network errors
- [ ] 13.11 Test success flow end-to-end
- [ ] 13.12 Verify devnet transactions in explorer

## 14. Documentation
- [ ] 14.1 Add comments explaining Solana Pay flow
- [ ] 14.2 Document reference generation
- [ ] 14.3 Document monitoring logic
- [ ] 14.4 Document validation process
- [ ] 14.5 Add README section on Solana Pay integration

## 15. Cleanup
- [ ] 15.1 Remove unused imports
- [ ] 15.2 Remove commented code
- [ ] 15.3 Format code consistently
- [ ] 15.4 Run linter
- [ ] 15.5 Check for TypeScript errors
