import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ─── Android 15+ dataSync FGS budget ─────────────────────────────────────────
//
// Android 14 introduced and Android 15+ strictly enforces a ~6-hour cumulative
// limit per 24-hour window on dataSync-typed foreground services. When the
// budget is exhausted the system calls Service.onTimeout() and the app must
// stop the service — Android 15 crashes apps that keep running ('dataSync
// timed out' ForegroundServiceDidNotStopInTimeException).
//
// The Notifee AAR (20210826) predates onTimeout support, so the OS callback
// is invisible to us. We therefore SELF-ENFORCE with a safety margin:
// track a rolling 24h window of FGS runtime, and stop proactively at
// DATA_SYNC_SELF_LIMIT_HOURS, degrading always-mode monitoring to the
// 15-min remote background-fetch cadence (notification-only alarms) for
// the remainder of the window.
//
// Geofenced mode is unaffected: it runs a 'location'-typed FGS which has
// no time cap.

const BUDGET_KEY = 'sg_fs_datasync_budget';
const DATA_SYNC_SELF_LIMIT_HOURS = 5.5; // 6h OS cap minus 30min safety margin
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Self-imposed cap in hours — surfaced in Developer diagnostics. */
export const SELF_LIMIT_HOURS = DATA_SYNC_SELF_LIMIT_HOURS;

export interface DataSyncBudgetState {
  /** (startMs, endMs) FGS runtime segments inside the current 24h window. */
  segments: [number, number][];
  /** true when the self-limit was hit and monitoring degraded to remote polling */
  exhausted: boolean;
}

function pruneSegments(segments: [number, number][], now: number): [number, number][] {
  const cutoff = now - WINDOW_MS;
  return segments.filter(([, end]) => end > cutoff);
}

function totalRuntimeMs(segments: [number, number][], now: number): number {
  let total = 0;
  for (const [start, end] of segments) {
    const effectiveEnd = Math.min(end, now);
    if (effectiveEnd > start) total += effectiveEnd - start;
  }
  return total;
}

/** True when the OS dataSync budget applies (Android 15+ / API 35+). */
export function isDataSyncBudgetEnforced(): boolean {
  // Platform.Version on Android is the API level
  return Platform.OS === 'android' && (Platform.Version as number) >= 35;
}

export const SELF_LIMIT_MS = DATA_SYNC_SELF_LIMIT_HOURS * 60 * 60 * 1000;

export const DataSyncBudgetStore = {
  async getState(): Promise<DataSyncBudgetState> {
    try {
      const raw = await AsyncStorage.getItem(BUDGET_KEY);
      if (!raw) return { segments: [], exhausted: false };
      const parsed = JSON.parse(raw) as DataSyncBudgetState;
      return {
        segments: Array.isArray(parsed.segments) ? parsed.segments : [],
        exhausted: parsed.exhausted === true,
      };
    } catch {
      return { segments: [], exhausted: false };
    }
  },

  /**
   * Record that the dataSync FGS ran from startMs to endMs (or is still
   * running — pass now for endMs). Prunes segments older than 24h.
   */
  async recordRuntime(startMs: number, endMs: number): Promise<DataSyncBudgetState> {
    const state = await this.getState();
    const now = endMs;
    const segments = pruneSegments([...state.segments], now);
    if (endMs > startMs) {
      segments.push([startMs, endMs]);
    }
    const next: DataSyncBudgetState = {
      segments,
      // Once marked degraded, stay degraded until the window rolls enough
      // that used runtime drops meaningfully below the limit.
      exhausted:
        state.exhausted
          ? totalRuntimeMs(segments, now) >= SELF_LIMIT_MS * 0.5
          : totalRuntimeMs(segments, now) >= SELF_LIMIT_MS,
    };
    try {
      await AsyncStorage.setItem(BUDGET_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal
    }
    return next;
  },

  /**
   * Flag that always-mode monitoring has degraded to remote polling after
   * the budget was spent (set by the FGS loop right before it stops).
   */
  async markDegraded(): Promise<void> {
    const state = await this.getState();
    try {
      await AsyncStorage.setItem(
        BUDGET_KEY,
        JSON.stringify({ ...state, exhausted: true })
      );
    } catch {
      // Non-fatal
    }
  },

  /** Used FGS runtime within the 24h window, in hours (for diagnostics). */
  async getUsedHours(): Promise<number> {
    const state = await this.getState();
    return totalRuntimeMs(pruneSegments(state.segments, Date.now()), Date.now()) / (60 * 60 * 1000);
  },

  /** Remaining runtime before the self-imposed limit, in ms. */
  async getRemainingMs(): Promise<number> {
    const used = await this.getUsedHours();
    return Math.max(0, SELF_LIMIT_MS - used * 60 * 60 * 1000);
  },

  /** True when the 24h dataSync budget is effectively spent. */
  async isExhausted(): Promise<boolean> {
    if (!isDataSyncBudgetEnforced()) return false;
    return (await this.getRemainingMs()) <= 0;
  },

  /** Clear the budget ledger (used when leaving always mode entirely). */
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(BUDGET_KEY);
    } catch {
      // Non-fatal
    }
  },
};
