const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to manage the foregroundServiceType on the Notifee
 * core ForegroundService declared in the Notifee AAR manifest.
 *
 * The Notifee prebuilt AAR (core-202108261754.aar) ships with:
 *   android:foregroundServiceType="shortService"
 *
 * SHORT_SERVICE has a hard ANR timeout (~3 min on Android 14+) and is
 * incompatible with SolarGuard's monitoring service.
 *
 * The manifest entry lists BOTH "dataSync|location" so that:
 *  - 'always' mode notifications (dataSync) keep the legacy type, and
 *  - 'geofenced' mode notifications pass
 *    foregroundServiceTypes: ['location'] at runtime (see
 *    src/services/foregroundService.ts), which is valid because the type is
 *    a subset of the declared manifest types. The actual type applied to the
 *    FGS at runtime comes from each notification's config, NOT from this
 *    manifest attribute.
 *
 * IMPORTANT: The class name must match the AAR's declaration exactly.
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

    // Declare both dataSync (legacy/always mode) and location (geofenced mode)
    // as permitted types for this service. Runtime notification config decides
    // which one is active for a given foreground session.
    notifeeService.$['android:foregroundServiceType'] = 'dataSync|location';
    notifeeService.$['tools:replace'] = 'android:foregroundServiceType';

    // Remove any stale specialUse property — not needed.
    delete notifeeService.property;

    // Add tools namespace to manifest element if missing
    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    return config;
  });
}

module.exports = withAndroidForegroundService;
