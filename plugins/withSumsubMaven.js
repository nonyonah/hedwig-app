const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to add Sumsub's Maven repository to Android build.gradle
 * This is required because the idensic-mobile-sdk package is in Sumsub's private Maven repo
 */
const withSumsubMaven = (config) => {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const buildGradlePath = path.join(config.modRequest.platformProjectRoot, 'build.gradle');

            if (fs.existsSync(buildGradlePath)) {
                let buildGradleContent = fs.readFileSync(buildGradlePath, 'utf8');

                // Check if Sumsub Maven repository is already added
                if (!buildGradleContent.includes('maven.sumsub.com')) {
                    // Add Sumsub Maven repository to allprojects.repositories
                    const sumsubMaven = "maven { url 'https://maven.sumsub.com/repository/maven-public/' }";

                    // Find allprojects { repositories { ... } } and add Sumsub Maven
                    const allProjectsRegex = /(allprojects\s*\{\s*repositories\s*\{[^}]*)(})/;

                    if (allProjectsRegex.test(buildGradleContent)) {
                        buildGradleContent = buildGradleContent.replace(
                            allProjectsRegex,
                            `$1    ${sumsubMaven}\n  $2`
                        );
                        fs.writeFileSync(buildGradlePath, buildGradleContent);
                        console.log('[Sumsub] Added Sumsub Maven repository to build.gradle');
                    } else {
                        console.warn('[Sumsub] Could not find allprojects.repositories in build.gradle');
                    }
                }
            }

            return config;
        },
    ]);
};

module.exports = withSumsubMaven;
