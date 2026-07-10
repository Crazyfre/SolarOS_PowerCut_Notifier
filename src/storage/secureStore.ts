import * as SecureStore from 'expo-secure-store';

// Key constants
const KEYS = {
  EMAIL: 'sg_email',
  ACCESS_TOKEN: 'sg_access_token',
  REFRESH_TOKEN: 'sg_refresh_token',
  SYSTEM_ID: 'sg_system_id',
  LAST_GRID_STATUS: 'sg_last_grid_status',
  OUTAGE_START_TIME: 'sg_outage_start_time',
  TOKEN_EXPIRY: 'sg_token_expiry',
} as const;

type StoreKey = typeof KEYS[keyof typeof KEYS];

// Generic helpers
async function set(key: StoreKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

async function get(key: StoreKey): Promise<string | null> {
  return await SecureStore.getItemAsync(key);
}

async function remove(key: StoreKey): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

// Typed setters/getters
export const Store = {
  // Email
  setEmail: (email: string) => set(KEYS.EMAIL, email),
  getEmail: () => get(KEYS.EMAIL),
  removeEmail: () => remove(KEYS.EMAIL),

  // Access token
  setAccessToken: (token: string) => set(KEYS.ACCESS_TOKEN, token),
  getAccessToken: () => get(KEYS.ACCESS_TOKEN),
  removeAccessToken: () => remove(KEYS.ACCESS_TOKEN),

  // Refresh token
  setRefreshToken: (token: string) => set(KEYS.REFRESH_TOKEN, token),
  getRefreshToken: () => get(KEYS.REFRESH_TOKEN),
  removeRefreshToken: () => remove(KEYS.REFRESH_TOKEN),

  // Token expiry (stored as ISO string of expiry time)
  setTokenExpiry: (expiresInSeconds: number) => {
    const expiry = Date.now() + expiresInSeconds * 1000;
    return set(KEYS.TOKEN_EXPIRY, String(expiry));
  },
  isTokenExpired: async () => {
    const raw = await get(KEYS.TOKEN_EXPIRY);
    if (!raw) return true;
    return Date.now() > parseInt(raw, 10);
  },

  // System ID
  setSystemId: (id: string) => set(KEYS.SYSTEM_ID, id),
  getSystemId: () => get(KEYS.SYSTEM_ID),
  removeSystemId: () => remove(KEYS.SYSTEM_ID),

  // Last known grid status (persisted for background diff)
  setLastGridStatus: (status: 'on' | 'off') => set(KEYS.LAST_GRID_STATUS, status),
  getLastGridStatus: () => get(KEYS.LAST_GRID_STATUS) as Promise<'on' | 'off' | null>,
  removeLastGridStatus: () => remove(KEYS.LAST_GRID_STATUS),

  // Outage start time (unix ms as string)
  setOutageStartTime: (ts: number) => set(KEYS.OUTAGE_START_TIME, String(ts)),
  getOutageStartTime: async () => {
    const raw = await get(KEYS.OUTAGE_START_TIME);
    return raw ? parseInt(raw, 10) : null;
  },
  removeOutageStartTime: () => remove(KEYS.OUTAGE_START_TIME),

  // Clear all auth data on logout
  clearAll: async () => {
    await Promise.all(Object.values(KEYS).map((k) => remove(k)));
  },
};
