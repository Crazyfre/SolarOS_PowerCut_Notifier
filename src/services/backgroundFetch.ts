import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Store } from '../storage/secureStore';
import { fetchTelemetry } from '../api/solar';
import { detectAndAlert } from './stateDetector';

export const BACKGROUND_FETCH_TASK = 'SOLARGUARD_BACKGROUND_FETCH';

/**
 * Define the background fetch task.
 * This must be called at the module level (outside of any component).
 */
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const systemId = await Store.getSystemId();
    if (!systemId) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const telemetry = await fetchTelemetry(systemId);
    await detectAndAlert(telemetry);

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.warn('[BackgroundFetch] Error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background fetch task.
 * Call this after the user logs in.
 */
export async function registerBackgroundFetch(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_FETCH_TASK
    );
    if (isRegistered) return;

    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 5 * 60, // 5 minutes (Android may enforce 15 min in Doze)
      stopOnTerminate: false,  // Keep running after app close on Android
      startOnBoot: true,       // Resume after device restart
    });

    console.log('[BackgroundFetch] Task registered.');
  } catch (error) {
    console.warn('[BackgroundFetch] Registration failed:', error);
  }
}

/**
 * Unregister the background fetch task.
 * Call this on logout.
 */
export async function unregisterBackgroundFetch(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_FETCH_TASK
    );
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    }
  } catch (error) {
    console.warn('[BackgroundFetch] Unregistration failed:', error);
  }
}

/**
 * Check registration status for diagnostic display.
 */
export async function getBackgroundFetchStatus(): Promise<{
  isRegistered: boolean;
  status: BackgroundFetch.BackgroundFetchStatus | null;
}> {
  const status = await BackgroundFetch.getStatusAsync();
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    BACKGROUND_FETCH_TASK
  );
  return { isRegistered, status };
}
