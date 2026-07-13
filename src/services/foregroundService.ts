import notifee, { AndroidImportance } from '@notifee/react-native';
import { fetchTelemetry } from '../api/solar';
import { Store } from '../storage/secureStore';
import { SettingsStore } from '../storage/settingsStore';
import { detectAndAlert } from './stateDetector';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MONITORING_CHANNEL_ID = 'solarguard_monitoring_channel';
const NOTIFICATION_ID = 'solarguard_monitoring';

let isServiceRunning = false;
let loopPromiseResolver: (() => void) | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let sleepResolver: (() => void) | null = null;

/**
 * Cancelable sleep using standard setTimeout.
 * Resolves immediately if the service is stopped or aborted.
 */
async function cancelableSleep(ms: number): Promise<void> {
  if (!isServiceRunning) return;
  await new Promise<void>((resolve) => {
    sleepResolver = resolve;
    activeTimer = setTimeout(() => {
      activeTimer = null;
      sleepResolver = null;
      resolve();
    }, ms);
  });
}

/**
 * Abort any active sleep timer and resolve the sleep promise immediately.
 */
function abortSleep(): void {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (sleepResolver) {
    sleepResolver();
    sleepResolver = null;
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
    console.log('[ForegroundService] Service Started.');

    // Execute loop asynchronously
    (async () => {
      while (isServiceRunning) {
        try {
          const systemId = await Store.getSystemId();
          if (!systemId) {
            console.warn('[ForegroundService] No System ID active. Waiting 1 minute...');
            await updateDiagnostic('sg_fs_state', 'Error / Retrying');
            await updateDiagnostic('sg_fs_last_result', 'Authentication Error');
            await cancelableSleep(60 * 1000);
            continue;
          }

          const settings = await SettingsStore.loadSettings();
          
          await updateDiagnostic('sg_fs_state', 'Polling');

          console.log('[ForegroundService] Poll Started.');
          const pollStart = Date.now();

          // Fetch fresh telemetry data from SolarOS with custom errors
          let telemetry;
          try {
            telemetry = await fetchTelemetry(systemId);
            const duration = Date.now() - pollStart;
            console.log(`[ForegroundService] Poll Completed. HTTP Duration: ${duration}ms`);
            
            await updateDiagnostic('sg_fs_last_result', 'Success');
            await updateDiagnostic('sg_fs_state', 'Waiting for Next Poll');
          } catch (err: any) {
            const duration = Date.now() - pollStart;
            console.warn(`[ForegroundService] Poll Failed. HTTP Duration: ${duration}ms. Error:`, err);
            
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

          // Sleep until the next poll cycle
          const refreshMinutes = settings.refreshIntervalMinutes ?? 5;
          const delayMs = Math.max(1, refreshMinutes) * 60 * 1000;
          
          const now = Date.now();
          await updateDiagnostic('sg_fs_last_poll', String(now));
          await updateDiagnostic('sg_fs_next_poll', String(now + delayMs));

          await cancelableSleep(delayMs);

        } catch (error: any) {
          // If we reach here, telemetry fetch or state analysis failed.
          // We keep the foreground service running and retry after the configured interval.
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

          await cancelableSleep(delayMs);
        }
      }

      console.log('[ForegroundService] Service Stopped.');
      if (loopPromiseResolver) {
        loopPromiseResolver();
        loopPromiseResolver = null;
      }
    })();
  });
});

export const ForegroundServiceManager = {
  /**
   * Start the persistent foreground service
   */
  async startService(): Promise<void> {
    if (isServiceRunning) {
      console.log('[ForegroundService] Service already running. Ignoring duplicate start request.');
      return;
    }

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
    if (!isServiceRunning) return;
    isServiceRunning = false;
    abortSleep();
    await notifee.stopForegroundService();
  },

  /**
   * Check if the service is currently running
   */
  isServiceRunning(): boolean {
    return isServiceRunning;
  }
};
