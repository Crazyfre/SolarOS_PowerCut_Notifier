const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to override the foregroundServiceType on the Notifee
 * core ForegroundService declared in the Notifee AAR manifest.
 *
 * The Notifee prebuilt AAR (core-202108261754.aar) ships with:
 *   android:foregroundServiceType="shortService"
 *
 * SHORT_SERVICE has a hard ANR timeout (~3 min on Android 14+) and is
 * incompatible with SolarGuard's continuously-running telemetry monitor.
 *
 * This plugin targets the actual runtime class name declared in the AAR
 * ("app.notifee.core.ForegroundService") and overrides the type to
 * "dataSync", which is the correct type for a service that continuously
 * polls a remote API to sync state.
 *
 * IMPORTANT: The class name must match the AAR's declaration exactly.
 * The previously used name "io.invertase.notifee.NotifeeForegroundService"
 * was wrong — it never matched any real entry in the merged manifest, so
 * the tools:replace directive was silently a no-op and shortService survived
 * into the final APK, causing the ANR.
 */
function withAndroidForegroundService(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const services = mainApplication.service;

    // Target the actual class name declared inside the Notifee core AAR manifest.
    // Wrong name (old): 'io.invertase.notifee.NotifeeForegroundService'
    // Correct name:     'app.notifee.core.ForegroundService'
    let notifeeService = services.find(
      (s) => s.$['android:name'] === 'app.notifee.core.ForegroundService'
    );

    if (!notifeeService) {
      notifeeService = {
        $: {
          'android:name': 'app.notifee.core.ForegroundService',
          'android:exported': 'false',
        },
      };
      services.push(notifeeService);
    }

    // Override the shortService type from the Notifee AAR with dataSync.
    // dataSync is appropriate for a service that continuously fetches data
    // from a remote source (solar telemetry API) without a timeout constraint.
    notifeeService.$['android:foregroundServiceType'] = 'dataSync';
    notifeeService.$['tools:replace'] = 'android:foregroundServiceType';

    // Remove any stale specialUse property — not needed for dataSync type.
    delete notifeeService.property;

    // Add tools namespace to manifest element if missing
    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    return config;
  });
}

module.exports = withAndroidForegroundService;
