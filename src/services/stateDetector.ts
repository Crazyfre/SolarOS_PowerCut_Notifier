import { TelemetryData, OutageRecord } from '../types/telemetry';
import { Store } from '../storage/secureStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  sendPowerCutNotification,
  sendGridRestoredNotification,
  sendBatteryLowNotification,
  sendBatteryCriticalNotification,
} from './notifications';

const OUTAGE_HISTORY_KEY = 'sg_outage_history';
const BATTERY_LOW_THRESHOLD = 20;
const BATTERY_CRITICAL_THRESHOLD = 10;

// Track within-session whether we've already sent low/critical warnings
// to avoid repeated notifications during a single outage
let lowNotificationSentForCurrentOutage = false;
let criticalNotificationSentForCurrentOutage = false;

/**
 * Load outage history from AsyncStorage.
 */
export async function loadOutageHistory(): Promise<OutageRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTAGE_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as OutageRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Save outage history to AsyncStorage.
 */
async function saveOutageHistory(history: OutageRecord[]): Promise<void> {
  // Keep last 50 outages
  const trimmed = history.slice(-50);
  await AsyncStorage.setItem(OUTAGE_HISTORY_KEY, JSON.stringify(trimmed));
}

/**
 * Main detection function — called on every background fetch and foreground poll.
 *
 * Compares the current telemetry's gridRelayStatus against the last persisted status.
 * Sends the appropriate notification and updates persisted state.
 */
export async function detectAndAlert(telemetry: TelemetryData): Promise<void> {
  const currentStatus = telemetry.gridRelayStatus; // 'on' | 'off'
  const lastStatus = await Store.getLastGridStatus();

  // ─── Grid status transition ────────────────────────────────────────────────

  if (lastStatus === null) {
    // First run — just record the state, no notification
    await Store.setLastGridStatus(currentStatus);
    return;
  }

  if (lastStatus === 'on' && currentStatus === 'off') {
    // Grid just went down
    const now = Date.now();
    await Store.setOutageStartTime(now);
    await Store.setLastGridStatus('off');

    // Reset per-outage notification flags
    lowNotificationSentForCurrentOutage = false;
    criticalNotificationSentForCurrentOutage = false;

    // Record outage start in history
    const history = await loadOutageHistory();
    const outage: OutageRecord = {
      id: `outage_${now}`,
      startTime: now,
      maxLoadW: telemetry.usePower ?? telemetry.dischargePower ?? 0,
      minBatterySoc: telemetry.batterySoc,
    };
    history.push(outage);
    await saveOutageHistory(history);

    await sendPowerCutNotification(telemetry);
  } else if (lastStatus === 'off' && currentStatus === 'on') {
    // Grid just came back
    const startTime = await Store.getOutageStartTime();
    const now = Date.now();
    const durationMs = startTime ? now - startTime : 0;

    await Store.setLastGridStatus('on');
    await Store.removeOutageStartTime();

    // Update outage record with end time
    const history = await loadOutageHistory();
    const last = history[history.length - 1];
    if (last && !last.endTime) {
      last.endTime = now;
      last.durationMs = durationMs;
      await saveOutageHistory(history);
    }

    await sendGridRestoredNotification(durationMs, telemetry.batterySoc ?? 0);
  }

  // ─── Battery warnings during outage ───────────────────────────────────────

  if (currentStatus === 'off') {
    const soc = telemetry.batterySoc ?? 100;
    const load = telemetry.usePower ?? telemetry.dischargePower ?? 0;

    if (soc <= BATTERY_CRITICAL_THRESHOLD && !criticalNotificationSentForCurrentOutage) {
      criticalNotificationSentForCurrentOutage = true;
      await sendBatteryCriticalNotification(soc);
    } else if (
      soc <= BATTERY_LOW_THRESHOLD &&
      !lowNotificationSentForCurrentOutage &&
      !criticalNotificationSentForCurrentOutage
    ) {
      lowNotificationSentForCurrentOutage = true;
      await sendBatteryLowNotification(soc, load);
    }

    // Update running stats in history
    const history = await loadOutageHistory();
    const last = history[history.length - 1];
    if (last && !last.endTime) {
      if (last.minBatterySoc === undefined || soc < last.minBatterySoc) {
        last.minBatterySoc = soc;
      }
      const currentLoad = telemetry.usePower ?? telemetry.dischargePower ?? 0;
      if (last.maxLoadW === undefined || currentLoad > last.maxLoadW) {
        last.maxLoadW = currentLoad;
      }
      await saveOutageHistory(history);
    }
  }
}
