import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { HomeZone } from '../types/telemetry';
import OutageAlarm from '../../modules/outage-alarm';

// Single source of truth for runtime fence state. Read by the FGS poll loop
// and the headless geofence task; survives process restarts.

const FENCE_STATE_KEY = 'sg_geo_state';
const FENCE_LAST_EVENT_KEY = 'sg_geo_last_event';
const FENCE_BOOT_MARKER_KEY = 'sg_geo_boot_marker';
const FENCE_LAST_TRANSITION_LATENCY_KEY = 'sg_geo_last_transition_latency';
let stateWrites: Promise<void> = Promise.resolve();

function writeState<T>(action: () => Promise<T>): Promise<T> {
  const pending = stateWrites.then(action);
  stateWrites = pending.then(() => {}, () => {});
  return pending;
}

export interface GeofenceState {
  /** true = inside home zone, false = outside, null = never seen a transition */
  inside: boolean | null;
  lastTransitionAt: number | null;
  registeredAt: number | null;
}

export type GeofenceEventKind = 'ENTER' | 'EXIT' | 'ERROR';

export interface GeofenceEventRecord {
  kind: GeofenceEventKind;
  at: number;
  /** human-readable detail, e.g. error text */
  detail?: string;
}

export const GeofenceStore = {
  async getState(): Promise<GeofenceState> {
    try {
      const raw = await AsyncStorage.getItem(FENCE_STATE_KEY);
      if (!raw) return { inside: null, lastTransitionAt: null, registeredAt: null };
      return JSON.parse(raw) as GeofenceState;
    } catch {
      return { inside: null, lastTransitionAt: null, registeredAt: null };
    }
  },

  async setState(next: Partial<GeofenceState>): Promise<GeofenceState> {
    return writeState(async () => {
      const current = await this.getState();
      const merged: GeofenceState = { ...current, ...next };
      try {
        await AsyncStorage.setItem(FENCE_STATE_KEY, JSON.stringify(merged));
      } catch (error) {
        console.warn('[GeofenceStore] Failed to persist fence state:', error);
      }
      return merged;
    });
  },

  async recordEvent(event: GeofenceEventRecord): Promise<void> {
    try {
      await AsyncStorage.setItem(FENCE_LAST_EVENT_KEY, JSON.stringify(event));
    } catch {
      // Non-fatal
    }
  },

  async getLastEvent(): Promise<GeofenceEventRecord | null> {
    try {
      const raw = await AsyncStorage.getItem(FENCE_LAST_EVENT_KEY);
      return raw ? (JSON.parse(raw) as GeofenceEventRecord) : null;
    } catch {
      return null;
    }
  },

  async clear(): Promise<void> {
    return writeState(async () => {
      try {
        await AsyncStorage.multiRemove([FENCE_STATE_KEY, FENCE_LAST_EVENT_KEY, FENCE_BOOT_MARKER_KEY, FENCE_LAST_TRANSITION_LATENCY_KEY]);
      } catch {
        // Non-fatal
      }
    });
  },

  /**
   * Boot-identity helper: returns a stable string that is constant within
   * one device boot and (practically always) changes across reboots.
   * Read natively from the OS boot counter. Returns null off-Android
   * or when the native module is unavailable.
   */
  async getBootId(): Promise<string | null> {
    if (Platform.OS !== 'android') return null;
    try {
      const bootId = OutageAlarm.getBootId();
      return bootId || null;
    } catch {
      return null;
    }
  },

  /**
   * Authoritative reboot check: compares the persisted boot identity with
   * the current one. Android wipes geofence registrations on reboot, so a
   * surviving `inside` flag is stale — callers reset state to unknown and
   * re-determine position (fail-loud: siren-capable until re-verified).
   */
  async shouldResetFenceState(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(FENCE_BOOT_MARKER_KEY);
      if (!raw) return false; // nothing recorded yet — nothing to reset
      const marker = JSON.parse(raw) as { wallClock: number; bootId: string };
      const bootId = await GeofenceStore.getBootId();
      if (!bootId) return false; // can't determine — don't thrash state
      return marker.bootId !== bootId;
    } catch {
      return false;
    }
  },

  /** Invalidate persisted fence state (e.g. after reboot detection). */
  async invalidateState(): Promise<void> {
    return writeState(async () => {
      try {
        await AsyncStorage.setItem(FENCE_STATE_KEY, JSON.stringify({
          inside: null,
          lastTransitionAt: null,
          registeredAt: null,
        }));
        await GeofenceStore.recordEvent({
          kind: 'ERROR',
          at: Date.now(),
          detail: 'fence state reset (device reboot or fence re-registration)',
        });
      } catch {
        // Non-fatal
      }
    });
  },

  /** Persist the current boot identity alongside fence state. */
  async stampBootMarker(): Promise<void> {
    try {
      const bootId = await GeofenceStore.getBootId();
      if (!bootId) return;
      await AsyncStorage.setItem(
        FENCE_BOOT_MARKER_KEY,
        JSON.stringify({ wallClock: Date.now(), bootId })
      );
    } catch {
      // Non-fatal
    }
  },

  /**
   * Record the measured ENTER-transition latency (task entry -> monitoring
   * FGS started), in ms. Written by the geofence task; surfaced in the
   * Developer Options diagnostics panel.
   */
  async recordTransitionLatency(kind: 'ENTER' | 'EXIT', latencyMs: number): Promise<void> {
    try {
      await AsyncStorage.setItem(
        FENCE_LAST_TRANSITION_LATENCY_KEY,
        JSON.stringify({ kind, latencyMs, at: Date.now() })
      );
    } catch {
      // Non-fatal
    }
  },

  async getTransitionLatency(): Promise<{ kind: 'ENTER' | 'EXIT'; latencyMs: number; at: number } | null> {
    try {
      const raw = await AsyncStorage.getItem(FENCE_LAST_TRANSITION_LATENCY_KEY);
      return raw ? (JSON.parse(raw) as { kind: 'ENTER' | 'EXIT'; latencyMs: number; at: number }) : null;
    } catch {
      return null;
    }
  },
};

/**
 * Haversine distance in meters between two coordinates.
 */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function isInsideZone(zone: HomeZone, lat: number, lng: number): boolean {
  return distanceMeters(zone.lat, zone.lng, lat, lng) <= zone.radiusMeters;
}
