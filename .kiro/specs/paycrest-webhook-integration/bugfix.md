# Bugfix Requirements Document

## Introduction

The offramp (crypto-to-fiat withdrawal) feature incorrectly uses Blockradar webhooks to track order status instead of Paycrest webhooks. This causes the application to track only the blockchain withdrawal transaction rather than the complete offramp process including fiat settlement. Since Paycrest handles the actual bank transfer and fiat settlement, it should be the authoritative source for offramp order status updates.

This bug affects the reliability of offramp status tracking, as Blockradar only knows when funds leave the custody wallet, not when the recipient receives fiat in their bank account or if the order expires or requires refund.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an offramp order is created and funds are withdrawn via Blockradar THEN the system listens for Blockradar webhook events (withdrawal.success, withdrawal.failed) to update offramp_orders status

1.2 WHEN a Blockradar withdrawal.success webhook is received THEN the system updates the offramp order status based on Blockradar transaction completion, not Paycrest settlement status

1.3 WHEN webhook signature verification occurs THEN the system uses HMAC-SHA512 with BLOCKRADAR_API_KEY instead of HMAC-SHA256 with PAYCREST_API_SECRET

1.4 WHEN Paycrest order status changes (validated, expired, settled, refunded) occur THEN the system does not receive or process these status updates because no Paycrest webhook handler exists

### Expected Behavior (Correct)

2.1 WHEN an offramp order is created through Paycrest THEN the system SHALL listen for Paycrest webhook events (payment_order.pending, payment_order.validated, payment_order.expired, payment_order.settled, payment_order.refunded) to update offramp_orders status

2.2 WHEN a Paycrest payment_order.validated webhook is received THEN the system SHALL update the offramp order status to reflect that funds were successfully sent to the recipient's bank account

2.3 WHEN webhook signature verification occurs for Paycrest webhooks THEN the system SHALL use HMAC-SHA256 with PAYCREST_API_SECRET for signature validation

2.4 WHEN Paycrest order status changes occur (validated, expired, settled, refunded) THEN the system SHALL process these webhook events and update the offramp_orders table accordingly

2.5 WHEN a Paycrest payment_order.expired webhook is received THEN the system SHALL update the offramp order status to expired

2.6 WHEN a Paycrest payment_order.settled webhook is received THEN the system SHALL update the offramp order status to settled (fully completed on blockchain)

2.7 WHEN a Paycrest payment_order.refunded webhook is received THEN the system SHALL update the offramp order status to refunded

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an offramp order is created through the frontend THEN the system SHALL CONTINUE TO create a Paycrest order via PaycrestService

3.2 WHEN a Paycrest order is created THEN the system SHALL CONTINUE TO withdraw funds from Blockradar wallet to the Paycrest receive address

3.3 WHEN Blockradar webhooks are received for non-offramp operations THEN the system SHALL CONTINUE TO process them correctly

3.4 WHEN offramp order data is queried THEN the system SHALL CONTINUE TO return order information from the offramp_orders table
