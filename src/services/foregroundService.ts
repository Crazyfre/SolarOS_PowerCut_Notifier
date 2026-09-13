import notifee, { AndroidImportance, AndroidForegroundServiceType } from '@notifee/react-native';
import { fetchTelemetry } from '../api/solar';
import { Store } from '../storage/secureStore';
import { SettingsStore } from '../storage/settingsStore';
import { detectAndAlert } from './stateDetector';
import { GeofenceStore } from '../storage/geofenceStore';
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

/**
 * Build the android notification config for the persistent FGS notification.
 * The FGS type must be identical on EVERY displayNotification call while the
 * service runs (Notifee re-invokes startForeground when the type changes).
 * Geofenced mode -> 'location' (no OS time cap); otherwise 'dataSync'.
 */
function buildFgsNotificationConfig(geofenced: boolean): Parameters<typeof notifee.displayNotification>[0]['android'] {
  const config: Parameters<typeof notifee.displayNotification>[0]['android'] = {
    channelId: MONITORING_CHANNEL_ID,
    asForegroundService: true,
    ongoing: true,
    onlyAlertOnce: true,
    importance: AndroidImportance.DEFAULT,
    pressAction: {
      id: 'default',
    },
  };
  if (geofenced) {
    config.foregroundServiceTypes = [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_LOCATION];
  }
  return config;
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
        // Loaded per-cycle BEFORE the try so the catch block can read it too.
        const settings = await SettingsStore.loadSettings();
        try {
          const systemId = await Store.getSystemId();
          if (!systemId) {
            console.warn('[ForegroundService] No System ID active. Waiting 1 minute...');
            await updateDiagnostic('sg_fs_state', 'Error / Retrying');
            await updateDiagnostic('sg_fs_last_result', 'Authentication Error');
            await cancelableSleep(60 * 1000);
            continue;
          }

          // ── Geofenced mode guard ──────────────────────────────────────────
          // If we're running the FGS while (per fence state) outside the home
          // zone, this run is stale (e.g. missed EXIT event). Do one remote-
          // mode poll, then stop the service instead of burning battery.
          let remote = false;
          if (settings.monitoringMode === 'geofenced' && settings.homeZone) {
            const geo = await GeofenceStore.getState();
            remote = geo.inside !== true;
            if (remote) {
              console.log('[ForegroundService] Outside home zone (state: ' +
                `${geo.inside}). Stopping monitoring after this cycle.`);
              await updateDiagnostic('sg_fs_state', 'Remote / Stopping');
            }
          }

          await updateDiagnostic('sg_fs_state', remote ? 'Polling (Remote)' : 'Polling');

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
          
          // Run state analysis & alarm siren triggers (remote context applied)
          await detectAndAlert(telemetry, settings, { remote });

          // Format persistent notification text
          const gridStatusText = telemetry.gridRelayStatus === 'on'
            ? 'Grid Connected'
            : 'Grid OFFLINE';
          const solarText = telemetry.pvPower !== undefined ? `Solar: ${telemetry.pvPower}W` : 'Solar: 0W';
          const batteryText = `Battery: ${telemetry.batterySoc}% (${
            telemetry.batteryStatus === 'CHARGE' ? 'Charging' : telemetry.batteryStatus === 'DISCHARGE' ? 'Discharging' : 'Idle'
          })`;

          const body = remote
            ? `Remote · ${gridStatusText} · ${batteryText}`
            : `${gridStatusText} · ${solarText} · ${batteryText}`;

          // Update the persistent notification with the fresh stats
          await notifee.displayNotification({
            id: NOTIFICATION_ID,
            title: 'SolarGuard Monitoring',
            body,
            android: buildFgsNotificationConfig(!remote && settings.monitoringMode === 'geofenced'),
          });

          // Sleep until the next poll cycle
          const refreshMinutes = settings.refreshIntervalMinutes ?? 5;
          const delayMs = Math.max(1, refreshMinutes) * 60 * 1000;

          const now = Date.now();
          await updateDiagnostic('sg_fs_last_poll', String(now));
          await updateDiagnostic('sg_fs_next_poll', String(now + delayMs));

          // Defensive exit: geofenced mode + confirmed outside -> stop the FGS
          // now; native geofencing owns wake-up and background-fetch owns
          // remote polling from here on.
          if (remote) {
            console.log('[ForegroundService] Remote cycle complete. Stopping service.');
            isServiceRunning = false;
            abortSleep();
            try {
              await notifee.stopForegroundService();
            } catch (err) {
              console.warn('[ForegroundService] stopForegroundService failed:', err);
            }
            break;
          }

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
            android: buildFgsNotificationConfig(settings.monitoringMode === 'geofenced'),
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
   * Start the persistent foreground service.
   *
   * `reason` is diagnostics-only today (log tag), but callers distinguish
   * user-initiated starts from geofence-ENTER wake-ups.
   *
   * FGS type: `location` in geofenced mode (the loop performs periodic
   * zone verification and there is no OS time cap on location-typed FGS,
   * unlike dataSync's ~6h/24h limit on Android 14+), `dataSync` otherwise.
   */
  async startService(reason: 'user' | 'geofence-enter' | 'boot' = 'user'): Promise<void> {
    if (isServiceRunning) {
      console.log(`[ForegroundService] Service already running (start reason: ${reason}). Ignoring.`);
      return;
    }

    const settings = await SettingsStore.loadSettings();
    const isGeofenced = settings.monitoringMode === 'geofenced' && !!settings.homeZone;

    // Create the notification channel
    await notifee.createChannel({
      id: MONITORING_CHANNEL_ID,
      name: 'SolarGuard Monitoring Service',
      importance: AndroidImportance.DEFAULT,
    });

    // Request permissions (required for Android 13+)
    await notifee.requestPermission();

    console.log(`[ForegroundService] Starting service (reason: ${reason}, type: ${isGeofenced ? 'location' : 'dataSync'}).`);

    // Trigger the initial notification to start the foreground service
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: 'SolarGuard Monitoring',
      body: 'Connecting to SolarOS...',
      android: buildFgsNotificationConfig(isGeofenced),
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
