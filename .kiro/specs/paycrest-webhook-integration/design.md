# Paycrest Webhook Integration Bugfix Design

## Overview

The offramp feature currently uses Blockradar webhooks to track order status, but this is incorrect because Blockradar only knows when funds leave the custody wallet, not when the recipient receives fiat in their bank account. Since Paycrest handles the actual bank transfer and fiat settlement, it should be the authoritative source for offramp order status updates.

This bug causes unreliable status tracking because the system updates offramp_orders status based on Blockradar withdrawal events (withdrawal.success, withdrawal.failed) instead of Paycrest settlement events (payment_order.validated, payment_order.settled, payment_order.expired, payment_order.refunded). While a Paycrest webhook handler exists, the Blockradar webhook handler incorrectly processes offramp status updates.

The fix involves removing offramp status handling from the Blockradar webhook handler and ensuring only the Paycrest webhook handler updates offramp_orders status based on Paycrest events.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when Blockradar withdrawal webhooks attempt to update offramp order status
- **Property (P)**: The desired behavior - only Paycrest webhooks should update offramp order status based on fiat settlement events
- **Preservation**: Existing Blockradar webhook handling for non-offramp operations (deposits, payment link withdrawals) must remain unchanged
- **handleWithdrawal**: The function in `hedwig-backend/src/routes/blockradarWebhook.ts` that processes withdrawal.success webhooks and incorrectly updates offramp_orders status
- **handleWithdrawalFailed**: The function in `hedwig-backend/src/routes/blockradarWebhook.ts` that processes withdrawal.failed webhooks and incorrectly updates offramp_orders status
- **Paycrest Webhook Handler**: The existing handler in `hedwig-backend/src/routes/paycrestWebhook.ts` that correctly processes Paycrest order status events
- **offramp_orders**: Database table storing offramp order records with status tracking
- **metadata.offrampOrderId**: Metadata field in Blockradar withdrawal requests that identifies offramp-related withdrawals

## Bug Details

### Fault Condition

The bug manifests when a Blockradar withdrawal webhook (withdrawal.success or withdrawal.failed) is received for an offramp order. The handleWithdrawal and handleWithdrawalFailed functions check for metadata.offrampOrderId and update the offramp_orders table status based on Blockradar events, which only indicate blockchain transaction completion, not fiat settlement status.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type BlockradarWebhookEvent
  OUTPUT: boolean
  
  RETURN (input.eventType IN ['withdrawal.success', 'withdrawal.confirmed', 'withdrawal.failed'])
         AND input.data.metadata.offrampOrderId EXISTS
         AND offrampOrderStatusUpdateAttempted(input)
