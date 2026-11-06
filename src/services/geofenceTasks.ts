import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { LocationGeofencingEventType } from 'expo-location';
import { fetchTelemetry } from '../api/solar';
import { Store } from '../storage/secureStore';
import { SettingsStore } from '../storage/settingsStore';
import { GeofenceStore } from '../storage/geofenceStore';
import { detectAndAlert } from './stateDetector';
import { ForegroundServiceManager } from './foregroundService';
import { GEOFENCE_REMOTE_POLL_TASK } from './remotePolling';
import { isDataSyncBudgetEnforced, DataSyncBudgetStore } from '../storage/dataSyncBudgetStore';

export const GEOFENCE_TASK = 'solarguard_home_geofence';

/**
 * Run one telemetry poll + detection with the fence context applied.
 * Shared by the FGS loop, the headless geofence task and the background-fetch
 * remote poll. In remote mode (outside zone) detection still runs — only the
 * audible siren is suppressed (see notifications.getNotificationRouting).
 */
export async function pollOnce(remote: boolean): Promise<void> {
  const systemId = await Store.getSystemId();
  if (!systemId) return;

  const settings = await SettingsStore.loadSettings();
  const version = Store.getSessionVersion();
  const telemetry = await fetchTelemetry(systemId);
  if (version !== Store.getSessionVersion() || systemId !== await Store.getSystemId()) return;
  await detectAndAlert(telemetry, settings, { remote });
}

/**
 * Determine whether a background-fetch run should perform a remote poll.
 * Admits two cases:
 *  1. Geofenced mode + device outside (or unknown) zone — the normal
 *     away-from-home remote monitoring path.
 *  2. Any dataSync-typed run (always mode, incl. the geofenced-without-zone
 *     and fence-arm-failure fallbacks) on Android 15+ whose 24h dataSync FGS
 *     budget is spent — detection continues at remote cadence
 *     (notification-only alarms) until the window rolls and the user
 *     re-opens the app.
 * Exported for diagnostics and testing.
 */
export async function shouldRemotePoll(): Promise<boolean> {
  const settings = await SettingsStore.loadSettings();

  if (settings.monitoringMode === 'geofenced') {
    if (settings.homeZone) {
      const state = await GeofenceStore.getState();
      if (state.inside !== true || !ForegroundServiceManager.isServiceRunning()) return true;
    }
  }

  // 'always' mode (and its dataSync-typed fallback shapes): only when the OS
  // budget applies AND we've flagged degradation. The exhausted flag is set
  // by the FGS loop right before it stops itself — see the dataSync guard in
  // foregroundService.
  if (!isDataSyncBudgetEnforced()) return false;
  const budget = await DataSyncBudgetStore.getState();
  return budget.exhausted === true;
}

/**
 * Shared ENTER/EXIT transition handler. Called by:
 *  - the real headless geofence task (Play Services fence events), and
 *  - the Developer Options geofence simulator (same code path, so tests
 *    exercise exactly what production runs).
 * Records transition latency: task entry -> monitoring FGS started.
 */
export async function handleGeofenceTransition(isEnter: boolean): Promise<void> {
  const settings = await SettingsStore.loadSettings();
  // Ignore late deliveries from a fence that was removed or a signed-out account.
  if (settings.monitoringMode !== 'geofenced' || !settings.homeZone || !(await Store.getSystemId())) return;
  const transitionStart = Date.now();

  if (isEnter) {
    await GeofenceStore.setState({ inside: true, lastTransitionAt: transitionStart });
    await GeofenceStore.recordEvent({ kind: 'ENTER', at: transitionStart });
    await GeofenceStore.stampBootMarker();

    // Waking into the zone: start the monitoring FGS (siren-capable).
    // If Android refuses the background FGS start, the poll loop's next
    // in-app run or the user opening the app recovers it.
    try {
      await ForegroundServiceManager.startService('geofence-enter');
      const latency = Date.now() - transitionStart;
      await GeofenceStore.recordTransitionLatency('ENTER', latency);
      console.log(`[GeofenceTask] ENTER -> monitoring service started (${latency}ms).`);
    } catch (err) {
      console.warn('[GeofenceTask] ENTER -> FGS start failed:', err);
    }
  } else {
    await GeofenceStore.setState({ inside: false, lastTransitionAt: transitionStart });
    await GeofenceStore.recordEvent({ kind: 'EXIT', at: transitionStart });
    await GeofenceStore.stampBootMarker();

    // Stop before waiting for HTTP: a headless execution deadline or offline
    // API must never leave the local monitoring service running outside.
    await ForegroundServiceManager.stopService().catch((err) => {
      console.warn('[GeofenceTask] EXIT -> FGS stop failed:', err);
    });

    // Run a final remote poll to update the transition baseline.
    try {
      await pollOnce(true);
    } catch (err) {
      console.warn('[GeofenceTask] EXIT -> final poll failed:', err);
    }

    try {
      const latency = Date.now() - transitionStart;
      await GeofenceStore.recordTransitionLatency('EXIT', latency);
      console.log(`[GeofenceTask] EXIT -> monitoring service stopped (${latency}ms).`);
    } catch (err) {
      console.warn('[GeofenceTask] EXIT -> FGS stop failed:', err);
    }
  }
}

/**
 * ENTER/EXIT headless task. Android spins up the process and TaskManager
 * boots a headless JS context to execute this — even when the app was killed.
 */
async function geofenceTaskExecutor({
  data,
  error,
}: TaskManager.TaskManagerTaskBody<{
  eventType: number;
  region?: { identifier?: string; latitude?: number; longitude?: number };
}>): Promise<void> {
  if (error) {
    console.warn('[GeofenceTask] Error:', error.message);
    await GeofenceStore.recordEvent({
      kind: 'ERROR',
      at: Date.now(),
      detail: error.message,
    });
    return;
  }

  const eventType = data?.eventType;
  const region = data?.region;

  if (eventType !== LocationGeofencingEventType.Enter && eventType !== LocationGeofencingEventType.Exit) return;

  const isEnter = eventType === LocationGeofencingEventType.Enter;

  console.log(
    `[GeofenceTask] ${isEnter ? 'ENTER' : 'EXIT'} event at ${Date.now()}` +
      (region ? ` (${region.identifier})` : '')
  );

  await handleGeofenceTransition(isEnter);
}

TaskManager.defineTask(GEOFENCE_TASK, geofenceTaskExecutor);

/**
 * Background-fetch task: periodic low-cadence telemetry check while the
 * device is outside the home zone (or geofenced mode is inactive).
 * Grid transitions are still detected; alarms degrade to notifications.
 */
async function remotePollTaskExecutor(): Promise<BackgroundFetch.BackgroundFetchResult> {
  if (!(await shouldRemotePoll())) {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  console.log('[RemotePoll] Background telemetry check running...');
  try {
    await pollOnce(true);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg === 'AUTH_REQUIRED') {
      console.warn('[RemotePoll] Login required — skipping cycles until re-auth.');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    console.warn('[RemotePoll] Poll failed:', msg);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
  return BackgroundFetch.BackgroundFetchResult.NewData;
}

TaskManager.defineTask(GEOFENCE_REMOTE_POLL_TASK, remotePollTaskExecutor);
