const appJson = require('./app.json');

module.exports = ({ config }) => {
  const baseConfig = config ?? appJson.expo ?? {};
  const existingExtra = baseConfig.extra ?? {};
  const runtimeVersion =
    process.env.EXPO_RUNTIME_VERSION ||
    process.env.RUNTIME_VERSION ||
    baseConfig.version ||
    '1.0.0';
  const oneSignalAppId =
    process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ||
    process.env.ONESIGNAL_APP_ID ||
    existingExtra.oneSignalAppId ||
    '';
  const revenueCatAppleApiKey =
    process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ||
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ||
    existingExtra.revenueCatAppleApiKey ||
    '';
  const revenueCatGoogleApiKey =
    process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ||
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ||
    existingExtra.revenueCatGoogleApiKey ||
    '';

  return {
    ...baseConfig,
    // Bare workflow does not support runtimeVersion policy objects.
    runtimeVersion,
    extra: {
      ...existingExtra,
      oneSignalAppId,
      revenueCatAppleApiKey,
      revenueCatGoogleApiKey,
    },
    android: {
      ...(baseConfig.android ?? {}),
      // Use EAS file secret at build time; fall back to local file for local builds.
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
    },
  };
};
