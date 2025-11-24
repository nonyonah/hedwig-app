import { GeminiService } from './src/services/gemini';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
    try {
        console.log('Testing Gemini Service...');
        const response = await GeminiService.generateChatResponse('Create payment link for 50 USDC');
        console.log('Response:', JSON.stringify(response, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
