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
import { registerNotificationChannels } from '../services/notifications';
import { ForegroundServiceManager } from '../services/foregroundService';
import {
  armRemotePolling,
  disarmRemotePolling,
  registerGeofence,
  unregisterGeofence,
  resolveEffectiveMode,
} from '../services/geofenceService';
import { GeofenceStore, GeofenceState } from '../storage/geofenceStore';
import { DataSyncBudgetStore } from '../storage/dataSyncBudgetStore';

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
  settingsLoaded: boolean;
  updateSettings: (newSettings: AppSettings) => Promise<void>;

  // Geofence
  geofenceState: GeofenceState;
  reloadGeofenceState: () => Promise<void>;

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
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [geofenceState, setGeofenceState] = useState<GeofenceState>({
    inside: null,
    lastTransitionAt: null,
    registeredAt: null,
  });

  const reloadGeofenceState = useCallback(async () => {
    const state = await GeofenceStore.getState();
    setGeofenceState(state);
  }, []);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const systemIdRef = useRef(systemId);
  const settingsRef = useRef(settings);
  const fetchInFlight = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const modeQueue = useRef<Promise<void>>(Promise.resolve());
  systemIdRef.current = systemId;
  settingsRef.current = settings;

  // ─── Load initial state (Auth & Settings) ──────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const token = await Store.getAccessToken();
        const sid = await Store.getSystemId();
        const storedSettings = await SettingsStore.loadSettings();
        setSettings(storedSettings);

        if (token && sid) {
          const selectedId = storedSettings.activeStationId || sid;
          if (selectedId !== sid) await Store.setSystemId(selectedId);
          setIsLoggedIn(true);
          setSystemId(selectedId);
          const history = await loadOutageHistory(selectedId);
          setOutageHistory(history);
        }

        // Register/update notification channels on startup
        registerNotificationChannels().catch((err) => {
          console.warn('[AppContext] Failed to register notification channels:', err);
        });
        
        // Check for updates on startup
        checkForUpdates().then(setUpdateInfo).catch(() => {});
      } catch (err) {
        console.warn('[AppContext] Startup load failed:', err);
      } finally {
        // Always resolve — never leave consumers waiting on a failed load.
        setSettingsLoaded(true);
        setIsAuthLoading(false);
      }
    })();
  }, []);

  // Safety net: if settings somehow remain unloaded after the startup gate
  // cleared, recover immediately instead of leaving consumers stuck.
  useEffect(() => {
    if (settingsLoaded || isAuthLoading) return;
    let active = true;
    SettingsStore.loadSettings().then((stored) => {
      if (active) {
        setSettings(stored);
        setSettingsLoaded(true);
      }
    }).catch(() => {
      if (active) setSettingsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [settingsLoaded, isAuthLoading]);

  // ─── Telemetry fetch ──────────────────────────────────────────────────────

  const refreshTelemetry = useCallback(async () => {
    const sid = systemIdRef.current;
    if (!sid) return;
    const version = Store.getSessionVersion();
    const key = `${version}:${sid}`;
    if (fetchInFlight.current?.key === key) return fetchInFlight.current.promise;
    const current = () => systemIdRef.current === sid && Store.getSessionVersion() === version;
    const promise = (async () => {
      setIsFetching(true);
      setFetchError(null);
      try {
        const data = await fetchTelemetry(sid);
        if (!current()) return;
        const currentSettings = settingsRef.current;
        // Foreground polls inherit the fence context even when the UI is open.
        const remote =
          currentSettings.monitoringMode === 'geofenced' &&
          !!currentSettings.homeZone &&
          await resolveEffectiveMode(currentSettings) === 'geofenced' &&
          (await GeofenceStore.getState()).inside === false;

        if (!current()) return;
        await detectAndAlert(data, currentSettings, { remote });
        const history = await loadOutageHistory(sid);
        if (!current()) return;
        setTelemetry(data);
        setLastFetchTime(Date.now());
        setOutageHistory(history);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Fetch failed';
        if (current()) setFetchError(msg === 'AUTH_REQUIRED' ? 'Session expired. Please log in again.' : msg);
      } finally {
        if (current()) setIsFetching(false);
      }
    })();
    fetchInFlight.current = { key, promise };
    try { await promise; }
    finally { if (fetchInFlight.current?.promise === promise) fetchInFlight.current = null; }
  }, []);

  // ─── Foreground polling ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isLoggedIn || !systemId) return;

    const stopTimer = () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
    const sync = (state: typeof RNAppState.currentState) => {
      stopTimer();
      if (state === 'active') {
        // Fence state may have changed via headless task while backgrounded.
        GeofenceStore.getState().then(setGeofenceState).catch(() => {});
        if (isLoggedIn && systemId) {
          refreshTelemetry();
          if (!pollTimerRef.current) {
            pollTimerRef.current = setInterval(refreshTelemetry, FOREGROUND_POLL_INTERVAL_MS);
          }
          // Self-heal: re-assert geofence registration on foreground return.
          // Covers location-services toggles, Play Services fence wipes and
          // OEM interference that happen while we're backgrounded.
          // registerGeofence is idempotent (expo-location replaces registration).
          const settingsNow = settingsRef.current;
          if (settingsNow.monitoringMode === 'geofenced' && settingsNow.homeZone) {
            registerGeofence(settingsNow.homeZone).catch(() => {});
          }
        }
      }
    };
    const sub = RNAppState.addEventListener('change', sync);
    sync(RNAppState.currentState);
    return () => { stopTimer(); sub.remove(); };
  }, [isLoggedIn, systemId, refreshTelemetry]);

  // ─── Monitoring Mode Router (foreground service + geofence) ────────────────
  // 'always': FGS runs unconditionally (legacy behavior).
  // 'geofenced': FGS runs only while inside the home zone; the native
  // geofence owns ENTER/EXIT wake-ups and background-fetch owns remote polls.
  useEffect(() => {
    if (isAuthLoading || !settingsLoaded) return;
    let cancelled = false;
    if (!(isLoggedIn && systemId)) {
      modeQueue.current = modeQueue.current.catch(() => {}).then(async () => {
        if (cancelled) return;
        await ForegroundServiceManager.stopService().catch(() => {});
        await unregisterGeofence().catch(() => {});
        await disarmRemotePolling().catch(() => {});
      });
      return () => { cancelled = true; };
    }

    const applyMode = async () => {
      // Boot guard: if the device rebooted since the last fence transition,
      // persisted `inside` is stale (Android wipes fence registrations).
      // Reset to unknown — fail-loud until the next ENTER/EXIT or in-app
      // location check re-establishes it.
      if (await GeofenceStore.shouldResetFenceState()) {
        console.warn('[AppContext] Device rebooted since last fence state — resetting.');
        await GeofenceStore.invalidateState();
      }

      if (settings.monitoringMode === 'geofenced' && settings.homeZone) {
        // Arm the native fence (idempotent) + remote polling safety net.
        const armed = await registerGeofence(settings.homeZone);
        if (cancelled) return;
        if (!armed) {
          // Degrade to always-on monitoring rather than losing alarms.
          console.warn('[AppContext] Geofence arm failed — falling back to always-on monitoring.');
          await armRemotePolling().catch(() => {});
          await ForegroundServiceManager.startService('user').catch(() => {});
          return;
        }

        await armRemotePolling();
        await GeofenceStore.stampBootMarker();

        const geo = await GeofenceStore.getState();
        if (cancelled) return;
        setGeofenceState(geo);
        if (geo.inside !== false) {
          // Inside (or unknown — fail loud) -> siren-capable monitoring.
          await ForegroundServiceManager.startService('user').catch((err) => {
            console.warn('[AppContext] Failed to start foreground service:', err);
          });
        } else {
          // Outside -> no FGS. Native fence wakes us on ENTER.
          await ForegroundServiceManager.stopService().catch(() => {});
        }
      } else {
        // 'always' mode: teardown fence + remote polling, run FGS per legacy toggle.
        await unregisterGeofence();
        await disarmRemotePolling();
        if (cancelled) return;
        if (settings.foregroundServiceEnabled) {
          // Budget recovery: if the 24h dataSync window rolled over since
          // degradation, clear the exhausted flag and let the FGS run again.
          // If still exhausted, keep remote polling armed (notification-only
          // alarms) and don't restart the FGS — the OS would kill it anyway.
          if (await DataSyncBudgetStore.getState().then((s) => s.exhausted)) {
            const budgetRecovered = !(await DataSyncBudgetStore.isExhausted());
            if (budgetRecovered) {
              console.log('[AppContext] dataSync budget window rolled — resuming always-mode FGS.');
              await DataSyncBudgetStore.clear();
            } else {
              console.warn('[AppContext] dataSync budget still spent — staying on remote polling.');
              await armRemotePolling().catch(() => {});
              await ForegroundServiceManager.stopService().catch(() => {});
              return;
            }
          }
          await ForegroundServiceManager.startService('user').catch((err) => {
            console.warn('[AppContext] Failed to start foreground service:', err);
          });
        } else {
          await ForegroundServiceManager.stopService().catch(() => {});
        }
      }
    };

    modeQueue.current = modeQueue.current.catch(() => {}).then(async () => {
      if (!cancelled) await applyMode();
    }).catch((err) => {
      console.warn('[AppContext] Mode router failed:', err);
    });
    return () => { cancelled = true; };
  }, [isAuthLoading, settingsLoaded, isLoggedIn, systemId, settings.monitoringMode, settings.homeZone, settings.foregroundServiceEnabled]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const login = useCallback(
    async (tokens: AuthTokens, sid: string, email: string) => {
      Store.invalidateSession();
      await Store.saveTokens(tokens);
      await Store.setSystemId(sid);
      await Store.setEmail(email);
      const nextSettings = { ...settingsRef.current, activeStationId: sid };
      await SettingsStore.saveSettings(nextSettings);
      settingsRef.current = nextSettings;
      systemIdRef.current = sid;
      setSettings(nextSettings);
      setSystemId(sid);
      setIsLoggedIn(true);
    },
    []
  );

  const logout = useCallback(async () => {
    systemIdRef.current = null;
    Store.invalidateSession();
    setIsLoggedIn(false);
    setSystemId(null);
    setIsFetching(false);
    await modeQueue.current.catch(() => {});
    await ForegroundServiceManager.stopService().catch(() => {});
    await Store.clearAll();
    await unregisterGeofence().catch(() => {});
    await disarmRemotePolling().catch(() => {});
    await GeofenceStore.clear();
    setIsLoggedIn(false);
    setSystemId(null);
    setTelemetry(null);
    setLastFetchTime(null);
    setFetchError(null);
    setOutageHistory([]);
    setGeofenceState({ inside: null, lastTransitionAt: null, registeredAt: null });
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const reloadHistory = useCallback(async () => {
    const history = await loadOutageHistory(systemIdRef.current ?? undefined);
    setOutageHistory(history);
  }, []);

  const updateSettings = useCallback(async (newSettings: AppSettings) => {
    await SettingsStore.saveSettings(newSettings);
    if (JSON.stringify(settingsRef.current.homeZone) !== JSON.stringify(newSettings.homeZone)) {
      await GeofenceStore.invalidateState();
    }
    const sid = newSettings.activeStationId;
    if (sid && sid !== systemIdRef.current) {
      await ForegroundServiceManager.stopService();
      await Store.setSystemId(sid);
      const history = await loadOutageHistory(sid);
      await Store.removeOutageStartTime();
      systemIdRef.current = sid;
      setSystemId(sid);
      setTelemetry(null);
      setLastFetchTime(null);
      setFetchError(null);
      setOutageHistory(history);
    }
    settingsRef.current = newSettings;
    setSettings(newSettings);
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
        settingsLoaded,
        updateSettings,
        geofenceState,
        reloadGeofenceState,
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
