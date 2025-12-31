// Paycrest Webhook Edge Function
// Handles order status updates from Paycrest offramp provider

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Types
interface PaycrestWebhookPayload {
  event: string;
  data: {
    id: string;
    txHash?: string;
    reason?: string;
  };
}

interface OrderData {
  id: string;
  status: string;
  fiat_amount: number;
  fiat_currency: string;
  bank_name?: string;
  account_number?: string;
  users?: {
    privy_id: string;
    email: string;
  };
}

// Map Paycrest status events to our status
const mapPaycrestStatus = (event: string): string => {
  switch (event) {
    case 'order.initiated':
    case 'order.pending':
      return 'PENDING';
    case 'order.validated':
      return 'PROCESSING';
    case 'order.settled':
      return 'COMPLETED';
    case 'order.refunded':
    case 'order.expired':
      return 'FAILED';
    default:
      return 'PENDING';
  }
};

// Get user-friendly status message
const getStatusMessage = (event: string, amount: number, currency: string): { title: string; body: string } => {
  switch (event) {
    case 'order.initiated':
      return {
        title: '💰 Withdrawal Started',
        body: `Your withdrawal of ${amount.toFixed(2)} ${currency} has been initiated.`
      };
    case 'order.pending':
      return {
        title: '⏳ Processing Withdrawal',
        body: `Your withdrawal is being processed by our provider.`
      };
    case 'order.validated':
      return {
        title: '✅ Withdrawal Validated',
        body: `Your withdrawal has been validated and will be settled shortly.`
      };
    case 'order.settled':
      return {
        title: '🎉 Withdrawal Complete!',
        body: `${amount.toFixed(2)} ${currency} has been sent to your bank account.`
      };
    case 'order.refunded':
      return {
        title: '↩️ Withdrawal Refunded',
        body: `Your withdrawal was refunded. Funds have been returned to your wallet.`
      };
    case 'order.expired':
      return {
        title: '⏰ Withdrawal Expired',
        body: `Your withdrawal order has expired. Please try again.`
      };
    default:
      return {
        title: 'Withdrawal Update',
        body: `Status: ${event}`
      };
  }
};

// Verify Paycrest webhook signature using HMAC-SHA256
async function verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  if (!secret) {
    console.warn('[PaycrestWebhook] No webhook secret configured');
    return true;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureArrayBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  
  const expectedSignature = Array.from(new Uint8Array(signatureArrayBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signature === expectedSignature;
}

// Send push notification via Expo
async function sendPushNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  // Get user's push token
  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('privy_id', userId)
    .single();

  if (!user?.push_token) {
    console.log('[PaycrestWebhook] No push token for user:', userId);
    return;
  }

  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (!expoToken) {
    console.warn('[PaycrestWebhook] No Expo access token configured');
    return;
  }

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expoToken}`,
      },
      body: JSON.stringify({
        to: user.push_token,
        title,
        body,
        data,
        sound: 'default',
        priority: 'high',
      }),
    });
    console.log('[PaycrestWebhook] Push notification sent');
  } catch (error) {
    console.error('[PaycrestWebhook] Failed to send push:', error);
  }
}

Deno.serve(async (req) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-paycrest-signature') || '';
    const webhookSecret = Deno.env.get('PAYCREST_WEBHOOK_SECRET') || '';

    // Verify signature in production
    const isProd = Deno.env.get('ENVIRONMENT') === 'production';
    if (isProd) {
      if (!webhookSecret) {
        console.error('[PaycrestWebhook] No webhook secret in production!');
        return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!signature) {
        return new Response(JSON.stringify({ error: 'Missing signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!await verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const payload: PaycrestWebhookPayload = JSON.parse(rawBody);
    const { event, data } = payload;
    console.log('[PaycrestWebhook] Received:', event, 'Order:', data?.id);

    if (!event || !data?.id) {
      return new Response(JSON.stringify({ error: 'Missing event or order ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const paycrestOrderId = data.id;
    const newStatus = mapPaycrestStatus(event);

    // 1. Find the order
    const { data: order, error: findError } = await supabase
      .from('offramp_orders')
      .select('*, users!inner(privy_id, email)')
      .eq('paycrest_order_id', paycrestOrderId)
      .single();

    if (findError || !order) {
      console.log('[PaycrestWebhook] Order not found:', paycrestOrderId);
      return new Response(JSON.stringify({ received: true, status: 'order_not_found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[PaycrestWebhook] Order:', order.id, 'Status:', order.status, '->', newStatus);

    // 2. Update order status
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (data.txHash) updateData.tx_hash = data.txHash;
    if (newStatus === 'COMPLETED') updateData.completed_at = new Date().toISOString();
    if (newStatus === 'FAILED') updateData.error_message = data.reason || `Order ${event.replace('order.', '')}`;

    await supabase
      .from('offramp_orders')
      .update(updateData)
      .eq('id', order.id);

    // 3. Create notification & send push
    const typedOrder = order as unknown as OrderData;
    const userId = typedOrder.users?.privy_id;
    const userEmail = typedOrder.users?.email;
    const notifUser = userEmail || userId;

    if (notifUser) {
      const notification = getStatusMessage(event, typedOrder.fiat_amount, typedOrder.fiat_currency);

      // In-app notification
      await supabase.from('notifications').insert({
        user_id: notifUser,
        title: notification.title,
        message: notification.body,
        type: 'offramp',
        metadata: {
          orderId: typedOrder.id,
          paycrestOrderId,
          event,
          status: newStatus,
          fiatAmount: typedOrder.fiat_amount,
          fiatCurrency: typedOrder.fiat_currency,
        },
        is_read: false,
      });

      // Push notification
      if (userId) {
        await sendPushNotification(supabase, userId, notification.title, notification.body, {
          type: 'offramp_status',
          orderId: typedOrder.id,
          status: newStatus,
          fiatAmount: typedOrder.fiat_amount,
          fiatCurrency: typedOrder.fiat_currency,
          bankName: typedOrder.bank_name,
          accountNumber: typedOrder.account_number ? `****${typedOrder.account_number.slice(-4)}` : '',
          event,
        });
      }
    }

    return new Response(JSON.stringify({ received: true, orderId: order.id, status: newStatus }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[PaycrestWebhook] Error:', error);
    return new Response(JSON.stringify({ received: true, error: String(error) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
