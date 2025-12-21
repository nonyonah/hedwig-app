/**
 * CDP Polyfills
 * These polyfills are required by @coinbase/cdp-hooks for React Native
 * IMPORTANT: This file must be imported BEFORE any CDP SDK imports
 */

// Crypto polyfill - must be first
import 'react-native-get-random-values';

// Quick crypto for crypto operations
import { install } from 'react-native-quick-crypto';
install();

// Structured clone polyfill
import '@ungap/structured-clone';

console.log('CDP polyfills installed');
