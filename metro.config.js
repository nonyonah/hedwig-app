const {
    getSentryExpoConfig
} = require("@sentry/react-native/metro");
const path = require('path');
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
    '@hedwig/true-sheet': path.resolve(__dirname, 'shims/true-sheet/index'),
};

// Some deps still request this private CJS path on iOS bundling.
// Route it to the public export to avoid repeated package-exports fallback warnings.
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.startsWith('multiformats/cjs/src/')) {
        const publicSubpath = moduleName
            .replace(/^multiformats\/cjs\/src\//, '')
            .replace(/\.js$/, '');
        return context.resolveRequest(context, `multiformats/${publicSubpath}`, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
};

// Fix for ESM/CJS interop issues with certain packages
// Note: 'import' is placed before 'require' so packages with "type":"module" (like @hugeicons/core-free-icons)
// use their ESM build instead of the CJS build, which Metro misparses when "type":"module" is set.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'import', 'require'];

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
