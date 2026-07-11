import { loginWithPassword, refreshAccessToken } from '../api/auth';
import { Store } from '../storage/secureStore';
import { AuthTokens } from '../types/telemetry';

export const AuthService = {
  async login(email: string, password: string): Promise<AuthTokens> {
    const tokens = await loginWithPassword(email, password);
    await Store.setEmail(email);
    await Store.setAccessToken(tokens.access_token);
    await Store.setRefreshToken(tokens.refresh_token);
    await Store.setTokenExpiry(tokens.expires_in);
    return tokens;
  },

  async logout(): Promise<void> {
    await Store.clearAll();
  },

  async getAccessToken(): Promise<string | null> {
    const isExpired = await Store.isTokenExpired();
    if (!isExpired) {
      return await Store.getAccessToken();
    }

    const refreshToken = await Store.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const tokens = await refreshAccessToken(refreshToken);
      await Store.setAccessToken(tokens.access_token);
      await Store.setRefreshToken(tokens.refresh_token);
      await Store.setTokenExpiry(tokens.expires_in);
      return tokens.access_token;
    } catch (err) {
      console.error('[AuthService] Token refresh failed:', err);
      return null;
    }
  }
};
