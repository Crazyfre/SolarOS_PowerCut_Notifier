import { TelemetryData, OutageRecord, AppSettings } from '../types/telemetry';
import { Store } from '../storage/secureStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  sendPowerCutNotification, sendGridRestoredNotification,
  sendBatteryLowNotification, sendBatteryCriticalNotification,
  sendOverSolarLoadNotification, sendBatteryDischargingNotification, stopOutageAlarm,
} from './notifications';
import { DEFAULT_SETTINGS } from '../storage/settingsStore';
import { DevOverridesStore } from '../storage/devOverridesStore';

const OUTAGE_HISTORY_KEY = 'sg_outage_history';
let detectionQueue: Promise<void> = Promise.resolve();

interface DetectionState {
  gridStatus?: 'on' | 'off';
  outageStart?: number;
  outageId?: string;
  startBatterySoc?: number;
  lowSent?: boolean;
  criticalSent?: boolean;
  batteryStatus?: string;
  overSolarAt?: number;
}

export async function loadOutageHistory(systemId?: string): Promise<OutageRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTAGE_HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((record): record is OutageRecord =>
      !!record && typeof record.id === 'string' && Number.isFinite(record.startTime) &&
      (!systemId || !record.systemId || record.systemId === systemId));
  } catch {
    return [];
  }
}

export interface DetectContext { remote?: boolean; }

/** Serialize UI, service and headless detections in this JS runtime. */
export function detectAndAlert(
  telemetry: TelemetryData,
  settings: AppSettings = DEFAULT_SETTINGS,
  context: DetectContext = {},
): Promise<void> {
  const version = Store.getSessionVersion();
  const pending = detectionQueue.then(async () => {
    if (version !== Store.getSessionVersion()) return;
    const activeSystem = await Store.getSystemId();
    if (telemetry.systemId != null && activeSystem && String(telemetry.systemId) !== activeSystem) return;
    await detect(telemetry, settings, context);
  });
  detectionQueue = pending.catch(() => {});
  return pending;
}

