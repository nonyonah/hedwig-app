const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to add Sumsub's CocoaPods source to the Podfile
 * This is required because the IdensicMobileSDK pod is in a private repo
 */
const withSumsubPodfile = (config) => {
    return withDangerousMod(config, [
        'ios',
        async (config) => {
            const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

            if (fs.existsSync(podfilePath)) {
                let podfileContent = fs.readFileSync(podfilePath, 'utf8');

                // Check if Sumsub source is already added
                if (!podfileContent.includes('source \'https://cdn.cocoapods.org/\'')) {
                    // Add CocoaPods sources at the beginning of the Podfile
                    const sourcesBlock = `# CocoaPods sources
source 'https://cdn.cocoapods.org/'
source 'https://github.com/nicklockwood/SwiftFormat'

`;
                    podfileContent = sourcesBlock + podfileContent;
                    fs.writeFileSync(podfilePath, podfileContent);
                    console.log('[Sumsub] Added CocoaPods source to Podfile');
                }
            }

            return config;
        },
    ]);
};

module.exports = withSumsubPodfile;
