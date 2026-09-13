import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { LocationGeofencingEventType } from 'expo-location';
import { fetchTelemetry } from '../api/solar';
import { Store } from '../storage/secureStore';
import { SettingsStore } from '../storage/settingsStore';
import { GeofenceStore } from '../storage/geofenceStore';
import { detectAndAlert } from './stateDetector';
import { ForegroundServiceManager } from './foregroundService';

export const GEOFENCE_TASK = 'solarguard_home_geofence';
export const GEOFENCE_REMOTE_POLL_TASK = 'solarguard_remote_poll';

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
  const telemetry = await fetchTelemetry(systemId);
  await detectAndAlert(telemetry, settings, { remote });
}

/**
 * Determine whether a background-fetch run should perform a remote poll.
 * Exported for diagnostics and testing.
 */
export async function shouldRemotePoll(): Promise<boolean> {
  const settings = await SettingsStore.loadSettings();
  if (settings.monitoringMode !== 'geofenced' || !settings.homeZone) return false;
  const state = await GeofenceStore.getState();
  return state.inside !== true; // poll when outside or unknown
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

  const isEnter = eventType === LocationGeofencingEventType.Enter;

  console.log(
    `[GeofenceTask] ${isEnter ? 'ENTER' : 'EXIT'} event at ${Date.now()}` +
      (region ? ` (${region.identifier})` : '')
  );

  if (isEnter) {
    await GeofenceStore.setState({ inside: true, lastTransitionAt: Date.now() });
    await GeofenceStore.recordEvent({ kind: 'ENTER', at: Date.now() });

    // Waking into the zone: start the monitoring FGS (siren-capable).
    // If Android refuses the background FGS start, the poll loop's next
    // in-app run or the user opening the app recovers it.
    try {
      await ForegroundServiceManager.startService('geofence-enter');
      console.log('[GeofenceTask] ENTER -> monitoring service started.');
    } catch (err) {
      console.warn('[GeofenceTask] ENTER -> FGS start failed:', err);
    }
  } else {
    await GeofenceStore.setState({ inside: false, lastTransitionAt: Date.now() });
    await GeofenceStore.recordEvent({ kind: 'EXIT', at: Date.now() });

    // Leaving the zone: run a final poll with remote flag so the transition
    // diff is up to date, then stop the FGS entirely.
    try {
      await pollOnce(true);
    } catch (err) {
      console.warn('[GeofenceTask] EXIT -> final poll failed:', err);
    }

    try {
      await ForegroundServiceManager.stopService();
      console.log('[GeofenceTask] EXIT -> monitoring service stopped.');
    } catch (err) {
      console.warn('[GeofenceTask] EXIT -> FGS stop failed:', err);
    }
  }
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