async function detect(telemetry: TelemetryData, settings: AppSettings, context: DetectContext): Promise<void> {
  const version = Store.getSessionVersion();
  const currentStatus = telemetry.gridRelayStatus;
  if (currentStatus !== 'on' && currentStatus !== 'off') throw new Error('Invalid grid relay status');
  const systemId = String(telemetry.systemId ?? await Store.getSystemId() ?? 'default');
  const isMocking = (await DevOverridesStore.getOverrides()).enabled;
  // Simulation must never change the real station's baseline or cooldowns.
  const stateKey = `sg_detection_v2:${encodeURIComponent(systemId)}:${isMocking ? 'mock' : 'live'}`;
  let state: DetectionState = {};
  try {
    const raw = await AsyncStorage.getItem(stateKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') state = parsed;
  } catch { /* Recover a missing/corrupt baseline from the next observation. */ }

  const history = isMocking ? [] : await loadOutageHistory();
  let historyChanged = false;
  // Recover an ongoing record after an upgrade without comparing two stations.
  if (!state.gridStatus && !isMocking) {
    const ongoing = [...history].reverse().find((r) => !r.endTime && (!r.systemId || r.systemId === systemId));
    if (ongoing) {
      state = { ...state, gridStatus: 'off', outageId: ongoing.id,
        outageStart: ongoing.startTime, startBatterySoc: ongoing.startBatterySoc };
    }
  }
  const lastStatus = state.gridStatus;
  const now = Date.now();
  const soc = telemetry.batterySoc;
  const load = telemetry.usePower ?? Math.abs(telemetry.batteryPower ?? 0);
  const alerts: Array<() => Promise<void>> = [];

  if (currentStatus === 'off' && lastStatus !== 'off') {
    state.outageStart = now;
    state.outageId = `outage_${systemId}_${now}`;
    state.startBatterySoc = soc;
    state.lowSent = false;
    state.criticalSent = false;
    if (!isMocking) {
      history.push({ id: state.outageId, systemId, startTime: now,
        startBatterySoc: soc, minBatterySoc: soc, maxLoadW: load });
      historyChanged = true;
    }
    // First observation establishes a baseline; the outage may predate us.
    if (lastStatus === 'on' && (settings.alertOnPowerCut || settings.alertOnGridOffOnly)) {
      alerts.push(() => sendPowerCutNotification(telemetry, settings, context));
    }
  } else if (currentStatus === 'on' && lastStatus === 'off') {
    const durationMs = Math.max(0, now - (state.outageStart ?? now));
    const socDrop = state.startBatterySoc == null ? 0 : Math.max(0, state.startBatterySoc - soc);
    const outage = history.find((r) => r.id === state.outageId && !r.endTime);
    if (outage) {
      outage.endTime = now;
      outage.endBatterySoc = soc;
      outage.durationMs = durationMs;
      outage.minBatterySoc = Math.min(outage.minBatterySoc ?? soc, soc);
      historyChanged = true;
    }
    stopOutageAlarm();
    if (settings.alertOnPowerCut && !settings.alertOnGridOffOnly) {
      alerts.push(() => sendGridRestoredNotification(durationMs, soc, settings, socDrop, context));
    }
    delete state.outageStart;
    delete state.outageId;
    delete state.startBatterySoc;
    state.lowSent = false;
    state.criticalSent = false;
  }
  state.gridStatus = currentStatus;

  if (currentStatus === 'off') {
    if (settings.alertOnBatteryPercent && Number.isFinite(soc)) {
      const criticalThreshold = Math.max(0, Math.min(10, settings.batteryWarningThreshold - 5));
      if (soc <= criticalThreshold && !state.criticalSent) {
        alerts.push(async () => {
          await sendBatteryCriticalNotification(soc, settings, context);
          state.criticalSent = true;
        });
      } else if (soc <= settings.batteryWarningThreshold && !state.lowSent && !state.criticalSent) {
        alerts.push(async () => {
          await sendBatteryLowNotification(soc, load, settings, context);
          state.lowSent = true;
        });
      }
    }
    const outage = history.find((r) => r.id === state.outageId && !r.endTime);
    if (outage) {
      if (soc < (outage.minBatterySoc ?? Infinity)) { outage.minBatterySoc = soc; historyChanged = true; }
      if (load > (outage.maxLoadW ?? -Infinity)) { outage.maxLoadW = load; historyChanged = true; }
    }
  }

  if (lastStatus !== undefined && currentStatus === 'on' && settings.alertOnBatteryDischarge &&
      telemetry.batteryStatus === 'DISCHARGE' && state.batteryStatus !== 'DISCHARGE') {
    alerts.push(() => sendBatteryDischargingNotification(load, settings, context));
  }
  // Track this even during outages and while the alert is disabled.
  state.batteryStatus = telemetry.batteryStatus;

  if (currentStatus === 'on' && settings.alertOnOverSolarLoad &&
      (telemetry.pvPower ?? 0) > 0 && load > (telemetry.pvPower ?? 0) &&
      now - (state.overSolarAt ?? 0) >= 30 * 60 * 1000) {
    alerts.push(async () => {
      await sendOverSolarLoadNotification(load, telemetry.pvPower!, settings, context);
      state.overSolarAt = now;
    });
  }

  if (historyChanged) await AsyncStorage.setItem(OUTAGE_HISTORY_KEY, JSON.stringify(history.slice(-50)));
  // Commit the transition before delivery so a permission failure cannot
  // discard history or make concurrent pollers report the same grid event.
  await AsyncStorage.setItem(stateKey, JSON.stringify(state));
  await Store.setLastGridStatus(currentStatus);
  if (state.outageStart != null) await Store.setOutageStartTime(state.outageStart);
  else await Store.removeOutageStartTime();

  for (const alert of alerts) {
    if (version !== Store.getSessionVersion()) return;
    try { await alert(); }
    catch (error) { console.warn('[StateDetector] Alert delivery failed:', error); }
  }
  await AsyncStorage.setItem(stateKey, JSON.stringify(state));
}
