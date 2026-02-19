# Solana Phantom Wallet Connection Fix - Tasks

## 1. Add Solana Wallet State Management
- [x] 1.1 Add `solanaWallet` state variable to store Phantom provider instance
- [x] 1.2 Add `solanaAddress` state variable to store connected public key
- [x] 1.3 Add `isConnectingSolana` state variable for connection loading state

## 2. Implement Phantom Connection Check
- [x] 2.1 Create `useEffect` hook to check for existing Phantom connection on component mount
- [x] 2.2 Check if Phantom is already connected using `phantomProvider.isConnected`
- [x] 2.3 Set initial state if wallet is already connected
- [x] 2.4 Add event listener for Phantom `accountChanged` event
- [x] 2.5 Handle account changes and disconnections

## 3. Create Separate Connection Function
- [x] 3.1 Extract wallet connection logic from `handleSolanaPayment` into new `connectSolanaWallet` function
- [x] 3.2 Implement Phantom provider detection (check `window.phantom?.solana` first)
- [x] 3.3 Call `phantomProvider.connect()` and wait for user approval
- [x] 3.4 Store wallet provider and public key in state on successful connection
- [x] 3.5 Add error handling for connection rejection
- [x] 3.6 Add error handling for Phantom not installed
- [x] 3.7 Set loading state during connection process

## 4. Update Payment Function
- [x] 4.1 Remove wallet connection logic from `handleSolanaPayment`
- [x] 4.2 Add precondition checks for `solanaWallet` and `solanaAddress`
- [x] 4.3 Use stored `solanaAddress` instead of connecting during payment
- [x] 4.4 Use stored `solanaWallet` provider for signing transaction
- [x] 4.5 Update error messages to be more user-friendly
- [x] 4.6 Add specific error handling for transaction rejection

## 5. Update Button Logic
- [x] 5.1 Create `getButtonText()` helper function to determine button text based on state
- [x] 5.2 Create `getButtonAction()` helper function to determine button onClick handler
- [x] 5.3 Update button to show "Connect Wallet" when Solana selected and not connected
- [x] 5.4 Update button to show "Pay X USDC" when Solana selected and connected
- [x] 5.5 Update button disabled state to include `isConnectingSolana`
- [x] 5.6 Update button loading state to show during connection

## 6. Update UI to Show Connected Wallet
- [x] 6.1 Update wallet address display to show connected Solana address when available
- [x] 6.2 Show merchant wallet address as fallback when user not connected
- [x] 6.3 Format Solana addresses consistently (first 6 + last 4 chars)

## 7. Testing
- [x] 7.1 Test connection flow with Phantom not installed
- [x] 7.2 Test connection flow with Phantom installed but not connected
- [x] 7.3 Test connection flow with user approval
- [x] 7.4 Test connection flow with user rejection
- [x] 7.5 Test payment flow after successful connection
- [x] 7.6 Test payment flow with user rejecting transaction
- [x] 7.7 Test switching between Solana and EVM chains
- [x] 7.8 Test with Phantom already connected on page load
- [x] 7.9 Test account switching in Phantom
- [x] 7.10 Test disconnecting Phantom wallet

## 8. Cleanup and Documentation
- [x] 8.1 Remove any duplicate or unused code
- [x] 8.2 Add console.log statements for debugging
- [x] 8.3 Ensure all error messages are user-friendly
- [x] 8.4 Verify TypeScript types are correct
- [x] 8.5 Test on testnet before deploying
