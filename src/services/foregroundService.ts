import notifee, { AndroidImportance } from '@notifee/react-native';
import { fetchTelemetry } from '../api/solar';
import { Store } from '../storage/secureStore';
import { SettingsStore } from '../storage/settingsStore';
import { detectAndAlert } from './stateDetector';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MONITORING_CHANNEL_ID = 'solarguard_monitoring_channel';
const NOTIFICATION_ID = 'solarguard_monitoring';
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds — keeps Hermes JS thread alive
const HEARTBEAT_KEY = 'sg_fs_heartbeat';
let isServiceRunning = false;
let loopPromiseResolver: (() => void) | null = null;
let heartbeatToggle = false; // alternates write ↔ delete each tick

/**
 * Sleep for the given number of milliseconds in 30-second heartbeat chunks.
 * Each tick alternates between an AsyncStorage write and delete to keep the
 * Android JS/Hermes thread active without accumulating any storage.
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
    // Alternate write ↔ delete: two I/O touches per cycle, zero net storage growth
    try {
      heartbeatToggle = !heartbeatToggle;
      if (heartbeatToggle) {
        await AsyncStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
      } else {
        await AsyncStorage.removeItem(HEARTBEAT_KEY);
      }
    } catch {
      // Non-fatal — just keep going
    }
  }
}

const diagCache: Record<string, string> = {};

async function updateDiagnostic(key: string, value: string): Promise<void> {
  if (diagCache[key] === value) return;
  diagCache[key] = value;
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Non-fatal
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
            await updateDiagnostic('sg_fs_state', 'Error / Retrying');
            await updateDiagnostic('sg_fs_last_result', 'Authentication Error');
            await heartbeatSleep(60 * 1000);
            continue;
          }

          const settings = await SettingsStore.loadSettings();
          
          await updateDiagnostic('sg_fs_state', 'Polling');

          // Fetch fresh telemetry data from SolarOS with custom errors
          let telemetry;
          try {
            telemetry = await fetchTelemetry(systemId);
            await updateDiagnostic('sg_fs_last_result', 'Success');
            await updateDiagnostic('sg_fs_state', 'Waiting for Next Poll');
          } catch (err: any) {
            const errorMsg = err?.message || String(err);
            let resultType: 'Success' | 'Network Error' | 'Authentication Error' | 'API Error' = 'API Error';
            if (errorMsg === 'AUTH_REQUIRED') {
              resultType = 'Authentication Error';
            } else if (errorMsg.includes('Network') || errorMsg.includes('Network request failed') || errorMsg.includes('ECONNREFUSED')) {
              resultType = 'Network Error';
            }
            await updateDiagnostic('sg_fs_last_result', resultType);
            await updateDiagnostic('sg_fs_state', 'Error / Retrying');
            throw err;
          }
          
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
          
          const now = Date.now();
          await updateDiagnostic('sg_fs_last_poll', String(now));
          await updateDiagnostic('sg_fs_next_poll', String(now + delayMs));

          await heartbeatSleep(delayMs);

        } catch (error: any) {
          console.warn('[ForegroundService] Loop error:', error);
          
          const isAuthError = error?.message === 'AUTH_REQUIRED';
          const errorBody = isAuthError 
            ? 'Monitoring Paused · Login Required' 
            : 'Monitoring Active · Connection Issue';

          // Update persistent notification to show connection issue / paused state
          await notifee.displayNotification({
            id: NOTIFICATION_ID,
            title: 'SolarGuard Monitoring',
            body: errorBody,
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

          const now = Date.now();
          await updateDiagnostic('sg_fs_last_poll', String(now));
          const delayMs = isAuthError ? 5 * 60 * 1000 : 60 * 1000;
          await updateDiagnostic('sg_fs_next_poll', String(now + delayMs));

          await heartbeatSleep(delayMs);
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
