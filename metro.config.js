const {
    getSentryExpoConfig
} = require("@sentry/react-native/metro");
// Temporarily disabled due to build error - TypeError: Cannot read properties of undefined (reading 'match')
// const { withSentryConfig } = require('@sentry/react-native/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);



config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    crypto: require.resolve('./crypto-shim.js'),
    http: require.resolve('stream-http'),
    https: require.resolve('https-browserify'),
    url: require.resolve('url'),
    os: require.resolve('os-browserify/browser'),
    buffer: require.resolve('buffer'),
    stream: require.resolve('stream-browserify'),
    util: require.resolve('util'),
    zlib: require.resolve('browserify-zlib'),
    events: require.resolve('events'),
    assert: require.resolve('assert'),
    path: require.resolve('path-browserify'),
    process: require.resolve('process/browser'),
};

// Fix for ESM/CJS interop issues with certain packages
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import'];

// Force certain packages to be resolved as CommonJS
config.transformer = {
    ...config.transformer,
    getTransformOptions: async () => ({
        transform: {
            experimentalImportSupport: false,
            inlineRequires: true,
        },
    }),
};

// Export without Sentry wrapper for now (Sentry still works, just no automatic source map upload)
module.exports = config;