import axios from 'axios';
import CryptoJS from 'crypto-js';
import { AuthTokens } from '../types/telemetry';

const BASE_URL = 'https://eu1.solaros.com';

/**
 * Hash a plaintext password with SHA256, as SolarOS expects.
 */
export function hashPassword(plaintext: string): string {
  return CryptoJS.SHA256(plaintext).toString(CryptoJS.enc.Hex);
}

/**
 * Authenticate with SolarOS using email + password.
 * Password is SHA256-hashed before transmission — never sent in plaintext.
 */
export async function loginWithPassword(
  email: string,
  password: string
): Promise<AuthTokens> {
  const hashedPassword = hashPassword(password);

  const params = new URLSearchParams({
    grant_type: 'password',
    identity_type: '2',
    username: email,
    client_id: 'test',
    org_id: '0',
    record_flag: '0',
    system: 'SolarOS',
    lang: 'en',
    password: hashedPassword,
  });

  const response = await axios.post<AuthTokens>(
    `${BASE_URL}/oauth-s/oauth/token`,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    }
  );

  return response.data;
}

/**
 * Refresh an expired access token using a refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<AuthTokens> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: 'test',
    system: 'SolarOS',
  });

  const response = await axios.post<AuthTokens>(
    `${BASE_URL}/oauth-s/oauth/token`,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    }
  );

  return response.data;
}
