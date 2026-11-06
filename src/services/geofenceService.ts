import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { AppSettings, HomeZone } from '../types/telemetry';
import { GeofenceStore, isInsideZone } from '../storage/geofenceStore';
import { DevOverridesStore } from '../storage/devOverridesStore';
import { GEOFENCE_TASK } from './geofenceTasks';
import {
  GEOFENCE_REMOTE_POLL_TASK,
  REMOTE_POLL_MIN_INTERVAL_MINUTES,
  armRemotePolling,
  disarmRemotePolling,
} from './remotePolling';

export const MIN_ZONE_RADIUS_METERS = 100;
export const DEFAULT_ZONE_RADIUS_METERS = 250;
export const MAX_ZONE_RADIUS_METERS = 2000;

// Re-exported for existing imports (SettingsScreen, AppContext).
export { armRemotePolling, disarmRemotePolling };
export { REMOTE_POLL_MIN_INTERVAL_MINUTES, GEOFENCE_REMOTE_POLL_TASK };

let fenceOperations: Promise<void> = Promise.resolve();

function serializeFence<T>(action: () => Promise<T>): Promise<T> {
  const pending = fenceOperations.then(action);
  fenceOperations = pending.then(() => {}, () => {});
  return pending;
}

/**
 * Request foreground location permission (step 1 of the two-step flow).
 */
export async function requestForegroundLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Request background location permission (step 2). Requires foreground grant.
 * On Android 10+ this is the "Allow all the time" grant — without it the
 * geofence cannot deliver transitions while the app is backgrounded.
 */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status === 'granted';
}

export async function getLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const [fg, bg] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return { foreground: fg.status === 'granted', background: bg.status === 'granted' };
}

/**
 * High-accuracy one-shot fix for "Use current location".
 */
export async function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    mayShowUserSettingsDialog: true,
  });
  return {
    lat: Number(pos.coords.latitude.toFixed(6)),
    lng: Number(pos.coords.longitude.toFixed(6)),
  };
}

/**
 * Validate + normalize a home zone. Returns null when invalid.
 */
export function normalizeZone(lat: number, lng: number, radius: number): HomeZone | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const radiusMeters = Math.min(
    MAX_ZONE_RADIUS_METERS,
    Math.max(MIN_ZONE_RADIUS_METERS, Math.round(radius))
  );
  return { lat, lng, radiusMeters };
}

/**
 * Arm the native geofence for the given zone. Idempotent — expo-location
 * replaces the previous registration on re-arm. Registration includes
 * INITIAL_TRIGGER (expo-location default), so an immediate ENTER fires if
 * the device is already inside the zone.
 */
export async function registerGeofence(zone: HomeZone): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return serializeFence(async () => {
      try {
        const { background } = await getLocationPermissions();
        if (!background) return false;
        await Location.startGeofencingAsync(GEOFENCE_TASK, [
          {
            identifier: 'solarguard_home_zone',
            latitude: zone.lat,
            longitude: zone.lng,
            radius: zone.radiusMeters,
            notifyOnEnter: true,
            notifyOnExit: true,
          },
        ]);
        await GeofenceStore.setState({ registeredAt: Date.now() });
        console.log('[GeofenceService] Fence armed:', zone);
        return true;
      } catch (error) {
        console.warn('[GeofenceService] Failed to arm fence:', error);
        return false;
      }
  });
}

export async function unregisterGeofence(): Promise<void> {
  return serializeFence(async () => {
    try {
      const has = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
      if (has) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    } catch (error) {
      console.warn('[GeofenceService] Failed to disarm fence:', error);
    }
    await GeofenceStore.setState({ registeredAt: null });
  });
}

export async function isGeofenceRegistered(): Promise<boolean> {
  try {
    return await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  } catch {
    return false;
  }
}

// ─── Mode router helpers ─────────────────────────────────────────────────────

/**
 * Effective monitoring mode: 'geofenced' is only honored when a valid zone
 * exists AND background location permission is granted. Everything else
 * degrades to 'always' (legacy full-time monitoring).
 */
export async function resolveEffectiveMode(
  settings: AppSettings
): Promise<'always' | 'geofenced'> {
  if (settings.monitoringMode !== 'geofenced' || !settings.homeZone) return 'always';
  try {
    const { background } = await getLocationPermissions();
    return background ? 'geofenced' : 'always';
  } catch {
    return 'always';
  }
}

/**
 * The single location gate used by the alarm pipeline:
 * - 'always' mode or unknown fence state -> allow audible siren (fail loud).
 * - 'geofenced' mode + inside zone       -> allow audible siren.
 * - 'geofenced' mode + outside zone     -> suppress siren; notification only.
 */
export async function shouldPlaySiren(settings: AppSettings): Promise<boolean> {
  const mode = await resolveEffectiveMode(settings);
  if (mode === 'always') return true;
  const { inside } = await GeofenceStore.getState();
  if (inside === null) return true; // fail loud on unknown state
  return inside;
}

/**
 * One fused-location sanity sample to verify we are truly inside the zone.
 * Used defensively by the FGS poll loop (missed-EXIT self-healing).
 * Returns null when unavailable; caller treats null as "cannot verify".
 * Honors the Developer Options mock position when overrides are enabled.
 */
export async function verifyInsideZone(
  zone: HomeZone
): Promise<boolean | null> {
  try {
    const overrides = await DevOverridesStore.getOverrides();
    if (overrides.enabled && overrides.mockPosition) {
      const { lat, lng } = overrides.mockPosition;
      return isInsideZone(zone, lat, lng);
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => { timeout = setTimeout(() => resolve(null), 8000); }),
      ]);
      return pos ? isInsideZone(zone, pos.coords.latitude, pos.coords.longitude) : null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}
