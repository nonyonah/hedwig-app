import { parsePaymentDetails } from './paymentParser';

// Test cases from the user's prompt
const tests = [
    {
        input: "Yo boss, send the cash to my M-Pesa 0712345678",
        expected: {
            country_code: "KE",
            payment_method: "mobile_money",
            identifier: "0712345678",
            institution_hint: "M-Pesa",
        }
    },
    {
        input: "Chave Aleatória Pix: 9abc1234-b123-12d3-a456-426614174000",
        expected: {
            country_code: "BR",
            payment_method: "pix",
            identifier: "9abc1234-b123-12d3-a456-426614174000",
            institution_hint: "evp_hash",
        }
    },
    {
        input: "Zenith Bank / John Doe Ent / 1023456789",
        expected: {
            country_code: "NG",
            payment_method: "bank_transfer",
            recipient_name: "John Doe Ent",
            identifier: "1023456789",
            institution_hint: "Zenith Bank",
        }
    },
    {
        input: "Send to my GTBank account: 0123456789 - Name: Jane Smith",
        expected: {
            country_code: "NG",
            payment_method: "bank_transfer",
            recipient_name: "Jane Smith",
            identifier: "0123456789",
            institution_hint: "GTBank",
        }
    },
    {
        input: "M-Pesa Paybill: 247247 Account: 1234567890",
        expected: {
            country_code: "KE",
            payment_method: "mobile_money",
            identifier: "247247",
            institution_hint: "M-Pesa",
            secondary_reference: "1234567890",
        }
    },
    {
        input: "Chave Pix CPF: 123.456.789-00",
        expected: {
            country_code: "BR",
            payment_method: "pix",
            identifier: "12345678900",
            institution_hint: "cpf",
        }
    },
    {
        input: "Pix email: joao.silva@email.com",
        expected: {
            country_code: "BR",
            payment_method: "pix",
            identifier: "joao.silva@email.com",
            institution_hint: "email",
        }
    },
    {
        input: "My Airtel Money number: +255712345678",
        expected: {
            country_code: "TZ",
            payment_method: "mobile_money",
            identifier: "+255712345678",
            institution_hint: "Airtel Money",
        }
    },
    {
        input: "Account: TNM Mpamba 0888123456",
        expected: {
            country_code: "MW",
            payment_method: "mobile_money",
            identifier: "0888123456",
            institution_hint: "TNM Mpamba",
        }
    },
];

console.log('Running Payment Parser Tests...\n');

let passed = 0;
let failed = 0;

for (const test of tests) {
    const result = parsePaymentDetails(test.input);
    const errors: string[] = [];

    for (const [key, value] of Object.entries(test.expected)) {
        if (result[key as keyof typeof result] !== value) {
            errors.push(`${key}: expected "${value}", got "${result[key as keyof typeof result]}"`);
        }
    }

    if (errors.length === 0) {
        console.log(`✅ PASS: "${test.input.substring(0, 50)}..."`);
        passed++;
    } else {
        console.log(`❌ FAIL: "${test.input.substring(0, 50)}..."`);
        errors.forEach(e => console.log(`   - ${e}`));
        failed++;
    }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
