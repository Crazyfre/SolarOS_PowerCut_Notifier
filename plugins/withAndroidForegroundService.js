const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to inject the foregroundServiceType="specialUse"
 * and description property into the NotifeeForegroundService declaration
 * in AndroidManifest.xml at prebuild time.
 */
function withAndroidForegroundService(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const services = mainApplication.service;
    let notifeeService = services.find(
      (s) => s.$['android:name'] === 'io.invertase.notifee.NotifeeForegroundService'
    );

    if (!notifeeService) {
      notifeeService = {
        $: {
          'android:name': 'io.invertase.notifee.NotifeeForegroundService',
          'android:exported': 'false',
        },
      };
      services.push(notifeeService);
    }

    // Set service type and replace configuration for gradle manifest merger
    notifeeService.$['android:foregroundServiceType'] = 'specialUse';
    notifeeService.$['tools:replace'] = 'android:foregroundServiceType';

    // Add property declaration required for FOREGROUND_SERVICE_TYPE_SPECIAL_USE under Android 14+
    if (!notifeeService.property) {
      notifeeService.property = [];
    }

    const hasProperty = notifeeService.property.some(
      (p) => p.$['android:name'] === 'android.app.property.FOREGROUND_SERVICE_TYPE_SPECIAL_USE'
    );

    if (!hasProperty) {
      notifeeService.property.push({
        $: {
          'android:name': 'android.app.property.FOREGROUND_SERVICE_TYPE_SPECIAL_USE',
          'android:value': 'Monitoring utility grid state changes and solar telemetry to sound instant critical safety alarms.',
        },
      });
    }

    // Add tools namespace to manifest element if missing
    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    return config;
  });
}

module.exports = withAndroidForegroundService;
