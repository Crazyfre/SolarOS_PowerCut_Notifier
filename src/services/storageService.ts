import AsyncStorage from '@react-native-async-storage/async-storage';
import { Store } from '../storage/secureStore';
import { AppSettings, OutageRecord } from '../types/telemetry';
import { DEFAULT_SETTINGS } from '../storage/settingsStore';

const SETTINGS_KEY = 'solarguard_settings';
const OUTAGE_HISTORY_KEY = 'sg_outage_history';

export const StorageService = {
  // --- Settings ---
  async getSettings(): Promise<AppSettings> {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (error) {
      console.error('[StorageService] Failed to load settings:', error);
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('[StorageService] Failed to save settings:', error);
    }
  },

  // --- Outage History ---
  async getOutageHistory(): Promise<OutageRecord[]> {
    try {
      const raw = await AsyncStorage.getItem(OUTAGE_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('[StorageService] Failed to load history:', error);
      return [];
    }
  },

  async saveOutageHistory(history: OutageRecord[]): Promise<void> {
    try {
      await AsyncStorage.setItem(OUTAGE_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('[StorageService] Failed to save history:', error);
    }
  },

  // --- SecureStore Token Utilities ---
  async getAccessToken(): Promise<string | null> {
    return Store.getAccessToken();
  },

  async setAccessToken(token: string): Promise<void> {
    await Store.setAccessToken(token);
  },

  async getRefreshToken(): Promise<string | null> {
    return Store.getRefreshToken();
  },

  async setRefreshToken(token: string): Promise<void> {
    await Store.setRefreshToken(token);
  },

  async clearTokens(): Promise<void> {
    await Store.clearAll();
  }
};
