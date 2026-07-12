import notifee, { AndroidImportance } from '@notifee/react-native';
import { fetchTelemetry } from '../api/solar';
import { Store } from '../storage/secureStore';
import { SettingsStore } from '../storage/settingsStore';
import { detectAndAlert } from './stateDetector';

const MONITORING_CHANNEL_ID = 'solarguard_monitoring_channel';
const NOTIFICATION_ID = 'solarguard_monitoring';
let isServiceRunning = false;
let loopPromiseResolver: (() => void) | null = null;

// Register the Notifee foreground service runner
notifee.registerForegroundService(() => {
  return new Promise<void>((resolve) => {
    isServiceRunning = true;
    loopPromiseResolver = resolve;
    console.log('[ForegroundService] Started loop.');

    // Execute loop asynchronously
    (async () => {
      while (isServiceRunning) {
        try {
          const systemId = await Store.getSystemId();
          if (!systemId) {
            console.log('[ForegroundService] No System ID active. Waiting 1 minute...');
            await new Promise<void>((r) => setTimeout(r, 60 * 1000));
            continue;
          }

          const settings = await SettingsStore.loadSettings();
          
          // Fetch fresh telemetry data from SolarOS
          const telemetry = await fetchTelemetry(systemId);
          
          // Run state analysis & alarm siren triggers
          await detectAndAlert(telemetry, settings);

          // Format persistent notification text
          const gridStatusText = telemetry.gridRelayStatus === 'on' 
            ? 'Grid Connected' 
            : 'Grid OFFLINE';
          const solarText = telemetry.pvPower !== undefined ? `Solar: ${telemetry.pvPower}W` : 'Solar: 0W';
          const batteryText = `Battery: ${telemetry.batterySoc}% (${
            telemetry.batteryStatus === 'CHARGE' ? 'Charging' : telemetry.batteryStatus === 'DISCHARGE' ? 'Discharging' : 'Idle'
          })`;

          const body = `${gridStatusText} · ${solarText} · ${batteryText}`;

          // Update the persistent notification with the fresh stats
          await notifee.displayNotification({
            id: NOTIFICATION_ID,
            title: 'SolarGuard Monitoring',
            body,
            android: {
              channelId: MONITORING_CHANNEL_ID,
              asForegroundService: true,
              ongoing: true,
              onlyAlertOnce: true,
              importance: AndroidImportance.DEFAULT,
              pressAction: {
                id: 'default',
              },
            },
          });

          // Sleep for the user-configured interval (settings refresh interval)
          const refreshMinutes = settings.refreshIntervalMinutes ?? 5;
          const delayMs = Math.max(1, refreshMinutes) * 60 * 1000;
          await new Promise<void>((r) => {
            const timer = setTimeout(r, delayMs);
            // Store abort handler so we can stop immediately if stopped
            ForegroundServiceManager._abortSleep = () => {
              clearTimeout(timer);
              r();
            };
          });

        } catch (error) {
          console.warn('[ForegroundService] Loop error:', error);
          // On error, sleep 1 minute before retrying
          await new Promise<void>((r) => setTimeout(r, 60 * 1000));
        }
      }

      console.log('[ForegroundService] Exiting loop.');
      if (loopPromiseResolver) {
        loopPromiseResolver();
        loopPromiseResolver = null;
      }
    })();
  });
});

export const ForegroundServiceManager = {
  _abortSleep: null as (() => void) | null,

  /**
   * Start the persistent foreground service
   */
  async startService(): Promise<void> {
    // Create the notification channel
    await notifee.createChannel({
      id: MONITORING_CHANNEL_ID,
      name: 'SolarGuard Monitoring Service',
      importance: AndroidImportance.DEFAULT,
    });

    // Request permissions (required for Android 13+)
    await notifee.requestPermission();

    // Trigger the initial notification to start the foreground service
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: 'SolarGuard Monitoring',
      body: 'Connecting to SolarOS...',
      android: {
        channelId: MONITORING_CHANNEL_ID,
        asForegroundService: true,
        ongoing: true,
        onlyAlertOnce: true,
        importance: AndroidImportance.DEFAULT,
        pressAction: {
          id: 'default',
        },
      },
    });
  },

  /**
   * Stop the persistent foreground service
   */
  async stopService(): Promise<void> {
    isServiceRunning = false;
    if (this._abortSleep) {
      this._abortSleep();
      this._abortSleep = null;
    }
    await notifee.stopForegroundService();
  },

  /**
   * Check if the service is currently running
   */
  isServiceRunning(): boolean {
    return isServiceRunning;
  }
};
