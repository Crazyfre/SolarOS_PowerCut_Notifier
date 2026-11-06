import notifee, { AndroidImportance, AndroidForegroundServiceType } from './nativeMonitoring';
import { Platform } from 'react-native';
import { fetchTelemetry } from '../api/solar';
import { Store } from '../storage/secureStore';
import { SettingsStore } from '../storage/settingsStore';
import { detectAndAlert } from './stateDetector';
import { GeofenceStore } from '../storage/geofenceStore';
import { verifyInsideZone, resolveEffectiveMode, isGeofenceRegistered } from './geofenceService';
import { DataSyncBudgetStore, isDataSyncBudgetEnforced } from '../storage/dataSyncBudgetStore';
import { armRemotePolling } from './remotePolling';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MONITORING_CHANNEL_ID = 'solarguard_monitoring_channel';
const NOTIFICATION_ID = 'solarguard_monitoring';

interface ServiceRun {
  cancelled: boolean;
  geofenced: boolean;
  outsideSamples: number;
  segmentStart: number | null;
  wake?: () => void;
}
let activeRun: ServiceRun | null = null;
let operations: Promise<void> = Promise.resolve();
const isCurrent = (run: ServiceRun) => activeRun === run && !run.cancelled;

function serialize(action: () => Promise<void>): Promise<void> {
  const pending = operations.then(action);
  operations = pending.catch(() => {});
  return pending;
}

async function updateDiagnostic(key: string, value: string): Promise<void> {
  try { await AsyncStorage.setItem(key, value); } catch { /* Non-fatal. */ }
}

function notificationConfig(geofenced: boolean): Parameters<typeof notifee.displayNotification>[0]['android'] {
  return {
    channelId: MONITORING_CHANNEL_ID,
    asForegroundService: true,
    ongoing: true,
    onlyAlertOnce: true,
    importance: AndroidImportance.DEFAULT,
    pressAction: { id: 'default' },
    // Always select one type explicitly. Omitting this activates every type
    // declared in the manifest, including location in always mode.
    foregroundServiceTypes: [geofenced
      ? AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_LOCATION
      : AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
  };
}

async function displayStatus(run: ServiceRun, body: string): Promise<void> {
  if (!isCurrent(run)) return;
  await notifee.displayNotification({ id: NOTIFICATION_ID, title: 'SolarGuard Monitoring', body,
    android: notificationConfig(run.geofenced) });
}

async function sleep(run: ServiceRun, ms: number): Promise<void> {
  if (!isCurrent(run)) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, ms);
    function finish() { clearTimeout(timer); run.wake = undefined; resolve(); }
    run.wake = finish;
  });
}

async function recordSegment(run: ServiceRun): Promise<void> {
  if (run.segmentStart === null) return;
  const now = Date.now();
  const start = run.segmentStart;
  run.segmentStart = now;
  await DataSyncBudgetStore.recordRuntime(start, now);
}

async function stopCurrentService(): Promise<void> {
  const run = activeRun;
  if (run) {
    run.cancelled = true;
    run.wake?.();
    activeRun = null;
    await recordSegment(run);
    run.segmentStart = null;
  }
  // Also stop a surviving native service when this JS runtime has no run.
  await notifee.stopForegroundService();
}

