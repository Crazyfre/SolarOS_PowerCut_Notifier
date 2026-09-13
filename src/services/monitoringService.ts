import { fetchTelemetry } from '../api/solar';
import { detectAndAlert } from './stateDetector';
import { StorageService } from './storageService';
import { TelemetryData } from '../types/telemetry';
import { GeofenceStore } from '../storage/geofenceStore';
import { SettingsStore } from '../storage/settingsStore';

let cachedTelemetry: TelemetryData | null = null;
let lastFetchTime: number | null = null;

export const MonitoringService = {
  async fetchLiveStatus(systemId: string): Promise<TelemetryData> {
    try {
      const data = await fetchTelemetry(systemId);
      cachedTelemetry = data;
      lastFetchTime = Date.now();

      const settings = await SettingsStore.loadSettings();
      const remote =
        settings.monitoringMode === 'geofenced' &&
        !!settings.homeZone &&
        (await GeofenceStore.getState()).inside === false;
      await detectAndAlert(data, settings, { remote });

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
