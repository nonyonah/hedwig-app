const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to add Sumsub's CocoaPods source to the Podfile
 * This is required because the IdensicMobileSDK pod is in Sumsub's private specs repo
 */
const withSumsubPodfile = (config) => {
    return withDangerousMod(config, [
        'ios',
        async (config) => {
            const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

            if (fs.existsSync(podfilePath)) {
                let podfileContent = fs.readFileSync(podfilePath, 'utf8');

                // Check if Sumsub source is already added
                if (!podfileContent.includes('SumSubstance/Specs')) {
                    // Add CocoaPods sources at the beginning of the Podfile
                    // IMPORTANT: Sumsub's specs repo must come BEFORE cdn.cocoapods.org
                    const sourcesBlock = `# CocoaPods sources for Sumsub SDK
source 'https://github.com/SumSubstance/Specs.git'
source 'https://cdn.cocoapods.org/'

`;
                    podfileContent = sourcesBlock + podfileContent;
                    fs.writeFileSync(podfilePath, podfileContent);
                    console.log('[Sumsub] Added SumSubstance/Specs CocoaPods source to Podfile');
                }
            }

            return config;
        },
    ]);
};

module.exports = withSumsubPodfile;
