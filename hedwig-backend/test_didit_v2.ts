
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

const DIDIT_API_KEY = process.env.DIDIT_API_KEY;
const DIDIT_BASE_URL = process.env.DIDIT_BASE_URL || 'https://verification.didit.me';
const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID;

console.log('--- Config ---');
console.log('Base URL:', DIDIT_BASE_URL);
console.log('Workflow ID:', DIDIT_WORKFLOW_ID);
console.log('API Key:', DIDIT_API_KEY ? 'Set' : 'Missing');

async function testCreateSession() {
    try {
        console.log('\nCreating session...');
        const response = await fetch(`${DIDIT_BASE_URL}/v2/session/`, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'x-api-key': DIDIT_API_KEY || ''
            },
            body: JSON.stringify({
                workflow_id: DIDIT_WORKFLOW_ID,
                vendor_data: 'test_user_123',
                callback: 'https://hedwig.money/kyc/callback'
            })
        });

        const text = await response.text();
        console.log('Response Status:', response.status);
        console.log('Response Body:', text);

        if (response.ok) {
            const data = JSON.parse(text);
            console.log('\n✅ URL:', data.url);
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

testCreateSession();
