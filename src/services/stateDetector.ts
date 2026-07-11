import { TelemetryData, OutageRecord, AppSettings } from '../types/telemetry';
import { Store } from '../storage/secureStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  sendPowerCutNotification,
  sendGridRestoredNotification,
  sendBatteryLowNotification,
  sendBatteryCriticalNotification,
  sendOverSolarLoadNotification,
  sendBatteryDischargingNotification,
} from './notifications';
import { DEFAULT_SETTINGS } from '../storage/settingsStore';

const OUTAGE_HISTORY_KEY = 'sg_outage_history';
const LAST_BATTERY_STATUS_KEY = 'sg_last_battery_status';
const LAST_OVER_SOLAR_TIME_KEY = 'sg_last_over_solar_time';

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
 * Respects user alert settings.
 */
export async function detectAndAlert(
  telemetry: TelemetryData,
  settings: AppSettings = DEFAULT_SETTINGS
): Promise<void> {
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

    if (settings.alertOnPowerCut) {
      await sendPowerCutNotification(telemetry, settings);
    }
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
    let socDrop = 0;
    if (last && !last.endTime) {
      last.endTime = now;
      last.durationMs = durationMs;
      const startingSoc = last.minBatterySoc ?? 100;
      socDrop = Math.max(0, startingSoc - (telemetry.batterySoc ?? 100));
      await saveOutageHistory(history);
    }

    if (settings.alertOnPowerCut) {
      await sendGridRestoredNotification(durationMs, telemetry.batterySoc ?? 0, settings, socDrop);
    }
  }

  // ─── Battery warnings during outage (Grid is OFF) ──────────────────────────

  if (currentStatus === 'off') {
    const soc = telemetry.batterySoc ?? 100;
    const load = telemetry.usePower ?? telemetry.dischargePower ?? 0;

    if (settings.alertOnBatteryPercent) {
      const critThreshold = Math.min(10, settings.batteryWarningThreshold - 5);
      if (soc <= critThreshold && !criticalNotificationSentForCurrentOutage) {
        criticalNotificationSentForCurrentOutage = true;
        await sendBatteryCriticalNotification(soc, settings);
      } else if (
        soc <= settings.batteryWarningThreshold &&
        !lowNotificationSentForCurrentOutage &&
        !criticalNotificationSentForCurrentOutage
      ) {
        lowNotificationSentForCurrentOutage = true;
        await sendBatteryLowNotification(soc, load, settings);
      }
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

  // ─── Battery discharging alert (Grid is ON) ────────────────────────────────

  if (currentStatus === 'on' && settings.alertOnBatteryDischarge) {
    const currentBatStatus = telemetry.batteryStatus; // 'CHARGE' | 'DISCHARGE' | 'IDLE'
    const lastBatStatus = await AsyncStorage.getItem(LAST_BATTERY_STATUS_KEY);

    if (currentBatStatus === 'DISCHARGE' && lastBatStatus !== 'DISCHARGE') {
      const load = telemetry.usePower ?? telemetry.dischargePower ?? 0;
      await sendBatteryDischargingNotification(load, settings);
    }
    await AsyncStorage.setItem(LAST_BATTERY_STATUS_KEY, currentBatStatus);
  }

  // ─── Over Solar Load alert (Grid is ON) ────────────────────────────────────

  if (settings.alertOnOverSolarLoad) {
    const pvPower = telemetry.pvPower ?? 0;
    const usePower = telemetry.usePower ?? 0;

    if (pvPower > 0 && usePower > pvPower) {
      const now = Date.now();
      const rawLastTime = await AsyncStorage.getItem(LAST_OVER_SOLAR_TIME_KEY);
      const lastTime = rawLastTime ? parseInt(rawLastTime, 10) : 0;
      const cooldownMs = 30 * 60 * 1000; // 30-minute cooldown to avoid spamming alerts

      if (now - lastTime > cooldownMs) {
        await AsyncStorage.setItem(LAST_OVER_SOLAR_TIME_KEY, String(now));
        await sendOverSolarLoadNotification(usePower, pvPower, settings);
      }
    }
  }
}
