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
                    // Find the jitpack line in allprojects and add after it
                    const jitpackLine = "maven { url 'https://www.jitpack.io' }";
                    const sumsubMaven = "        maven { url 'https://maven.sumsub.com/repository/maven-public/' }";

                    if (buildGradleContent.includes(jitpackLine)) {
                        // Add Sumsub Maven after jitpack
                        buildGradleContent = buildGradleContent.replace(
                            jitpackLine,
                            `${jitpackLine}\n${sumsubMaven}`
                        );
                        fs.writeFileSync(buildGradlePath, buildGradleContent);
                        console.log('[Sumsub] Added Sumsub Maven repository to build.gradle');
                    } else {
                        // Fallback: add after mavenCentral() in allprojects
                        const mavenCentralInAllprojects = /allprojects\s*\{[\s\S]*?mavenCentral\(\)/;
                        if (mavenCentralInAllprojects.test(buildGradleContent)) {
                            buildGradleContent = buildGradleContent.replace(
                                /(allprojects\s*\{[\s\S]*?)(mavenCentral\(\))/,
                                `$1$2\n${sumsubMaven}`
                            );
                            fs.writeFileSync(buildGradlePath, buildGradleContent);
                            console.log('[Sumsub] Added Sumsub Maven repository after mavenCentral()');
                        } else {
                            console.warn('[Sumsub] Could not find suitable location in build.gradle');
                        }
                    }
                } else {
                    console.log('[Sumsub] Sumsub Maven repository already present in build.gradle');
                }
            }

            return config;
        },
    ]);
};

module.exports = withSumsubMaven;
