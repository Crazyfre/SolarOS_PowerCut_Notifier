// SolarGuard — TypeScript interfaces for SolarOS API responses

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface TelemetryData {
  // Grid
  gridRelayStatus: 'on' | 'off';
  wireStatus: 'PURCHASE' | 'STATIC' | 'FEEDIN' | string;
  wirePower: number;          // Watts — grid import (+) or export (-)

  // Battery
  batteryStatus: 'CHARGE' | 'DISCHARGE' | 'IDLE' | string;
  batterySoc: number;         // 0–100 %
  batteryBv: number;          // Volts
  chargePower?: number;       // W — when charging
  dischargePower?: number;    // W — when discharging

  // Solar PV
  pvPower?: number;           // W — total PV generation

  // Load / Consumption
  usePower?: number;          // W — house consumption

  // System metadata
  collectorCount?: number;
  inverterCount?: number;
  batteryCount?: number;
  systemId?: string | number;
  lastUpdateTime?: string;
}

export interface OutageRecord {
  id: string;
  startTime: number;        // Unix ms
  endTime?: number;         // Unix ms (undefined = still ongoing)
  durationMs?: number;      // ms
  minBatterySoc?: number;   // Lowest SoC during outage
  maxLoadW?: number;        // Peak load during outage
}

export type GridStatus = 'on' | 'off' | 'unknown';

export interface AppSettings {
  alarmDurationSeconds: number;        // 5, 10, 15, 30 seconds
  useAlarmSound: boolean;              // true = alarm.wav, false = default system sound
  onlyAlarmNoPopup: boolean;           // true = silences the banner (low importance), keeps sound
  alertOnPowerCut: boolean;
  alertOnBatteryDischarge: boolean;
  alertOnOverSolarLoad: boolean;       // house load > solar PV output
  alertOnBatteryPercent: boolean;      // custom battery SoC trigger
  batteryWarningThreshold: number;     // 10% to 50%
}

export interface AppState {
  isLoggedIn: boolean;
  systemId: string | null;
  tokens: AuthTokens | null;
  telemetry: TelemetryData | null;
  lastFetchTime: number | null;
  outageHistory: OutageRecord[];
  isLoading: boolean;
  error: string | null;
  settings: AppSettings;
}

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}
