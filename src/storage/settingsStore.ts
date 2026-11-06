import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types/telemetry';
import { DEFAULT_KSEB_TARIFF } from '../services/tariff/ksebTariff';

const SETTINGS_KEY = 'solarguard_settings';

export const DEFAULT_SETTINGS: AppSettings = {
  alarmDurationSeconds: 10,
  useAlarmSound: true,
  onlyAlarmNoPopup: false,
  alarmSoundName: 'alarm',
  alertOnPowerCut: true,
  alertOnGridOffOnly: false,
  alertOnBatteryDischarge: false,
  alertOnOverSolarLoad: false,
  alertOnBatteryPercent: true,
  batteryWarningThreshold: 20,
  batteryCapacity: 5.12,
  activeStationId: null,
  refreshIntervalMinutes: 5,
  quietHoursStart: '23:00',
  quietHoursEnd: '07:00',
  quietHoursEnabled: false,
  amoledTheme: false,
  foregroundServiceEnabled: false,
  monitoringMode: 'always',
  homeZone: null,
  tariff: DEFAULT_KSEB_TARIFF,
  tariffImportRate: 7.50,
  tariffExportRate: 5.00,
};

export const SettingsStore = {
  /**
   * Load app settings from AsyncStorage.
   * Merges stored settings with defaults to guarantee all keys exist.
   * Migrates the legacy foregroundServiceEnabled flag to monitoringMode.
   */
  async loadSettings(): Promise<AppSettings> {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_SETTINGS;
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
        if (fallback === null || typeof fallback === 'object') continue;
        const value = parsed[key];
        if (typeof value !== typeof fallback || (typeof value === 'number' && !Number.isFinite(value))) merged[key] = fallback;
      }
      merged.activeStationId = typeof parsed.activeStationId === 'string' && parsed.activeStationId.trim()
        ? parsed.activeStationId : null;
      if (!['always', 'geofenced'].includes(merged.monitoringMode)) merged.monitoringMode = 'always';
      if (!['alarm', 'siren', 'digital_beep', 'chime'].includes(merged.alarmSoundName)) merged.alarmSoundName = DEFAULT_SETTINGS.alarmSoundName;
      if (![5, 10, 15, 30].includes(merged.alarmDurationSeconds)) merged.alarmDurationSeconds = DEFAULT_SETTINGS.alarmDurationSeconds;
      if (merged.batteryCapacity <= 0) merged.batteryCapacity = DEFAULT_SETTINGS.batteryCapacity;
      merged.refreshIntervalMinutes = Math.min(60, Math.max(1, merged.refreshIntervalMinutes));
      merged.batteryWarningThreshold = Math.min(50, Math.max(10, merged.batteryWarningThreshold));
      const zone = parsed.homeZone;
      merged.homeZone = zone && [zone.lat, zone.lng, zone.radiusMeters].every(Number.isFinite) &&
        Math.abs(zone.lat) <= 90 && Math.abs(zone.lng) <= 180 && zone.radiusMeters >= 100 && zone.radiusMeters <= 2000
        ? zone : null;
      const tariff = parsed.tariff;
      merged.tariff = {
        ...DEFAULT_KSEB_TARIFF,
        ...(tariff && typeof tariff === 'object' ? tariff : {}),
        telescopicSlabs: normalizeSlabs(tariff?.telescopicSlabs, DEFAULT_KSEB_TARIFF.telescopicSlabs),
        nonTelescopicBands: normalizeSlabs(tariff?.nonTelescopicBands, DEFAULT_KSEB_TARIFF.nonTelescopicBands),
      };
      for (const [key, fallback] of Object.entries(DEFAULT_KSEB_TARIFF)) {
        if (typeof fallback === 'number' && (!Number.isFinite(merged.tariff[key]) || merged.tariff[key] < 0)) {
          merged.tariff[key] = fallback;
        }
      }
      if (merged.tariff.monthlyCycleFactor <= 0) merged.tariff.monthlyCycleFactor = 1;

      // One-way migration: legacy users start in 'always' mode. 'geofenced'
      // only activates once the user configures a home zone (see AppContext router).
      if (parsed.monitoringMode === undefined) {
        merged.monitoringMode = 'always';
      }

      return merged;
    } catch (error) {
      console.error('[SettingsStore] Failed to load settings:', error);
      return DEFAULT_SETTINGS;
    }
  },

  /**
   * Save app settings to AsyncStorage.
   */
  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      throw error;
    }
  },
};

function normalizeSlabs(value: unknown, defaults: typeof DEFAULT_KSEB_TARIFF.telescopicSlabs) {
  if (!Array.isArray(value) || value.length !== defaults.length) return defaults.map((slab) => ({ ...slab }));
  return defaults.map((slab, index) => ({
    // JSON encodes Infinity as null. Bounds belong to the tariff structure;
    // the settings editor permits changing rates only.
    upTo: slab.upTo,
    rate: typeof value[index]?.rate === 'number' && Number.isFinite(value[index].rate) && value[index].rate >= 0
      ? value[index].rate : slab.rate,
  }));
}
