import * as BackgroundFetch from 'expo-background-fetch';

// Leaf module: owns the remote background-fetch registration so both the
// mode router (AppContext/geofenceService) and the dataSync-budget
// degradation path (foregroundService) can arm it without creating import
// cycles (geofenceService <-> geofenceTasks <-> foregroundService).

export const GEOFENCE_REMOTE_POLL_TASK = 'solarguard_remote_poll';
export const REMOTE_POLL_MIN_INTERVAL_MINUTES = 15;

export async function armRemotePolling(): Promise<void> {
  try {
    await BackgroundFetch.registerTaskAsync(GEOFENCE_REMOTE_POLL_TASK, {
      minimumInterval: REMOTE_POLL_MIN_INTERVAL_MINUTES,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log('[RemotePolling] Armed (15 min cadence).');
  } catch (error) {
    console.warn('[RemotePolling] Failed to arm:', error);
  }
}

export async function disarmRemotePolling(): Promise<void> {
  try {
    // unregisterTaskAsync is a no-op for unknown tasks; safe to call blindly.
    await BackgroundFetch.unregisterTaskAsync(GEOFENCE_REMOTE_POLL_TASK);
    console.log('[RemotePolling] Disarmed.');
  } catch (error) {
    console.warn('[RemotePolling] Failed to disarm:', error);
  }
}
