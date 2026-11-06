const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createLoader, storage, deferred, tick, root } = require('./helpers.cjs');

// A small hook scheduler exercises provider effects and async actions without
// native UI. Device rendering and gestures still require an Android build.
function hookScheduler() {
  const cells = [];
  let cursor = 0, effects = [], component, value, queued = false, disposed = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  function schedule() {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!disposed) render(); });
  }
  function render() {
    cursor = 0;
    effects = [];
    value = component({ children: null }).props.value;
    for (const effect of effects) effect();
  }
  const react = {
    createElement: (type, props) => ({ type, props }), createContext: () => ({ Provider: 'Provider' }),
    useState(initial) {
      const index = cursor++;
      if (!cells[index]) cells[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [cells[index].value, (next) => {
        const nextValue = typeof next === 'function' ? next(cells[index].value) : next;
        if (!Object.is(nextValue, cells[index].value)) { cells[index].value = nextValue; schedule(); }
      }];
    },
    useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!cells[index] || !same(cells[index].deps, deps)) cells[index] = { fn, deps };
      return cells[index].fn;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (cells[index] && same(cells[index].deps, deps)) return;
      const previous = cells[index];
      const cell = cells[index] = { deps };
      effects.push(() => { previous?.cleanup?.(); cell.cleanup = fn(); });
    },
    useContext: () => value,
  };
  return { react, mount(fn) { component = fn; render(); }, value: () => value,
    dispose() { disposed = true; for (const cell of cells) cell.cleanup?.(); } };
}

function contextEnvironment({ startupGate, initialSettings, inside = null } = {}) {
  const hooks = hookScheduler(), disk = storage(), requests = [], detections = [], listeners = new Set();
  if (initialSettings) disk.data.set('solarguard_settings', JSON.stringify(initialSettings));
  let sid = 'A', version = 0, stops = 0;
  let fetch = async (systemId) => ({ systemId, gridRelayStatus: 'on', batterySoc: 80 });
  const mocks = {
    react: hooks.react,
    'react-native': { AppState: { currentState: 'background',
      addEventListener: (_kind, listener) => { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } } },
    '@react-native-async-storage/async-storage': disk,
    [path.join(root, 'src/storage/secureStore')]: { Store: {
      getAccessToken: async () => { if (startupGate) await startupGate; return 'access'; },
      getSystemId: async () => sid, setSystemId: async (next) => { sid = next; },
      getSessionVersion: () => version, invalidateSession: () => { version++; },
      clearAll: async () => { sid = null; version++; }, saveTokens: async () => {}, setEmail: async () => {},
      removeOutageStartTime: async () => {},
    } },
    [path.join(root, 'src/api/solar')]: { fetchTelemetry: (systemId) => { requests.push(systemId); return fetch(systemId); } },
    [path.join(root, 'src/services/stateDetector')]: { detectAndAlert: async (...args) => { detections.push(args); }, loadOutageHistory: async () => [] },
    [path.join(root, 'src/services/updateChecker')]: { checkForUpdates: async () => null },
    [path.join(root, 'src/services/notifications')]: { registerNotificationChannels: async () => {} },
    [path.join(root, 'src/services/foregroundService')]: { ForegroundServiceManager: {
      stopService: async () => { stops++; }, startService: async () => {},
    } },
    [path.join(root, 'src/services/geofenceService')]: { ...Object.fromEntries(
      ['armRemotePolling', 'disarmRemotePolling', 'registerGeofence', 'unregisterGeofence'].map((name) => [name, async () => true])),
      resolveEffectiveMode: async () => 'always' },
    [path.join(root, 'src/storage/geofenceStore')]: { GeofenceStore: { getState: async () => ({ inside }),
      shouldResetFenceState: async () => false, clear: async () => {}, invalidateState: async () => {}, stampBootMarker: async () => {} } },
    [path.join(root, 'src/storage/dataSyncBudgetStore')]: { DataSyncBudgetStore: { getState: async () => ({ exhausted: false }) } },
  };
  const load = createLoader(mocks);
  hooks.mount(load('src/context/AppContext.tsx').AppContextProvider);
  return { ...hooks, requests, detections, disk, stops: () => stops, sid: () => sid,
    fetch: (fn) => { fetch = fn; }, active: () => { for (const listener of listeners) listener('active'); },
    settings: load('src/storage/settingsStore.ts').DEFAULT_SETTINGS };
}

test('startup does not tear down monitoring before authentication has loaded', async () => {
  const gate = deferred(), env = contextEnvironment({ startupGate: gate.promise });
  try {
    await tick();
    assert.equal(env.stops(), 0);
    assert.equal(env.value().isAuthLoading, true);
    gate.resolve();
    await tick();
    assert.equal(env.value().settingsLoaded, true);
    assert.equal(env.value().isLoggedIn, true);
  } finally { env.dispose(); }
});

test('saving a station selection changes both the persistent target and the next poll', async () => {
  const env = contextEnvironment();
  try {
    await tick();
    await env.value().updateSettings({ ...env.settings, activeStationId: 'B' });
    await tick();
    await env.value().refreshTelemetry();
    assert.equal(env.sid(), 'B');
    assert.equal(env.value().systemId, 'B');
    assert.equal(env.requests.at(-1), 'B');
    assert.equal(env.value().telemetry.systemId, 'B');
  } finally { env.dispose(); }
});

test('UI refreshes are coalesced and stale responses cannot repopulate a signed-out dashboard', async () => {
  const env = contextEnvironment(), gate = deferred();
  try {
    await tick();
    env.fetch(() => gate.promise);
    const one = env.value().refreshTelemetry(), two = env.value().refreshTelemetry();
    await tick();
    assert.equal(env.requests.length, 1);
    await env.value().logout();
    gate.resolve({ systemId: 'A', gridRelayStatus: 'off', batterySoc: 70 });
    await Promise.all([one, two]);
    await tick();
    assert.equal(env.value().isLoggedIn, false);
    assert.equal(env.value().telemetry, null);
    assert.equal(env.value().isFetching, false);
  } finally { env.dispose(); }
});

test('a failed save leaves the current settings in effect', async () => {
  const env = contextEnvironment();
  try {
    await tick();
    env.disk.setItem = async () => { throw new Error('Storage unavailable'); };
    await assert.rejects(env.value().updateSettings({ ...env.settings, batteryCapacity: 20 }), /Storage unavailable/);
    assert.equal(env.value().settings.batteryCapacity, env.settings.batteryCapacity);
  } finally { env.dispose(); }
});

test('repeated foreground events coalesce their immediate refresh requests', async () => {
  const env = contextEnvironment(), gate = deferred();
  try {
    await tick();
    env.fetch(() => gate.promise);
    env.active();
    env.active();
    await tick();
    assert.equal(env.requests.length, 1);
    gate.resolve({ systemId: 'A', gridRelayStatus: 'on', batterySoc: 80 });
    await tick();
  } finally { env.dispose(); }
});

test('permission fallback does not let a stale outside flag suppress foreground alarms', async () => {
  const env = contextEnvironment({ inside: false, initialSettings: {
    monitoringMode: 'geofenced', homeZone: { lat: 10, lng: 76, radiusMeters: 250 },
  } });
  try {
    await tick();
    await env.value().refreshTelemetry();
    assert.equal(env.detections[0][2].remote, false);
  } finally { env.dispose(); }
});
