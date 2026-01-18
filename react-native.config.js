/**
 * React Native config to exclude Sumsub native SDK from Android
 * Android uses WebSDK via WebView, iOS uses native SDK
 */
module.exports = {
    dependencies: {
        '@sumsub/react-native-mobilesdk-module': {
            platforms: {
                android: null, // Exclude from Android - using WebSDK instead
                // iOS will use the native implementation
            },
        },
    },
};
