import axios, { AxiosInstance } from 'axios';
import { TelemetryData } from '../types/telemetry';
import { Store } from '../storage/secureStore';
import { AuthService } from '../services/authService';
import { DevOverridesStore } from '../storage/devOverridesStore';

// ─── Base URL — configurable, defaults to EU region ───────────────────────────
export const DEFAULT_API_BASE_URL = 'https://eu1.solaros.com';

function getBaseUrl(): string {
  // Future: read from Settings store to support other regions (au1, us1, etc.)
  return DEFAULT_API_BASE_URL;
}

// ─── Axios factory ────────────────────────────────────────────────────────────

function createClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: getBaseUrl(),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
}

// ─── Token management ─────────────────────────────────────────────────────────

/**
 * Get a valid access token, auto-refreshing if expired.
 * Throws 'AUTH_REQUIRED' if refresh also fails.
 */
async function getValidToken(rejectedToken?: string): Promise<string> {
  const token = await AuthService.getAccessToken(rejectedToken);
  if (!token) throw new Error('AUTH_REQUIRED');
  return token;
}

async function authorizedRequest<T>(request: (client: AxiosInstance) => Promise<T>, accessToken?: string): Promise<T> {
  const version = Store.getSessionVersion();
  const token = accessToken || await getValidToken();
  try {
    return await request(createClient(token));
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
    if (accessToken || version !== Store.getSessionVersion()) throw new Error('AUTH_REQUIRED');
    const refreshed = await getValidToken(token);
    try {
      return await request(createClient(refreshed));
    } catch (retryError) {
      if (axios.isAxiosError(retryError) && retryError.response?.status === 401) throw new Error('AUTH_REQUIRED');
      throw retryError;
    }
  }
}

// ─── Station discovery ────────────────────────────────────────────────────────

interface StationSearchResponse {
  data?: Array<{
    station?: {
      id: number | string;
      name?: string;
    };
  }>;
  list?: Array<{
    station?: {
      id: number | string;
      name?: string;
    };
    id?: number | string;
    name?: string;
  }>;
}

/**
 * Discover all stations (inverter systems) for the authenticated user.
 *
 * Uses the confirmed SolarOS endpoint:
 *   POST /maintain-s/operating/station/v2/search
 *
 * If multiple stations exist, returns all — the caller shows a picker.
 */
export async function fetchStations(accessToken?: string): Promise<{ id: string; name: string }[]> {
  const response = await authorizedRequest((client) => client.post<StationSearchResponse>(
    '/maintain-s/operating/station/v2/search',
    {},
    {
      params: {
        page: 1,
        size: 50,
        'order.direction': 'ASC',
        'order.property': 'name',
      },
    }
  ), accessToken);

  const raw = response.data?.data ?? response.data?.list ?? [];

  return raw
    .map((entry) => {
      // Handle both { station: { id, name } } and flat { id, name }
      const id = entry.station?.id ?? (entry as { id?: number | string }).id;
      const name =
        entry.station?.name ??
        (entry as { name?: string }).name ??
        `Station ${id}`;
      return { id: String(id), name };
    })
    .filter((s) => s.id && s.id !== 'undefined' && s.id !== 'null');
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

/**
 * Fetch live telemetry for a station.
 * Auto-retries once on 401 after token refresh.
 */
const telemetryInFlight = new Map<string, Promise<TelemetryData>>();

export async function fetchTelemetry(systemId: string): Promise<TelemetryData> {
  const key = `${Store.getSessionVersion()}:${systemId}`;
  const pending = telemetryInFlight.get(key);
  if (pending) return pending;
  const request = fetchTelemetryOnce(systemId);
  telemetryInFlight.set(key, request);
  try {
    return await request;
  } finally {
    if (telemetryInFlight.get(key) === request) telemetryInFlight.delete(key);
  }
}

async function fetchTelemetryOnce(systemId: string): Promise<TelemetryData> {

  const mapTelemetry = async (data: any): Promise<TelemetryData> => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid telemetry response.');
    const overrides = await DevOverridesStore.getOverrides();
    const mapped: TelemetryData = {
      ...data,
      systemId,
      pvPower: data.pvPower ?? data.generationPower,
      batteryPower: data.batteryPower ?? 0, // default if not set
    };
    if (overrides.enabled) {
      let activeGridStatus = overrides.gridRelayStatus;
      const now = Date.now();

      if (overrides.scheduledPowerCutTime && now >= overrides.scheduledPowerCutTime) {
        activeGridStatus = 'off';
      }
      if (overrides.scheduledPowerOnTime && now >= overrides.scheduledPowerOnTime) {
        activeGridStatus = 'on';
      }

      if (activeGridStatus !== undefined) mapped.gridRelayStatus = activeGridStatus;
      if (overrides.batterySoc !== undefined) mapped.batterySoc = overrides.batterySoc;
      if (overrides.batteryStatus !== undefined) mapped.batteryStatus = overrides.batteryStatus;
      if (overrides.batteryPower !== undefined) mapped.batteryPower = overrides.batteryPower;
      if (overrides.pvPower !== undefined) mapped.pvPower = overrides.pvPower;
      if (overrides.usePower !== undefined) mapped.usePower = overrides.usePower;
    }
    if (mapped.gridRelayStatus !== 'on' && mapped.gridRelayStatus !== 'off') {
      throw new Error('Invalid telemetry: missing or unknown grid relay status.');
    }
    // API counters may be numeric strings. Normalize once at the boundary so
    // screens, reports and calculations never call toFixed on a string.
    for (const field of numericTelemetryFields) {
      const value: unknown = mapped[field];
      if (value == null) continue;
      const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
      if (!Number.isFinite(number)) throw new Error(`Invalid telemetry: ${field} is not a finite number.`);
      (mapped as any)[field] = number;
    }
    if (mapped.batterySoc == null || mapped.batterySoc < 0 || mapped.batterySoc > 100) {
      throw new Error('Invalid telemetry: battery charge must be between 0 and 100.');
    }
    return mapped;
  };

  const response = await authorizedRequest((client) => client.get<TelemetryData>(
      `/maintain-s/operating/system/${systemId}`
  ));
  return mapTelemetry(response.data);
}

const numericTelemetryFields = [
  'wirePower', 'gridValue', 'gridMonth', 'gridYear', 'gridTotal',
  'buyValue', 'buyMonth', 'buyYear', 'buyTotal', 'batterySoc', 'batteryBv', 'batteryPower',
  'chargeValue', 'dischargeValue', 'chargeMonth', 'chargeYear', 'chargeTotal',
  'dischargeMonth', 'dischargeYear', 'dischargeTotal', 'pvPower',
  'generationValue', 'generationMonth', 'generationYear', 'generationTotal',
  'usePower', 'useValue', 'useMonth', 'useYear', 'useTotal',
] as const;
