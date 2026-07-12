import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DevOverrides {
  enabled: boolean;
  gridRelayStatus?: 'on' | 'off';
  batterySoc?: number;
  batteryStatus?: 'CHARGE' | 'DISCHARGE' | 'IDLE' | string;
  batteryPower?: number;
  pvPower?: number;
  usePower?: number;
  scheduledPowerCutTime?: number;
  scheduledPowerOnTime?: number;
}

const OVERRIDES_KEY = 'sg_dev_overrides';

export const DevOverridesStore = {
  /**
   * Load overrides from AsyncStorage.
   */
  async getOverrides(): Promise<DevOverrides> {
    try {
      const raw = await AsyncStorage.getItem(OVERRIDES_KEY);
      return raw ? JSON.parse(raw) : { enabled: false };
    } catch (error) {
      console.error('[DevOverridesStore] Failed to load overrides:', error);
      return { enabled: false };
    }
  },

  /**
   * Save overrides to AsyncStorage.
   */
  async saveOverrides(overrides: DevOverrides): Promise<void> {
    try {
      await AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    } catch (error) {
      console.error('[DevOverridesStore] Failed to save overrides:', error);
    }
  },
};
