import 'dotenv/config';
import axios, { AxiosInstance } from 'axios';

type AnyObj = Record<string, any>;

const apiKey = String(process.env.BRIDGE_API_KEY || '').trim();
const baseUrl = String(process.env.BRIDGE_API_BASE_URL || 'https://api.bridge.xyz').replace(/\/+$/, '');
const webhookUrl =
    String(process.env.BRIDGE_USD_WEBHOOK_URL || '').trim() ||
    `${String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '')}/api/webhooks/bridge-usd`;
const configuredWebhookId = String(process.env.BRIDGE_WEBHOOK_ID || '').trim();
const categories = String(
    process.env.BRIDGE_WEBHOOK_EVENT_CATEGORIES ||
    'customer,kyc_link,transfer,virtual_account,virtual_account.activity'
)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const command = (process.argv[2] || 'create').toLowerCase();
const commandWebhookId = String(process.argv[3] || '').trim();
const webhookId = commandWebhookId || configuredWebhookId;

if (!apiKey) {
    // eslint-disable-next-line no-console
    console.error('Missing BRIDGE_API_KEY.');
    process.exit(1);
}

if (!baseUrl.startsWith('https://')) {
    // eslint-disable-next-line no-console
    console.error(`Invalid BRIDGE_API_BASE_URL: ${baseUrl}`);
    process.exit(1);
}

const client: AxiosInstance = axios.create({
    baseURL: baseUrl,
    timeout: 30000,
    headers: {
        'Api-Key': apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    },
});

const extractPayload = (input: any): AnyObj => {
    if (input && typeof input === 'object' && input.data && typeof input.data === 'object') {
        return input.data as AnyObj;
    }
    return (input || {}) as AnyObj;
};

const printWebhook = (prefix: string, payload: AnyObj) => {
    const id = String(payload.id || payload.webhook_id || payload.webhookId || '');
    const publicKey =
        String(payload.public_key || payload.webhook_public_key || payload.signing_public_key || '').trim();
    const status = String(payload.status || payload.state || '');
    const url = String(payload.url || payload.webhook_url || '');

    // eslint-disable-next-line no-console
    console.log(`${prefix}`);
    // eslint-disable-next-line no-console
    console.log(`- webhookId: ${id || '(missing)'}`);
    // eslint-disable-next-line no-console
    console.log(`- status: ${status || '(missing)'}`);
    // eslint-disable-next-line no-console
    console.log(`- url: ${url || '(missing)'}`);
    // eslint-disable-next-line no-console
    console.log(`- publicKey: ${publicKey ? '[present]' : '(missing)'}`);
    if (publicKey) {
        // eslint-disable-next-line no-console
        console.log('\nSet this in backend env as BRIDGE_WEBHOOK_PUBLIC_KEY (keep line breaks or replace with \\n):');
        // eslint-disable-next-line no-console
        console.log(publicKey);
    }
};

const requireWebhookId = () => {
    if (!webhookId) {
        // eslint-disable-next-line no-console
        console.error('Webhook id is required. Set BRIDGE_WEBHOOK_ID or pass it as the second argument.');
        process.exit(1);
    }
};

const run = async () => {
    if (command === 'create') {
        if (!webhookUrl.startsWith('https://')) {
            // eslint-disable-next-line no-console
            console.error(
                'Missing BRIDGE_USD_WEBHOOK_URL or PUBLIC_BASE_URL. Webhook URL must be https://...'
            );
            process.exit(1);
        }

        const response = await client.post('/v0/webhooks', {
            url: webhookUrl,
            event_categories: categories,
            description: 'Hedwig USD accounts webhook',
        });
        const payload = extractPayload(response.data);
        printWebhook('Bridge webhook created', payload);
        return;
    }

    if (command === 'activate') {
        requireWebhookId();
        const response = await client.post(`/v0/webhooks/${webhookId}/activate`, {});
        const payload = extractPayload(response.data);
        printWebhook('Bridge webhook activated', payload);
        return;
    }

    if (command === 'test') {
        requireWebhookId();
        const response = await client.post(`/v0/webhooks/${webhookId}/send_test_event`, {});
        const payload = extractPayload(response.data);
        // eslint-disable-next-line no-console
        console.log('Bridge webhook test event sent');
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    if (command === 'logs') {
        requireWebhookId();
        const response = await client.get(`/v0/webhooks/${webhookId}/logs`);
        const payload = extractPayload(response.data);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    if (command === 'events') {
        requireWebhookId();
        const response = await client.get(`/v0/webhooks/${webhookId}/events`);
        const payload = extractPayload(response.data);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    // eslint-disable-next-line no-console
    console.error('Unknown command. Use one of: create | activate | test | logs | events');
    process.exit(1);
};

run().catch((error: any) => {
    const details = error?.response?.data ? JSON.stringify(error.response.data) : error?.message;
    // eslint-disable-next-line no-console
    console.error(`Bridge webhook command failed: ${details}`);
    process.exit(1);
});

