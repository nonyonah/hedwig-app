// Import required polyfills first
import 'react-native-get-random-values';
import 'fast-text-encoding';

// Set up Buffer and process globals
import { Buffer } from 'buffer';
global.Buffer = Buffer;
(global as any).process = require('process');

// Initialize crypto after Buffer is available
// import 'react-native-crypto'; // Removed to avoid native module crash

// Then Ethersproject shims
import '@ethersproject/shims';

// Then import the expo router
import 'expo-router/entry';
