// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

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

// Prefer browser exports to avoid Node.js specific modules
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['browser', 'require', 'react-native'];

module.exports = config;
