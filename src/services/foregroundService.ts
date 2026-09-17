import notifee, { AndroidImportance, AndroidForegroundServiceType } from '@notifee/react-native';
import { fetchTelemetry } from '../api/solar';
import { Store } from '../storage/secureStore';
import { SettingsStore } from '../storage/settingsStore';
import type { AppSettings } from '../types/telemetry';
import { detectAndAlert } from './stateDetector';
import { GeofenceStore } from '../storage/geofenceStore';
import { verifyInsideZone } from './geofenceService';
import { DataSyncBudgetStore, isDataSyncBudgetEnforced } from '../storage/dataSyncBudgetStore';
import { pollOnce } from './geofenceTasks';
import { armRemotePolling } from './remotePolling';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MONITORING_CHANNEL_ID = 'solarguard_monitoring_channel';
const NOTIFICATION_ID = 'solarguard_monitoring';

let isServiceRunning = false;
let loopPromiseResolver: (() => void) | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let sleepResolver: (() => void) | null = null;

// Anti-flap hysteresis counter for missed-EXIT detection (see loop guard).
let consecutiveOutsideSamples = 0;

// dataSync budget bookkeeping for the current FGS session (always mode,
// Android 15+). sessionStartMs is null when not tracking.
let sessionStartMs: number | null = null;

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
/**
 * Resolve the FGS runtime type and the OS-budget policy for a settings snapshot.
 * Single source of truth shared by every call site (start, poll, error paths):
 *   - 'location' FGS (no OS time cap) when the geofenced config is active;
 *   - 'dataSync' FGS otherwise (Android 15+ ~6h/24h cap → budget ledger).
 * The type must be identical on EVERY displayNotification call while the
 * service runs (Notifee re-invokes startForeground when the type changes),
 * so it is resolved from settings, not from per-cycle remote flags.
 */
