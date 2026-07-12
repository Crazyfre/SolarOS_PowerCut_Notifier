const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to copy WAV assets into Android raw resources
 * so they can be referenced by the native MediaPlayer as R.raw.soundName.
 */
function withAndroidSirenRaw(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const { projectRoot } = config.modRequest;
      
      const resRawDir = path.join(
        projectRoot,
        'android/app/src/main/res/raw'
      );

      // Create res/raw folder if it doesn't exist
      if (!fs.existsSync(resRawDir)) {
        fs.mkdirSync(resRawDir, { recursive: true });
        console.log(`[withAndroidSirenRaw] Created res/raw directory`);
      }

      const sounds = ['alarm.wav', 'siren.wav', 'digital_beep.wav', 'chime.wav'];
      
      for (const sound of sounds) {
        const srcFile = path.join(projectRoot, 'assets', sound);
        const destFile = path.join(resRawDir, sound);

        if (fs.existsSync(srcFile)) {
          fs.copyFileSync(srcFile, destFile);
          console.log(`[withAndroidSirenRaw] Copied ${sound} to res/raw`);
        } else {
          console.warn(`[withAndroidSirenRaw] Source asset not found: ${srcFile}`);
        }
      }

      return config;
    },
  ]);
}

module.exports = withAndroidSirenRaw;