END FUNCTION
```

### Examples

- **Example 1**: User creates offramp order → Blockradar withdraws USDC to Paycrest → withdrawal.success webhook received → handleWithdrawal updates offramp_orders.status to 'PROCESSING' → Paycrest order expires before settlement → User never receives fiat but order shows 'PROCESSING' instead of 'FAILED'

- **Example 2**: User creates offramp order → Blockradar withdrawal fails → withdrawal.failed webhook received → handleWithdrawalFailed updates offramp_orders.status to 'FAILED' → User sees 'FAILED' status → Blockradar retries withdrawal successfully → Paycrest settles order → User receives fiat but order still shows 'FAILED'

- **Example 3**: User creates offramp order → Blockradar withdraws USDC → withdrawal.success webhook updates status to 'PROCESSING' → Paycrest validates and settles order → payment_order.settled webhook updates status to 'COMPLETED' → Status is correct but went through unnecessary intermediate state

- **Edge Case**: Blockradar withdrawal succeeds but Paycrest webhook is delayed → User sees 'PROCESSING' status from Blockradar webhook → Eventually Paycrest webhook arrives and updates to correct status → Temporary incorrect status display

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Blockradar deposit webhooks (deposit.success, deposit.confirmed) must continue to update user balances and create transaction records
- Blockradar payment link deposit webhooks must continue to trigger auto-withdrawal flow for invoice payments
- Blockradar sweep webhooks (sweep.success, sweep.failed) must continue to be logged
- Blockradar webhook signature verification using HMAC-SHA512 with BLOCKRADAR_API_KEY must remain unchanged
- Paycrest webhook handler must continue to process all Paycrest order status events
- Offramp order creation flow (POST /api/offramp/create) must continue to create Paycrest orders and initiate Blockradar withdrawals

**Scope:**
All Blockradar webhook events that do NOT involve offramp order status updates should be completely unaffected by this fix. This includes:
- Deposit events for user balance updates
- Payment link deposit events for invoice settlement
- Sweep events for wallet management
- Any future Blockradar webhook event types

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is:

1. **Incorrect Responsibility Assignment**: The handleWithdrawal and handleWithdrawalFailed functions were designed to handle all withdrawal events, including offramp withdrawals. However, offramp withdrawals are just the first step in a multi-stage process (blockchain withdrawal → Paycrest receives funds → bank transfer → fiat settlement). Blockradar only knows about the first step.

2. **Premature Status Updates**: When withdrawal.success is received, the code updates offramp_orders.status to 'PROCESSING', but this doesn't reflect the actual offramp status. The order could still expire, be refunded, or fail at the Paycrest settlement stage.

3. **Conflicting Status Sources**: Both Blockradar and Paycrest webhooks attempt to update offramp_orders.status, creating a race condition where the wrong status source might win depending on webhook delivery timing.

4. **Legacy Design**: The offramp feature was likely added after the Blockradar webhook handler was created, and the handler was extended to support offramp without recognizing that offramp requires different status tracking logic.

## Correctness Properties

Property 1: Fault Condition - Blockradar Webhooks Do Not Update Offramp Status

_For any_ Blockradar webhook event where the event type is withdrawal.success, withdrawal.confirmed, or withdrawal.failed AND the withdrawal metadata contains an offrampOrderId, the fixed webhook handler SHALL NOT update the offramp_orders table status, allowing only Paycrest webhooks to control offramp order status.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

Property 2: Preservation - Non-Offramp Blockradar Webhooks Continue Working

_For any_ Blockradar webhook event that is NOT related to offramp order status updates (deposits, payment link deposits, sweeps, non-offramp withdrawals), the fixed webhook handler SHALL produce exactly the same behavior as the original handler, preserving all existing functionality for non-offramp operations.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `hedwig-backend/src/routes/blockradarWebhook.ts`

**Function**: `handleWithdrawal` (Line 654)

**Specific Changes**:
1. **Remove Offramp Status Update Logic**: Delete the code block that checks for metadata.offrampOrderId and updates offramp_orders status to 'PROCESSING'
   - Remove lines that query offramp_orders table
   - Remove lines that update status and tx_hash
   - Remove logging related to offramp order updates

2. **Add Explanatory Comment**: Add a comment explaining that offramp order status is managed by Paycrest webhooks, not Blockradar webhooks

3. **Preserve Withdrawal Logging**: Keep any general withdrawal logging that doesn't involve offramp status updates

**Function**: `handleWithdrawalFailed` (Line 682)

**Specific Changes**:
1. **Remove Offramp Status Update Logic**: Delete the code block that checks for metadata.offrampOrderId and updates offramp_orders status to 'FAILED'
   - Remove lines that query offramp_orders table
   - Remove lines that update status and error_message
   - Remove lines that create failure notifications

2. **Add Explanatory Comment**: Add a comment explaining that offramp failures are managed by Paycrest webhooks (payment_order.expired, payment_order.refunded)

3. **Preserve Withdrawal Failure Logging**: Keep any general withdrawal failure logging that doesn't involve offramp status updates

**No Changes Required**:
- Paycrest webhook handler (`hedwig-backend/src/routes/paycrestWebhook.ts`) already correctly handles all Paycrest order status events
- Offramp creation endpoint (`hedwig-backend/src/routes/offramp.ts`) already correctly creates Paycrest orders and initiates Blockradar withdrawals
- Blockradar withdrawal initiation in offramp.ts already includes metadata.offrampOrderId for tracking purposes (this is fine, just don't use it for status updates in webhook handler)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code by observing incorrect status updates from Blockradar webhooks, then verify the fix prevents Blockradar from updating offramp status while preserving all other webhook functionality.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that Blockradar webhooks incorrectly update offramp order status.

**Test Plan**: Create test cases that simulate Blockradar withdrawal webhooks with offramp metadata and observe that the UNFIXED code incorrectly updates offramp_orders status. Also test scenarios where Paycrest status differs from Blockradar status to demonstrate the conflict.

**Test Cases**:
1. **Blockradar Success Updates Offramp Status**: Send withdrawal.success webhook with metadata.offrampOrderId → Observe offramp_orders.status updated to 'PROCESSING' (will fail on unfixed code - demonstrates bug)
2. **Blockradar Failure Updates Offramp Status**: Send withdrawal.failed webhook with metadata.offrampOrderId → Observe offramp_orders.status updated to 'FAILED' (will fail on unfixed code - demonstrates bug)
3. **Status Conflict Scenario**: Send withdrawal.success webhook → Status becomes 'PROCESSING' → Send payment_order.expired webhook → Status becomes 'FAILED' → Demonstrates that Blockradar status was incorrect (will fail on unfixed code)
4. **Premature Success Status**: Send withdrawal.success webhook → Status becomes 'PROCESSING' → Paycrest order actually expires before settlement → Demonstrates incorrect status tracking (will fail on unfixed code)

**Expected Counterexamples**:
- Offramp order status is updated by Blockradar webhooks when it should only be updated by Paycrest webhooks
- Status shows 'PROCESSING' after Blockradar withdrawal but before Paycrest settlement, which doesn't reflect true offramp status
- Status conflicts occur when Blockradar and Paycrest webhooks provide different status information

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (Blockradar withdrawal webhooks with offramp metadata), the fixed function does NOT update offramp_orders status.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handleBlockradarWebhook_fixed(input)
  ASSERT offrampOrderStatusNotUpdated(result)
  ASSERT onlyPaycrestWebhooksUpdateOfframpStatus()
END FOR
```

