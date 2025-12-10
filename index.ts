// Import required polyfills first
import 'react-native-get-random-values';
import 'fast-text-encoding';

// Set up Buffer and process globals
import { Buffer } from 'buffer';
global.Buffer = Buffer;
(global as any).process = require('process');

// Add crypto polyfills for Stacks SDK
import pbkdf2 from 'pbkdf2';
import createHash from 'create-hash';
import createHmac from 'create-hmac';

// Set up crypto.subtle polyfill for pbkdf2
if (typeof global.crypto === 'undefined') {
    (global as any).crypto = {};
}
if (typeof global.crypto.subtle === 'undefined') {
    (global as any).crypto.subtle = {
        deriveBits: async (algorithm: any, baseKey: any, length: number) => {
            const { name, salt, iterations, hash } = algorithm;
            if (name === 'PBKDF2') {
                return new Promise((resolve, reject) => {
                    pbkdf2.pbkdf2(
                        baseKey,
                        Buffer.from(salt),
                        iterations,
                        length / 8,
                        hash.name.toLowerCase().replace('-', ''),
                        (err: Error | null, derivedKey: Buffer) => {
                            if (err) reject(err);
                            else resolve(derivedKey.buffer);
                        }
                    );
                });
            }
            throw new Error(`Unsupported algorithm: ${name}`);
        },
        importKey: async () => 'mock-key',
    };
}

// Add createHash and createHmac to crypto
(global as any).crypto.createHash = createHash;
(global as any).crypto.createHmac = createHmac;

// Initialize crypto after Buffer is available
// import 'react-native-crypto'; // Removed to avoid native module crash

// Then Ethersproject shims
import '@ethersproject/shims';

// Then import the expo router
import 'expo-router/entry';

