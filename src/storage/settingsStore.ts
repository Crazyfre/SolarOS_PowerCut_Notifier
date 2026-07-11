import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types/telemetry';

const SETTINGS_KEY = 'solarguard_settings';

export const DEFAULT_SETTINGS: AppSettings = {
  alarmDurationSeconds: 10,
  useAlarmSound: true,
  onlyAlarmNoPopup: false,
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
};

export const SettingsStore = {
  /**
   * Load app settings from AsyncStorage.
   * Merges stored settings with defaults to guarantee all keys exist.
   */
  async loadSettings(): Promise<AppSettings> {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
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
      console.error('[SettingsStore] Failed to save settings:', error);
    }
  },
};