**Test Cases**:
1. **Blockradar Success Does Not Update Status**: Send withdrawal.success webhook with metadata.offrampOrderId → Verify offramp_orders.status is NOT updated → Verify no database queries to offramp_orders table
2. **Blockradar Failure Does Not Update Status**: Send withdrawal.failed webhook with metadata.offrampOrderId → Verify offramp_orders.status is NOT updated → Verify no failure notifications created
3. **Paycrest Webhooks Still Work**: Send payment_order.validated webhook → Verify offramp_orders.status IS updated to 'PROCESSING' → Confirms Paycrest handler still works
4. **Status Flow Correctness**: Create offramp order → Send withdrawal.success (no status change) → Send payment_order.validated (status → 'PROCESSING') → Send payment_order.settled (status → 'COMPLETED') → Verify correct status progression

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (non-offramp Blockradar webhooks), the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleBlockradarWebhook_original(input) = handleBlockradarWebhook_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-offramp webhook events

**Test Plan**: Observe behavior on UNFIXED code first for deposits, payment link deposits, and sweeps, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Deposit Webhooks Preserved**: Send deposit.success webhook → Verify user balance updated → Verify transaction record created → Verify notification sent (same as unfixed code)
2. **Payment Link Deposit Preserved**: Send deposit.success webhook with metadata.documentId → Verify document marked as PAID → Verify auto-withdrawal initiated → Verify milestone updated (same as unfixed code)
3. **Sweep Webhooks Preserved**: Send sweep.success webhook → Verify event logged correctly (same as unfixed code)
4. **Non-Offramp Withdrawal Preserved**: Send withdrawal.success webhook WITHOUT metadata.offrampOrderId → Verify handled correctly (same as unfixed code)
5. **Signature Verification Preserved**: Send webhook with invalid signature → Verify rejected with 401 (same as unfixed code)

### Unit Tests

- Test handleWithdrawal with offramp metadata does not update offramp_orders
- Test handleWithdrawalFailed with offramp metadata does not update offramp_orders
- Test handleWithdrawal without offramp metadata continues to work
- Test handleDeposit continues to update user balances
- Test handlePaymentLinkDeposit continues to trigger auto-withdrawal
- Test webhook signature verification continues to work

### Property-Based Tests

- Generate random Blockradar webhook events with offramp metadata and verify no offramp status updates occur
- Generate random Blockradar webhook events without offramp metadata and verify behavior matches original implementation
- Generate random Paycrest webhook events and verify offramp status updates occur correctly
- Test that all deposit webhook variations continue to work across many scenarios

### Integration Tests

- Test full offramp flow: create order → Blockradar withdrawal → Paycrest settlement → verify status progression
- Test offramp expiration flow: create order → Blockradar withdrawal → Paycrest expiration → verify status shows 'FAILED'
- Test offramp refund flow: create order → Blockradar withdrawal → Paycrest refund → verify status shows 'FAILED'
- Test payment link flow with auto-withdrawal continues to work end-to-end
- Test deposit flow continues to update balances correctly
