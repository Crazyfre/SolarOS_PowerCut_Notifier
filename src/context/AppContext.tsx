import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { AppState as RNAppState } from 'react-native';
import { Store } from '../storage/secureStore';
import { fetchTelemetry } from '../api/solar';
import { detectAndAlert, loadOutageHistory } from '../services/stateDetector';
import { TelemetryData, OutageRecord, AuthTokens, AppSettings } from '../types/telemetry';
import { SettingsStore, DEFAULT_SETTINGS } from '../storage/settingsStore';
import { checkForUpdates, UpdateInfo } from '../services/updateChecker';
import { requestNotificationPermissions } from '../services/notifications';

// ─── Context types ────────────────────────────────────────────────────────────

interface AppContextValue {
  // Auth
  isLoggedIn: boolean;
  isAuthLoading: boolean;
  systemId: string | null;
  login: (tokens: AuthTokens, systemId: string, email: string) => Promise<void>;
  logout: () => Promise<void>;

  // Telemetry
  telemetry: TelemetryData | null;
  lastFetchTime: number | null;
  isFetching: boolean;
  fetchError: string | null;
  refreshTelemetry: () => Promise<void>;

  // Outage history
  outageHistory: OutageRecord[];
  reloadHistory: () => Promise<void>;

  // Settings
  settings: AppSettings;
  updateSettings: (newSettings: AppSettings) => Promise<void>;

  // Updates
  updateInfo: UpdateInfo | null;
}

const AppContext = createContext<AppContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

const FOREGROUND_POLL_INTERVAL_MS = 30_000; // 30 seconds when app is foregrounded

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [systemId, setSystemId] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [outageHistory, setOutageHistory] = useState<OutageRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Load initial state (Auth & Settings) ──────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const token = await Store.getAccessToken();
        const sid = await Store.getSystemId();
        const storedSettings = await SettingsStore.loadSettings();
        setSettings(storedSettings);

        if (token && sid) {
          setIsLoggedIn(true);
          setSystemId(sid);
          const history = await loadOutageHistory();
          setOutageHistory(history);
        }

        // Register/update notification channels on startup
        requestNotificationPermissions().catch((err) => {
          console.warn('[AppContext] Failed to register notification channels:', err);
        });
        
        // Check for updates on startup
        checkForUpdates().then(setUpdateInfo).catch(() => {});
      } finally {
        setIsAuthLoading(false);
      }
    })();
  }, []);

  // ─── Telemetry fetch ──────────────────────────────────────────────────────

  const refreshTelemetry = useCallback(async () => {
    if (!systemId) return;
    setIsFetching(true);
    setFetchError(null);
    try {
      const data = await fetchTelemetry(systemId);
      setTelemetry(data);
      setLastFetchTime(Date.now());
      
      // Pass the current user settings to detectAndAlert
      await detectAndAlert(data, settings);
      
      // Reload history in case a new outage was recorded
      const history = await loadOutageHistory();
      setOutageHistory(history);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fetch failed';
      setFetchError(msg === 'AUTH_REQUIRED' ? 'Session expired. Please log in again.' : msg);
    } finally {
      setIsFetching(false);
    }
  }, [systemId, settings]);

  // ─── Foreground polling ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isLoggedIn || !systemId) return;

    // Initial fetch
    refreshTelemetry();

    // Poll while foregrounded
    pollTimerRef.current = setInterval(refreshTelemetry, FOREGROUND_POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isLoggedIn, systemId, refreshTelemetry]);

  // Pause polling when app backgrounds, resume on foreground
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active' && isLoggedIn && systemId) {
        refreshTelemetry();
        if (!pollTimerRef.current) {
          pollTimerRef.current = setInterval(refreshTelemetry, FOREGROUND_POLL_INTERVAL_MS);
        }
      } else if (state !== 'active' && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    });
    return () => sub.remove();
  }, [isLoggedIn, systemId, refreshTelemetry]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const login = useCallback(
    async (tokens: AuthTokens, sid: string, email: string) => {
      await Store.setAccessToken(tokens.access_token);
      await Store.setRefreshToken(tokens.refresh_token);
      await Store.setTokenExpiry(tokens.expires_in);
      await Store.setSystemId(sid);
      await Store.setEmail(email);
      setSystemId(sid);
      setIsLoggedIn(true);
    },
    []
  );

  const logout = useCallback(async () => {
    await Store.clearAll();
    setIsLoggedIn(false);
    setSystemId(null);
    setTelemetry(null);
    setLastFetchTime(null);
    setFetchError(null);
    setOutageHistory([]);
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const reloadHistory = useCallback(async () => {
    const history = await loadOutageHistory();
    setOutageHistory(history);
  }, []);

  const updateSettings = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await SettingsStore.saveSettings(newSettings);
  }, []);

  // ─── Context value ────────────────────────────────────────────────────────

  return (
    <AppContext.Provider
      value={{
        isLoggedIn,
        isAuthLoading,
        systemId,
        login,
        logout,
        telemetry,
        lastFetchTime,
        isFetching,
        fetchError,
        refreshTelemetry,
        outageHistory,
        reloadHistory,
        settings,
        updateSettings,
        updateInfo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppContextProvider');
  return ctx;
}
