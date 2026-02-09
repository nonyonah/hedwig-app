# Solana Auto-Withdrawal Issue - RESOLVED

## Problem (FIXED)
The system was only using the Base wallet ID and not fetching assets from the Solana wallet, even though `BLOCKRADAR_SOLANA_WALLET_ID` was configured.

## Root Cause
The Blockradar service was hardcoded to only use `BLOCKRADAR_BASE_WALLET_ID` for all operations, ignoring the Solana wallet entirely.

## Solution Implemented
Updated the Blockradar service to support both Base and Solana wallets:

1. **Added Solana wallet ID support**:
   - Read `BLOCKRADAR_SOLANA_WALLET_ID` from environment variables
   - Added `getWalletId()` helper method to select correct wallet based on network

2. **Updated `getAssets()` method**:
   - Now fetches assets from BOTH Base and Solana wallets
   - Combines assets from both wallets into a single list
   - This ensures Solana USDC asset is available for detection

3. **Updated `withdraw()` method**:
   - Added `isSolana` parameter to `WithdrawParams` interface
   - Uses correct wallet ID (Base or Solana) based on the `isSolana` flag
   - Logs which network and wallet is being used

4. **Updated webhook handler**:
   - Passes `isSolana` flag to the withdraw method
   - System now correctly routes withdrawals to the appropriate wallet

## How It Works Now

### Asset Detection Flow:
1. Webhook receives payment with asset ID (e.g., Solana USDC)
2. System fetches assets from BOTH Base and Solana wallets
3. Finds matching asset by ID
4. Detects network from asset's blockchain data
5. Uses correct wallet address (Solana or EVM) for withdrawal

### Withdrawal Flow:
1. Determine if payment is Solana or EVM based on asset
2. Select correct destination address (Solana wallet or EVM wallet)
3. Call `withdraw()` with `isSolana` flag
4. Service uses correct Blockradar wallet ID (Solana or Base)
5. Withdrawal succeeds on the correct network

## Configuration Required
Ensure both wallet IDs are set in `.env`:
```
BLOCKRADAR_BASE_WALLET_ID=d58db97d-9ff7-4360-ba35-ddf5d8659742
BLOCKRADAR_SOLANA_WALLET_ID=7960cec4-2f5b-4dde-9693-8602ff0ffa86
```

## Testing
After deploying these changes:
1. Create a payment link
2. Pay with Solana USDC
3. System should:
   - Detect Solana network from asset
   - Use Solana wallet address for withdrawal
   - Withdraw from Solana wallet (not Base wallet)
   - Successfully complete auto-withdrawal

## Files Modified
- `hedwig-backend/src/services/blockradar.ts` - Added Solana wallet support
- `hedwig-backend/src/routes/blockradarWebhook.ts` - Pass isSolana flag to withdraw
