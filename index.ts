// Import required polyfills first
import 'react-native-get-random-values';
import 'fast-text-encoding';

// Set up Buffer and process globals
import { Buffer } from 'buffer';
global.Buffer = Buffer;
(global as any).process = require('process');

// Set up crypto.subtle polyfill for Stacks SDK pbkdf2
// Use lazy loading to avoid initialization issues
if (typeof global.crypto === 'undefined') {
    (global as any).crypto = {};
}

if (typeof global.crypto.subtle === 'undefined') {
    (global as any).crypto.subtle = {
        deriveBits: async (algorithm: any, baseKey: any, length: number) => {
            const { name, salt, iterations, hash } = algorithm;
            if (name === 'PBKDF2') {
                // Lazy require to avoid initialization issues
                const pbkdf2Module = require('pbkdf2');
                return new Promise((resolve, reject) => {
                    pbkdf2Module.pbkdf2(
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

// Then Ethersproject shims
import '@ethersproject/shims';

// Then import the expo router
import 'expo-router/entry';
