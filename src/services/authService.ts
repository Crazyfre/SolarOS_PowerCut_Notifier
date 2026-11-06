import { loginWithPassword, refreshAccessToken } from '../api/auth';
import { Store } from '../storage/secureStore';
import { AuthTokens } from '../types/telemetry';
import axios from 'axios';

let refreshInFlight: { version: number; promise: Promise<string> } | null = null;

export const AuthService = {
  async login(email: string, password: string): Promise<AuthTokens> {
    const tokens = await loginWithPassword(email, password);
    Store.invalidateSession();
    await Store.setEmail(email);
    await Store.saveTokens(tokens);
    return tokens;
  },

  async logout(): Promise<void> {
    await Store.clearAll();
  },

  async getAccessToken(rejectedToken?: string): Promise<string | null> {
    const version = Store.getSessionVersion();
    const isExpired = await Store.isTokenExpired();
    const token = await Store.getAccessToken();
    if (version !== Store.getSessionVersion()) throw new Error('AUTH_REQUIRED');
    if (!isExpired && token && token !== rejectedToken) {
      return token;
    }
    if (refreshInFlight?.version === version) return refreshInFlight.promise;

    const promise = (async () => {
      const refreshToken = await Store.getRefreshToken();
      if (!refreshToken) throw new Error('AUTH_REQUIRED');
      try {
        const tokens = await refreshAccessToken(refreshToken);
        await Store.saveTokens(tokens, version);
        if (version !== Store.getSessionVersion()) throw new Error('AUTH_REQUIRED');
        return tokens.access_token;
      } catch (err) {
        if (axios.isAxiosError(err) && [400, 401, 403].includes(err.response?.status ?? 0)) {
          throw new Error('AUTH_REQUIRED');
        }
        // Connectivity failures are retryable; they do not invalidate a session.
        throw err;
      }
    })();
    refreshInFlight = { version, promise };
    try {
      return await promise;
    } finally {
      if (refreshInFlight?.promise === promise) refreshInFlight = null;
    }
  }
};
