import { fetchTelemetry } from '../api/solar';
import { detectAndAlert } from './stateDetector';
import { StorageService } from './storageService';
import { TelemetryData } from '../types/telemetry';

let cachedTelemetry: TelemetryData | null = null;
let lastFetchTime: number | null = null;

export const MonitoringService = {
  async fetchLiveStatus(systemId: string): Promise<TelemetryData> {
    try {
      const data = await fetchTelemetry(systemId);
      cachedTelemetry = data;
      lastFetchTime = Date.now();

      const settings = await StorageService.getSettings();
      await detectAndAlert(data, settings);

      return data;
    } catch (error) {
      console.error('[MonitoringService] Fetch telemetry failed:', error);
      throw error;
    }
  },

  getCachedStatus(): TelemetryData | null {
    return cachedTelemetry;
  },

  getLastFetchTime(): number | null {
    return lastFetchTime;
  }
};