function resolveFgsRuntime(settings: AppSettings): { geofenced: boolean; budgetApplies: boolean } {
  const geofenced = settings.monitoringMode === 'geofenced' && !!settings.homeZone;
  return { geofenced, budgetApplies: !geofenced && isDataSyncBudgetEnforced() };
}

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

          // ── Geofenced mode guard + self-healing ───────────────────────────
          // Two verification layers while the FGS runs in geofenced mode:
          //   a) Fence-state: if the store says we're outside, do one remote
          //      poll then stop (stale run, e.g. missed EXIT event).
          //   b) Location sample: if the store still says "inside" but a real
          //      fix disagrees twice in a row, correct the missed EXIT:
          //      update the store and treat this cycle as remote.
          // (b) is the anti-flap hysteresis: a single bad GPS fix never
          // kills monitoring; two consecutive ones do.
          let remote = false;
          if (settings.monitoringMode === 'geofenced' && settings.homeZone) {
            const zone = settings.homeZone;
            const geo = await GeofenceStore.getState();

            if (geo.inside !== true) {
              remote = true;
              console.log('[ForegroundService] Outside home zone (state: ' +
                `${geo.inside}). Stopping monitoring after this cycle.`);
              await updateDiagnostic('sg_fs_state', 'Remote / Stopping');
            } else {
              const verified = await verifyInsideZone(zone);
              if (verified === false) {
                consecutiveOutsideSamples += 1;
                console.warn(`[ForegroundService] Location sample says outside zone ` +
                  `(${consecutiveOutsideSamples}/2 consecutive).`);
                if (consecutiveOutsideSamples >= 2) {
                  console.warn('[ForegroundService] Missed EXIT detected — correcting state.');
                  await GeofenceStore.setState({ inside: false, lastTransitionAt: Date.now() });
                  await GeofenceStore.recordEvent({
                    kind: 'EXIT',
                    at: Date.now(),
                    detail: 'detected by FGS location verification (missed geofence event)',
                  });
                  remote = true;
                  await updateDiagnostic('sg_fs_state', 'Remote / Stopping (missed EXIT corrected)');
                }
              } else if (verified === true) {
                consecutiveOutsideSamples = 0;
              }
              // verified === null: can't get a fix — keep current state
              // (fail loud: siren-capable monitoring continues).
            }
          } else {
            consecutiveOutsideSamples = 0;
          }

          // ── dataSync budget guard (dataSync-typed runs, Android 15+) ────
          // Android 15 enforces ~6h/24h for dataSync FGS. Notifee's AAR
          // predates onTimeout, so we self-enforce with a margin: when the
          // 24h budget is spent, run this cycle remote (notification-only
          // alarms) and stop the service instead of letting the OS kill it.
          // Remote background-fetch (~15 min) keeps detection alive; the
          // budget window rolls and the next app-open re-arms the FGS.
          // Applies to every dataSync-typed run: always mode proper AND the
          // geofenced-without-zone / fence-arm-failure fallbacks.
          const { geofenced: isLocationTyped, budgetApplies } = resolveFgsRuntime(settings);
          let degradedForBudget = false;
          if (!remote && budgetApplies) {
            if (sessionStartMs === null) {
              sessionStartMs = Date.now();
            }
            await DataSyncBudgetStore.recordRuntime(sessionStartMs, Date.now());
            sessionStartMs = Date.now(); // segment recorded; start fresh segment

            if (await DataSyncBudgetStore.isExhausted()) {
              degradedForBudget = true;
              remote = true;
              console.warn('[ForegroundService] dataSync 24h budget exhausted — degrading to remote polling.');
              await updateDiagnostic('sg_fs_state', 'Budget Exhausted / Stopping');
              await updateDiagnostic('sg_fs_last_result', 'dataSync Budget Exhausted');
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

          // Update the persistent notification with the fresh stats. The FGS
          // type is resolved from settings so it stays identical across every
          // displayNotification call while this service runs (remote cycles
          // included) — Notifee re-invokes startForeground if the type flips.
          await notifee.displayNotification({
            id: NOTIFICATION_ID,
            title: 'SolarGuard Monitoring',
            body,
            android: buildFgsNotificationConfig(isLocationTyped),
          });

          // Sleep until the next poll cycle
          const refreshMinutes = settings.refreshIntervalMinutes ?? 5;
          const delayMs = Math.max(1, refreshMinutes) * 60 * 1000;

          const now = Date.now();
          await updateDiagnostic('sg_fs_last_poll', String(now));
          await updateDiagnostic('sg_fs_next_poll', String(now + delayMs));

          // Defensive exits — stop the FGS now instead of burning battery or
          // risking an OS dataSync-timeout crash:
          //  a) geofenced mode + confirmed outside: native geofencing owns
          //     wake-up; background-fetch (armed by the mode router) owns
          //     remote polling from here.
          //  b) always mode + 24h dataSync budget exhausted: degrade to the
          //     background-fetch cadence until the window rolls. Arm it here
          //     because always mode normally never registers that task.
          if (remote) {
            console.log('[ForegroundService] Remote cycle complete. Stopping service.');
            if (degradedForBudget) {
              // Remote polling must take over detection for the rest of the
              // 24h window. shouldRemotePoll() admits always-mode degraded
              // runs via the budget store's exhausted flag.
              await DataSyncBudgetStore.markDegraded().catch(() => {});
              await armRemotePolling().catch(() => {});
            }
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

          // Update persistent notification to show connection issue / paused state.
          // Same settings-resolved FGS type as the poll path — never per-cycle.
          await notifee.displayNotification({
            id: NOTIFICATION_ID,
            title: 'SolarGuard Monitoring',
            body: errorBody,
            android: buildFgsNotificationConfig(resolveFgsRuntime(settings).geofenced),
          });

          const now = Date.now();
          await updateDiagnostic('sg_fs_last_poll', String(now));
          const delayMs = isAuthError ? 5 * 60 * 1000 : 60 * 1000;
          await updateDiagnostic('sg_fs_next_poll', String(now + delayMs));

          await cancelableSleep(delayMs);
        }
      }

      console.log('[ForegroundService] Service Stopped.');
      // Close the dataSync budget segment if the loop ended without
      // stopService() (remote-cycle defensive exits break out of the loop).
      if (sessionStartMs !== null) {
        const end = Date.now();
        DataSyncBudgetStore.recordRuntime(sessionStartMs, end).catch(() => {});
        sessionStartMs = null;
      }
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
    const isGeofenced = resolveFgsRuntime(settings).geofenced;

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
    // Close the dataSync budget segment for the session being stopped.
    if (sessionStartMs !== null) {
      const end = Date.now();
      DataSyncBudgetStore.recordRuntime(sessionStartMs, end).catch(() => {});
      sessionStartMs = null;
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
