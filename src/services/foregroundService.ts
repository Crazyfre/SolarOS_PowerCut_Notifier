import notifee, { AndroidImportance } from '@notifee/react-native';
import { fetchTelemetry } from '../api/solar';
import { Store } from '../storage/secureStore';
import { SettingsStore } from '../storage/settingsStore';
import { detectAndAlert } from './stateDetector';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MONITORING_CHANNEL_ID = 'solarguard_monitoring_channel';
const NOTIFICATION_ID = 'solarguard_monitoring';
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds — keeps Hermes JS thread alive
let isServiceRunning = false;
let loopPromiseResolver: (() => void) | null = null;

/**
 * Sleep for the given number of milliseconds in 30-second heartbeat chunks.
 * Each tick touches AsyncStorage to keep the Android JS thread from being suspended.
 * Returns early if the service is stopped mid-sleep.
 */
async function heartbeatSleep(totalMs: number): Promise<void> {
  const end = Date.now() + totalMs;
  while (isServiceRunning && Date.now() < end) {
    const remaining = end - Date.now();
    const tick = Math.min(HEARTBEAT_INTERVAL_MS, remaining);
    await new Promise<void>((r) => {
      const timer = setTimeout(r, tick);
      ForegroundServiceManager._abortSleep = () => {
        clearTimeout(timer);
        r();
      };
    });
    if (!isServiceRunning) break;
    // Heartbeat: lightweight AsyncStorage touch to prove the JS thread is alive
    try {
      await AsyncStorage.setItem('sg_fs_heartbeat', String(Date.now()));
    } catch {
      // Non-fatal — just keep going
    }
  }
}

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
            await heartbeatSleep(60 * 1000);
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

          // Sleep using heartbeat chunks to keep the JS thread warm
          const refreshMinutes = settings.refreshIntervalMinutes ?? 5;
          const delayMs = Math.max(1, refreshMinutes) * 60 * 1000;
          await heartbeatSleep(delayMs);

        } catch (error) {
          console.warn('[ForegroundService] Loop error:', error);
          // On error, sleep 1 minute before retrying (also via heartbeat)
          await heartbeatSleep(60 * 1000);
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