notifee.registerForegroundService(async () => {
  const run = activeRun;
  if (!run || run.cancelled) return;
  try {
    while (isCurrent(run)) {
      let stopAfterCycle = false;
      try {
        const settings = await SettingsStore.loadSettings();
        const systemId = await Store.getSystemId();
        const sessionVersion = Store.getSessionVersion();
        if (!isCurrent(run)) break;
        if (!systemId) { stopAfterCycle = true; break; }

        if (run.geofenced && settings.homeZone) {
          const geo = await GeofenceStore.getState();
          // Unknown must remain siren-capable until a confirmed EXIT.
          if (geo.inside === false) {
            stopAfterCycle = true;
          } else {
            const verified = await verifyInsideZone(settings.homeZone);
            if (!isCurrent(run)) break;
            run.outsideSamples = verified === false ? run.outsideSamples + 1 : 0;
            if (run.outsideSamples >= 2) {
              await GeofenceStore.setState({ inside: false, lastTransitionAt: Date.now() });
              await GeofenceStore.recordEvent({ kind: 'EXIT', at: Date.now(), detail: 'FGS location verification' });
              stopAfterCycle = true;
            } else if (verified === true && geo.inside === null) {
              await GeofenceStore.setState({ inside: true, lastTransitionAt: Date.now() });
            }
          }
        }

        if (!run.geofenced && isDataSyncBudgetEnforced()) {
          await recordSegment(run);
          if (await DataSyncBudgetStore.isExhausted()) {
            stopAfterCycle = true;
            // Handoff happens before the final HTTP request; an offline API
            // must not leave an exhausted foreground service running.
            await DataSyncBudgetStore.markDegraded();
            await armRemotePolling();
          }
        }
        if (!isCurrent(run)) break;
        await updateDiagnostic('sg_fs_state', stopAfterCycle ? 'Polling (Remote)' : 'Polling');
        const telemetry = await fetchTelemetry(systemId);
        if (!isCurrent(run) || sessionVersion !== Store.getSessionVersion() || systemId !== await Store.getSystemId()) break;
        // EXIT may have arrived while HTTP was in flight.
        const outside = run.geofenced && (await GeofenceStore.getState()).inside === false;
        await detectAndAlert(telemetry, settings, { remote: stopAfterCycle || outside });
        if (!isCurrent(run)) break;
        stopAfterCycle ||= outside;
        await displayStatus(run,
          `${telemetry.gridRelayStatus === 'on' ? 'Grid Connected' : 'Grid OFFLINE'} · Solar: ${telemetry.pvPower ?? 0}W · Battery: ${telemetry.batterySoc}%`);
        const refresh = settings.refreshIntervalMinutes;
        const delay = (Number.isFinite(refresh) ? Math.max(1, refresh) : 5) * 60_000;
        const now = Date.now();
        await updateDiagnostic('sg_fs_last_result', 'Success');
        await updateDiagnostic('sg_fs_last_poll', String(now));
        await updateDiagnostic('sg_fs_next_poll', String(now + delay));
        await updateDiagnostic('sg_fs_state', stopAfterCycle ? 'Remote / Stopping' : 'Waiting for Next Poll');
        if (!stopAfterCycle) await sleep(run, delay);
      } catch (error) {
        if (!isCurrent(run)) break;
        const auth = error instanceof Error && error.message === 'AUTH_REQUIRED';
        await updateDiagnostic('sg_fs_state', 'Error / Retrying');
        await updateDiagnostic('sg_fs_last_result', auth ? 'Authentication Error' : 'API / Network Error');
        try { await displayStatus(run, auth ? 'Monitoring Paused · Login Required' : 'Monitoring Active · Connection Issue'); }
        catch (notificationError) { console.warn('[ForegroundService] Status update failed:', notificationError); }
        if (!stopAfterCycle) await sleep(run, auth ? 300_000 : 60_000);
      } finally {
        if (stopAfterCycle && isCurrent(run)) {
          await stopCurrentService();
        }
      }
    }
  } catch (error) {
    console.warn('[ForegroundService] Monitoring stopped unexpectedly:', error);
  } finally {
    // A cancelled request may finish after a replacement run has started.
    // It must never stop or update that replacement service.
    if (isCurrent(run)) {
      try { await stopCurrentService(); } catch (error) { console.warn('[ForegroundService] Stop failed:', error); }
    }
  }
});

export const ForegroundServiceManager = {
  startService(reason: 'user' | 'geofence-enter' | 'boot' = 'user'): Promise<void> {
    if (Platform.OS !== 'android') return Promise.resolve();
    return serialize(async () => {
      const settings = await SettingsStore.loadSettings();
      const geofenced = await resolveEffectiveMode(settings) === 'geofenced' && await isGeofenceRegistered();
      if (activeRun && !activeRun.cancelled && activeRun.geofenced === geofenced) return;
      if (activeRun) await stopCurrentService();
      if (!(await Store.getSystemId())) return;
      await notifee.createChannel({ id: MONITORING_CHANNEL_ID, name: 'SolarGuard Monitoring Service', importance: AndroidImportance.DEFAULT });
      if (reason === 'user') await notifee.requestPermission();
      const run: ServiceRun = { cancelled: false, geofenced, outsideSamples: 0,
        segmentStart: !geofenced && isDataSyncBudgetEnforced() ? Date.now() : null };
      activeRun = run;
      try { await displayStatus(run, 'Connecting to SolarOS...'); }
      catch (error) { if (activeRun === run) activeRun = null; run.cancelled = true; throw error; }
    });
  },
  stopService(): Promise<void> {
    // Invalidate immediately, including while a network request is awaiting.
    if (activeRun) { activeRun.cancelled = true; activeRun.wake?.(); }
    if (Platform.OS !== 'android') return Promise.resolve();
    return serialize(stopCurrentService);
  },
  isServiceRunning: () => activeRun !== null && !activeRun.cancelled,
};
