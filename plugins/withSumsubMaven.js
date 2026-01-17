const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to add Sumsub's Maven repository to Android settings.gradle
 * Modern Gradle 8+ uses dependencyResolutionManagement in settings.gradle
 */
const withSumsubMaven = (config) => {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const settingsGradlePath = path.join(config.modRequest.platformProjectRoot, 'settings.gradle');

            if (fs.existsSync(settingsGradlePath)) {
                let settingsGradleContent = fs.readFileSync(settingsGradlePath, 'utf8');

                // Check if Sumsub Maven repository is already added
                if (!settingsGradleContent.includes('maven.sumsub.com')) {
                    // Add dependencyResolutionManagement block before rootProject.name if not present
                    const sumsubConfig = `
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        mavenCentral()
        maven { url 'https://www.jitpack.io' }
        maven { url 'https://maven.sumsub.com/repository/maven-public/' }
    }
}

`;
                    // Insert before rootProject.name
                    if (settingsGradleContent.includes('rootProject.name')) {
                        settingsGradleContent = settingsGradleContent.replace(
                            /rootProject\.name/,
                            `${sumsubConfig}rootProject.name`
                        );
                        fs.writeFileSync(settingsGradlePath, settingsGradleContent);
                        console.log('[Sumsub] Added dependencyResolutionManagement with Sumsub Maven to settings.gradle');
                    } else {
                        console.warn('[Sumsub] Could not find rootProject.name in settings.gradle');
                    }
                } else {
                    console.log('[Sumsub] Sumsub Maven repository already present in settings.gradle');
                }
            }

            return config;
        },
    ]);
};

module.exports = withSumsubMaven;
