import { fetchStations } from '../api/solar';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_STATION_KEY = 'solarguard_active_station';

export interface SolarStation {
  id: string;
  name: string;
}

export const StationService = {
  async getStations(): Promise<SolarStation[]> {
    try {
      return await fetchStations();
    } catch (error) {
      console.error('[StationService] Failed to fetch stations:', error);
      throw error;
    }
  },

  async getActiveStation(): Promise<SolarStation | null> {
    try {
      const raw = await AsyncStorage.getItem(ACTIVE_STATION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('[StationService] Failed to load active station:', error);
      return null;
    }
  },

  async setActiveStation(station: SolarStation): Promise<void> {
    try {
      await AsyncStorage.setItem(ACTIVE_STATION_KEY, JSON.stringify(station));
    } catch (error) {
      console.error('[StationService] Failed to save active station:', error);
    }
  },

  async clearActiveStation(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ACTIVE_STATION_KEY);
    } catch (error) {
      console.error('[StationService] Failed to clear active station:', error);
    }
  }
};
