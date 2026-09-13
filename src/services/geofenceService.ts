import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as BackgroundFetch from 'expo-background-fetch';
import { AppSettings, HomeZone } from '../types/telemetry';
import { GeofenceStore, isInsideZone } from '../storage/geofenceStore';
import { GEOFENCE_TASK, GEOFENCE_REMOTE_POLL_TASK } from './geofenceTasks';

export const MIN_ZONE_RADIUS_METERS = 100;
export const DEFAULT_ZONE_RADIUS_METERS = 250;
export const MAX_ZONE_RADIUS_METERS = 2000;

export const REMOTE_POLL_MIN_INTERVAL_MINUTES = 15;

let fenceRegistrationInFlight: Promise<boolean> | null = null;

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
  if (!isFinite(lat) || !isFinite(lng)) return null;
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
  const { background } = await getLocationPermissions();
  if (!background) {
    console.warn('[GeofenceService] Background location not granted — fence not armed.');
    return false;
  }
  if (fenceRegistrationInFlight) return fenceRegistrationInFlight;

  fenceRegistrationInFlight = (async () => {
    try {
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
    } finally {
      fenceRegistrationInFlight = null;
    }
  })();

  return fenceRegistrationInFlight;
}

export async function unregisterGeofence(): Promise<void> {
  try {
    const has = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    if (has) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  } catch (error) {
    console.warn('[GeofenceService] Failed to disarm fence:', error);
  }
  await GeofenceStore.setState({ registeredAt: null });
}

export async function isGeofenceRegistered(): Promise<boolean> {
  try {
    return await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  } catch {
    return false;
  }
}

// ─── Remote (outside-fence) periodic polling via background-fetch ────────────

export async function armRemotePolling(): Promise<void> {
  try {
    await BackgroundFetch.registerTaskAsync(GEOFENCE_REMOTE_POLL_TASK, {
      minimumInterval: REMOTE_POLL_MIN_INTERVAL_MINUTES,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log('[GeofenceService] Remote polling armed (15 min cadence).');
  } catch (error) {
    console.warn('[GeofenceService] Failed to arm remote polling:', error);
  }
}

export async function disarmRemotePolling(): Promise<void> {
  try {
    // unregisterTaskAsync is a no-op for unknown tasks; safe to call blindly.
    await BackgroundFetch.unregisterTaskAsync(GEOFENCE_REMOTE_POLL_TASK);
    console.log('[GeofenceService] Remote polling disarmed.');
  } catch (error) {
    console.warn('[GeofenceService] Failed to disarm remote polling:', error);
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
 */
export async function verifyInsideZone(
  zone: HomeZone
): Promise<boolean | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 1000,
    });
    return isInsideZone(zone, pos.coords.latitude, pos.coords.longitude);
  } catch {
    return null;
  }
}
