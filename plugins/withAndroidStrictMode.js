const { withMainApplication } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to inject Android StrictMode configuration
 * into MainApplication (Java or Kotlin) during prebuild.
 */
function withAndroidStrictMode(config) {
  return withMainApplication(config, (config) => {
    const isKotlin = config.modResults.language === 'kt';
    let contents = config.modResults.contents;

    if (contents.includes('android.os.StrictMode')) {
      // Already injected
      return config;
    }

    if (isKotlin) {
      const strictModeCode = `
    if (BuildConfig.DEBUG) {
      android.os.StrictMode.setThreadPolicy(
        android.os.StrictMode.ThreadPolicy.Builder()
          .detectDiskReads()
          .detectDiskWrites()
          .detectNetwork()
          .penaltyLog()
          .build()
      )
      android.os.StrictMode.setVmPolicy(
        android.os.StrictMode.VmPolicy.Builder()
          .detectLeakedSqlLiteObjects()
          .detectLeakedClosableObjects()
          .penaltyLog()
          .build()
      )
    }`;
      contents = contents.replace('super.onCreate()', 'super.onCreate()' + strictModeCode);
    } else {
      const strictModeCode = `
        if (BuildConfig.DEBUG) {
            android.os.StrictMode.setThreadPolicy(
                new android.os.StrictMode.ThreadPolicy.Builder()
                    .detectDiskReads()
                    .detectDiskWrites()
                    .detectNetwork()
                    .penaltyLog()
                    .build()
            );
            android.os.StrictMode.setVmPolicy(
                new android.os.StrictMode.VmPolicy.Builder()
                    .detectLeakedSqlLiteObjects()
                    .detectLeakedClosableObjects()
                    .penaltyLog()
                    .build()
            );
        }`;
      contents = contents.replace('super.onCreate();', 'super.onCreate();' + strictModeCode);
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidStrictMode;
