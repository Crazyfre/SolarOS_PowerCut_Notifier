import axios, { AxiosInstance } from 'axios';
import { TelemetryData } from '../types/telemetry';
import { Store } from '../storage/secureStore';
import { refreshAccessToken } from './auth';

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
async function getValidToken(): Promise<string> {
  const isExpired = await Store.isTokenExpired();
  if (!isExpired) {
    const token = await Store.getAccessToken();
    if (token) return token;
  }

  // Try refresh
  const refreshToken = await Store.getRefreshToken();
  if (!refreshToken) throw new Error('AUTH_REQUIRED');

  try {
    const tokens = await refreshAccessToken(refreshToken);
    await Store.setAccessToken(tokens.access_token);
    await Store.setRefreshToken(tokens.refresh_token);
    await Store.setTokenExpiry(tokens.expires_in);
    return tokens.access_token;
  } catch {
    throw new Error('AUTH_REQUIRED');
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
  const token = accessToken || await getValidToken();
  const client = createClient(token);

  const response = await client.post<StationSearchResponse>(
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
  );

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
    .filter((s) => s.id && s.id !== 'undefined');
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

/**
 * Fetch live telemetry for a station.
 * Auto-retries once on 401 after token refresh.
 */
export async function fetchTelemetry(systemId: string): Promise<TelemetryData> {
  let token = await getValidToken();
  let client = createClient(token);

  try {
    const response = await client.get<TelemetryData>(
      `/maintain-s/operating/system/${systemId}`
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Force refresh and retry once
      const refreshToken = await Store.getRefreshToken();
      if (refreshToken) {
        const tokens = await refreshAccessToken(refreshToken);
        await Store.setAccessToken(tokens.access_token);
        await Store.setRefreshToken(tokens.refresh_token);
        await Store.setTokenExpiry(tokens.expires_in);

        client = createClient(tokens.access_token);
        const retryResponse = await client.get<TelemetryData>(
          `/maintain-s/operating/system/${systemId}`
        );
        return retryResponse.data;
      }
      throw new Error('AUTH_REQUIRED');
    }
    throw error;
  }
}
