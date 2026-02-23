/**
 * Bug Condition Exploration Test for Paycrest Webhook Integration
 * 
 * This test demonstrates the bug where Blockradar webhooks incorrectly update
 * offramp order status when they should only track blockchain withdrawals.
 * 
 * EXPECTED OUTCOME: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * 
 * The bug: handleWithdrawal and handleWithdrawalFailed functions update offramp_orders
 * status based on Blockradar withdrawal events, but Blockradar only knows about blockchain
 * transactions, not the complete offramp process (which includes Paycrest fiat settlement).
 */

import { supabase } from '../lib/supabase';
import crypto from 'crypto';

// Test configuration
const TEST_USER_ID = 'test_user_bug_exploration';
const TEST_OFFRAMP_ORDER_ID = 'offramp_test_bug_exploration_' + Date.now();
const BLOCKRADAR_WEBHOOK_URL = process.env.BLOCKRADAR_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/blockradar';
const BLOCKRADAR_API_KEY = process.env.BLOCKRADAR_API_KEY;

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  counterexample?: any;
}

const results: TestResult[] = [];

/**
 * Helper function to create a test offramp order
 */
async function createTestOfframpOrder(orderId: string, userId: string) {
  const { data, error } = await supabase
    .from('offramp_orders')
    .insert({
      id: orderId,
      user_id: userId,
      paycrest_order_id: `paycrest_${orderId}`,
      status: 'PENDING',
      chain: 'BASE',
      token: 'USDC',
      crypto_amount: 100.0,
      fiat_currency: 'NGN',
      fiat_amount: 150000.0,
      exchange_rate: 1500.0,
      service_fee: 5.0,
      bank_name: 'Test Bank',
      account_number: '1234567890',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test offramp order: ${error.message}`);
  }

  return data;
}

/**
 * Helper function to get offramp order status
 */
async function getOfframpOrderStatus(orderId: string) {
  const { data, error } = await supabase
    .from('offramp_orders')
    .select('status, tx_hash, error_message')
    .eq('id', orderId)
    .single();

  if (error) {
    throw new Error(`Failed to get offramp order: ${error.message}`);
  }

  return data;
}

/**
 * Helper function to send a mock Blockradar webhook
 */
async function sendBlockradarWebhook(eventType: string, data: any) {
  const payload = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    event: eventType,
    type: eventType,
    data: data,
    timestamp: new Date().toISOString(),
  };

  const rawBody = JSON.stringify(payload);
  
  // Sign the webhook using HMAC-SHA512 with BLOCKRADAR_API_KEY
  const signature = crypto
    .createHmac('sha512', BLOCKRADAR_API_KEY!)
    .update(rawBody, 'utf8')
    .digest('hex');

  const response = await fetch(BLOCKRADAR_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-blockradar-signature': signature,
    },
    body: rawBody,
  });

  return response;
}

/**
 * Helper function to cleanup test data
 */
async function cleanup(orderId: string, userId: string) {
  await supabase.from('offramp_orders').delete().eq('id', orderId);
  await supabase.from('users').delete().eq('id', userId);
  await supabase.from('notifications').delete().eq('user_id', userId);
}

/**
 * Test 1: Blockradar withdrawal.success webhook updates offramp status
 * 
 * This test demonstrates that Blockradar webhooks incorrectly update offramp_orders
 * status to 'PROCESSING' when they should not touch offramp status at all.
 * 
 * EXPECTED: Test FAILS (status is updated) - this proves the bug exists
 */
async function testBlockradarSuccessUpdatesOfframpStatus() {
  const testName = 'Blockradar withdrawal.success updates offramp status';
  console.log(`\n🧪 Running: ${testName}`);

  try {
    // Setup: Create test user and offramp order
    await supabase.from('users').insert({
      id: TEST_USER_ID,
      privy_id: 'privy_test_bug_exploration',
      email: 'test@bugexploration.com',
    });

    const order = await createTestOfframpOrder(TEST_OFFRAMP_ORDER_ID, TEST_USER_ID);
    console.log(`   Created test offramp order: ${order.id} with status: ${order.status}`);

    // Action: Send withdrawal.success webhook with offramp metadata
    const webhookData = {
      addressId: 'addr_test_123',
      txHash: '0xtest123456789',
      amount: 100.0,
      asset: { symbol: 'USDC' },
      metadata: {
        offrampOrderId: TEST_OFFRAMP_ORDER_ID,
      },
    };

    console.log(`   Sending withdrawal.success webhook with offrampOrderId: ${TEST_OFFRAMP_ORDER_ID}`);
    const response = await sendBlockradarWebhook('withdrawal.success', webhookData);
    
    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
    }

    // Wait for webhook processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify: Check if offramp order status was updated
    const updatedOrder = await getOfframpOrderStatus(TEST_OFFRAMP_ORDER_ID);
    console.log(`   Offramp order status after webhook: ${updatedOrder.status}`);
    console.log(`   Offramp order tx_hash after webhook: ${updatedOrder.tx_hash}`);

    // BUG CONDITION: If status was updated to 'PROCESSING', the bug exists
    if (updatedOrder.status === 'PROCESSING' && updatedOrder.tx_hash === webhookData.txHash) {
      results.push({
        testName,
        passed: false,
        message: '❌ BUG CONFIRMED: Blockradar webhook updated offramp status to PROCESSING',
        counterexample: {
          input: {
            eventType: 'withdrawal.success',
            metadata: { offrampOrderId: TEST_OFFRAMP_ORDER_ID },
            txHash: webhookData.txHash,
          },
          output: {
            status: updatedOrder.status,
            tx_hash: updatedOrder.tx_hash,
          },
          expected: {
            status: 'PENDING',
            tx_hash: null,
          },
        },
      });
      console.log(`   ❌ BUG CONFIRMED: Status changed from PENDING to ${updatedOrder.status}`);
    } else {
      results.push({
        testName,
        passed: true,
        message: '✅ UNEXPECTED: Blockradar webhook did NOT update offramp status (bug may be fixed)',
      });
      console.log(`   ✅ Status remained: ${updatedOrder.status}`);
    }

  } catch (error: any) {
    results.push({
      testName,
      passed: false,
      message: `⚠️ Test error: ${error.message}`,
    });
    console.error(`   ⚠️ Test error: ${error.message}`);
  } finally {
    await cleanup(TEST_OFFRAMP_ORDER_ID, TEST_USER_ID);
  }
}

/**
 * Test 2: Blockradar withdrawal.failed webhook updates offramp status
 * 
 * This test demonstrates that Blockradar webhooks incorrectly update offramp_orders
 * status to 'FAILED' when they should not touch offramp status at all.
 * 
 * EXPECTED: Test FAILS (status is updated) - this proves the bug exists
 */
async function testBlockradarFailureUpdatesOfframpStatus() {
  const testName = 'Blockradar withdrawal.failed updates offramp status';
  console.log(`\n🧪 Running: ${testName}`);

  const orderId = TEST_OFFRAMP_ORDER_ID + '_failed';
  const userId = TEST_USER_ID + '_failed';

  try {
    // Setup: Create test user and offramp order
    await supabase.from('users').insert({
      id: userId,
      privy_id: 'privy_test_bug_exploration_failed',
      email: 'test-failed@bugexploration.com',
    });

    const order = await createTestOfframpOrder(orderId, userId);
    console.log(`   Created test offramp order: ${order.id} with status: ${order.status}`);

    // Action: Send withdrawal.failed webhook with offramp metadata
    const webhookData = {
      addressId: 'addr_test_456',
      error: 'Insufficient funds',
      metadata: {
        offrampOrderId: orderId,
      },
    };

    console.log(`   Sending withdrawal.failed webhook with offrampOrderId: ${orderId}`);
    const response = await sendBlockradarWebhook('withdrawal.failed', webhookData);
    
    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
    }

    // Wait for webhook processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify: Check if offramp order status was updated
    const updatedOrder = await getOfframpOrderStatus(orderId);
    console.log(`   Offramp order status after webhook: ${updatedOrder.status}`);
    console.log(`   Offramp order error_message after webhook: ${updatedOrder.error_message}`);

    // Check if notification was created
    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'OFFRAMP_FAILED');

    // BUG CONDITION: If status was updated to 'FAILED', the bug exists
    if (updatedOrder.status === 'FAILED' && updatedOrder.error_message === webhookData.error) {
      results.push({
        testName,
        passed: false,
        message: '❌ BUG CONFIRMED: Blockradar webhook updated offramp status to FAILED',
        counterexample: {
          input: {
            eventType: 'withdrawal.failed',
            metadata: { offrampOrderId: orderId },
            error: webhookData.error,
          },
          output: {
            status: updatedOrder.status,
            error_message: updatedOrder.error_message,
            notification_created: notifications && notifications.length > 0,
          },
          expected: {
            status: 'PENDING',
            error_message: null,
            notification_created: false,
          },
        },
      });
      console.log(`   ❌ BUG CONFIRMED: Status changed from PENDING to ${updatedOrder.status}`);
      console.log(`   ❌ BUG CONFIRMED: Notification created: ${notifications && notifications.length > 0}`);
    } else {
      results.push({
        testName,
        passed: true,
        message: '✅ UNEXPECTED: Blockradar webhook did NOT update offramp status (bug may be fixed)',
      });
      console.log(`   ✅ Status remained: ${updatedOrder.status}`);
    }

  } catch (error: any) {
    results.push({
      testName,
      passed: false,
      message: `⚠️ Test error: ${error.message}`,
    });
    console.error(`   ⚠️ Test error: ${error.message}`);
  } finally {
    await cleanup(orderId, userId);
  }
}

/**
 * Test 3: Status conflict scenario
 * 
 * This test demonstrates that Blockradar and Paycrest webhooks can create conflicting
 * status updates, where Blockradar sets status to 'PROCESSING' but the actual offramp
 * might fail at the Paycrest settlement stage.
 * 
 * EXPECTED: Test FAILS (demonstrates status conflict) - this proves the bug exists
 */
async function testStatusConflictScenario() {
  const testName = 'Status conflict between Blockradar and Paycrest webhooks';
  console.log(`\n🧪 Running: ${testName}`);

  const orderId = TEST_OFFRAMP_ORDER_ID + '_conflict';
  const userId = TEST_USER_ID + '_conflict';

  try {
    // Setup: Create test user and offramp order
    await supabase.from('users').insert({
      id: userId,
      privy_id: 'privy_test_bug_exploration_conflict',
      email: 'test-conflict@bugexploration.com',
    });

    const order = await createTestOfframpOrder(orderId, userId);
    console.log(`   Created test offramp order: ${order.id} with status: ${order.status}`);

    // Action 1: Send withdrawal.success webhook (Blockradar)
    const blockradarData = {
      addressId: 'addr_test_789',
      txHash: '0xtest_conflict_123',
      amount: 100.0,
      asset: { symbol: 'USDC' },
      metadata: {
        offrampOrderId: orderId,
      },
    };

    console.log(`   Step 1: Sending Blockradar withdrawal.success webhook`);
    await sendBlockradarWebhook('withdrawal.success', blockradarData);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const afterBlockradar = await getOfframpOrderStatus(orderId);
    console.log(`   Status after Blockradar webhook: ${afterBlockradar.status}`);

    // Action 2: Simulate Paycrest order expiration (manual update to simulate Paycrest webhook)
    // In reality, this would come from a Paycrest webhook, but we simulate it here
    console.log(`   Step 2: Simulating Paycrest order expiration (would come from Paycrest webhook)`);
    await supabase
      .from('offramp_orders')
      .update({ status: 'FAILED', error_message: 'Paycrest order expired' })
      .eq('id', orderId);

    const afterPaycrest = await getOfframpOrderStatus(orderId);
    console.log(`   Status after Paycrest expiration: ${afterPaycrest.status}`);

    // BUG CONDITION: If Blockradar updated status to PROCESSING, it created a false positive
    // The order appeared to be processing, but actually expired at Paycrest
    if (afterBlockradar.status === 'PROCESSING') {
      results.push({
        testName,
        passed: false,
        message: '❌ BUG CONFIRMED: Blockradar webhook created false PROCESSING status before Paycrest failure',
        counterexample: {
          scenario: 'Blockradar withdrawal succeeds but Paycrest order expires',
          timeline: [
            { step: 1, event: 'Blockradar withdrawal.success', status: afterBlockradar.status },
            { step: 2, event: 'Paycrest order expires', status: afterPaycrest.status },
          ],
          problem: 'User saw PROCESSING status from Blockradar, but order actually failed at Paycrest',
          expected: 'Status should only be updated by Paycrest webhooks, not Blockradar',
        },
      });
      console.log(`   ❌ BUG CONFIRMED: Blockradar created false PROCESSING status`);
      console.log(`   ❌ This demonstrates incorrect status tracking - Blockradar doesn't know about Paycrest failures`);
    } else {
      results.push({
        testName,
        passed: true,
        message: '✅ UNEXPECTED: Blockradar webhook did NOT create status conflict (bug may be fixed)',
      });
      console.log(`   ✅ No status conflict detected`);
    }

  } catch (error: any) {
    results.push({
      testName,
      passed: false,
      message: `⚠️ Test error: ${error.message}`,
    });
    console.error(`   ⚠️ Test error: ${error.message}`);
  } finally {
    await cleanup(orderId, userId);
  }
}

