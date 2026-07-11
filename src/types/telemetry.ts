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
  wireStatus?: 'PURCHASE' | 'STATIC' | 'FEEDIN' | string; // Optional/legacy
  wirePower: number;          // Watts — grid import (+) or export (-)
  gridValue?: number;         // Today's Exported Energy (kWh)
  gridMonth?: number;         // Monthly Export
  gridYear?: number;          // Yearly Export
  gridTotal?: number;         // Lifetime Export
  buyValue?: number;          // Today's Imported Energy (kWh)
  buyMonth?: number;          // Monthly Imported Energy
  buyYear?: number;           // Yearly Imported Energy
  buyTotal?: number;          // Lifetime Imported Energy

  // Battery
  batteryStatus: 'CHARGE' | 'DISCHARGE' | 'IDLE' | string;
  batterySoc: number;         // 0–100 %
  batteryBv: number;          // Volts
  batteryPower: number;       // Watts — current battery power
  chargeValue?: number;       // Today's Battery Charge Energy (kWh)
  dischargeValue?: number;    // Today's Battery Discharge Energy (kWh)
  chargeMonth?: number;
  chargeYear?: number;
  chargeTotal?: number;
  dischargeMonth?: number;
  dischargeYear?: number;
  dischargeTotal?: number;

  // Solar PV
  pvPower?: number;           // W — total PV generation (keeps current power generation display as requested)
  generationValue?: number;   // Today's Solar Generation (kWh)
  generationMonth?: number;   // Monthly Solar Generation (kWh)
  generationYear?: number;    // Yearly Solar Generation (kWh)
  generationTotal?: number;   // Lifetime Solar Generation (kWh)

  // Load / Consumption
  usePower?: number;          // W — house consumption
  useValue?: number;          // Today's Consumption (kWh)
  useMonth?: number;          // Monthly Consumption (kWh)
  useYear?: number;           // Yearly Consumption (kWh)
  useTotal?: number;          // Lifetime Consumption (kWh)

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
  alarmSoundName: 'alarm' | 'siren' | 'digital_beep' | 'chime';
  alertOnPowerCut: boolean;
  alertOnGridOffOnly: boolean;
  alertOnBatteryDischarge: boolean;
  alertOnOverSolarLoad: boolean;       // house load > solar PV output
  alertOnBatteryPercent: boolean;      // custom battery SoC trigger
  batteryWarningThreshold: number;     // 10% to 50%
  
  // V2 additions
  batteryCapacity: number;             // in kWh, e.g. 5.12
  activeStationId: string | null;      // Selected station ID
  refreshIntervalMinutes: number;      // 5, 10, 15 etc.
  quietHoursStart: string;             // HH:MM format
  quietHoursEnd: string;               // HH:MM format
  quietHoursEnabled: boolean;
  amoledTheme: boolean;
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