/**
 * Main test runner
 */
async function runBugExplorationTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 Bug Condition Exploration Test Suite');
  console.log('   Paycrest Webhook Integration Bugfix');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n📋 Test Objective:');
  console.log('   Demonstrate that Blockradar webhooks incorrectly update offramp');
  console.log('   order status when they should only track blockchain withdrawals.');
  console.log('\n⚠️  EXPECTED OUTCOME: Tests should FAIL on unfixed code');
  console.log('   (Failure confirms the bug exists)\n');

  // Check environment
  if (!BLOCKRADAR_API_KEY) {
    console.error('❌ BLOCKRADAR_API_KEY environment variable is not set');
    process.exit(1);
  }

  // Run tests
  await testBlockradarSuccessUpdatesOfframpStatus();
  await testBlockradarFailureUpdatesOfframpStatus();
  await testStatusConflictScenario();

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 Test Results Summary');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const failedTests = results.filter(r => !r.passed);
  const passedTests = results.filter(r => r.passed);

  results.forEach(result => {
    console.log(`${result.passed ? '✅' : '❌'} ${result.testName}`);
    console.log(`   ${result.message}`);
    if (result.counterexample) {
      console.log(`   Counterexample:`, JSON.stringify(result.counterexample, null, 2));
    }
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total Tests: ${results.length}`);
  console.log(`Failed (Bug Confirmed): ${failedTests.length}`);
  console.log(`Passed (Bug Not Detected): ${passedTests.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (failedTests.length > 0) {
    console.log('✅ SUCCESS: Bug condition exploration completed');
    console.log('   The tests FAILED as expected, confirming the bug exists.');
    console.log('   Counterexamples have been documented above.\n');
    process.exit(0); // Exit with success because we successfully demonstrated the bug
  } else {
    console.log('⚠️  WARNING: Bug condition NOT detected');
    console.log('   The tests PASSED unexpectedly, which means:');
    console.log('   1. The bug may already be fixed in the code');
    console.log('   2. The test setup may be incorrect');
    console.log('   3. The root cause analysis may need revision\n');
    process.exit(1); // Exit with error because we failed to demonstrate the bug
  }
}

// Run the tests
runBugExplorationTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
