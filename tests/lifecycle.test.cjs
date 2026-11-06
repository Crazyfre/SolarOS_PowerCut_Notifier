const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createLoader, storage, deferred, tick, root } = require('./helpers.cjs');

const abs = (name) => path.join(root, name);
const data = { systemId: 'A', gridRelayStatus: 'on', batterySoc: 80, pvPower: 1000, batteryStatus: 'CHARGE' };

function serviceEnvironment({ geofenced = false, inside = null, exhausted = false, effectiveMode } = {}) {
  const disk = storage();
  let runner, stopped = 0, permissions = 0, armed = 0, degraded = false;
  let fetch = async () => data;
  const displayed = [], detections = [];
  const settings = { monitoringMode: geofenced ? 'geofenced' : 'always',
    homeZone: geofenced ? { lat: 10, lng: 76, radiusMeters: 250 } : null, refreshIntervalMinutes: 5 };
  const load = createLoader({
    '@react-native-async-storage/async-storage': disk,
    'react-native': { Platform: { OS: 'android', Version: 35 } },
    [abs('src/services/nativeMonitoring')]: {
      __esModule: true,
      default: { registerForegroundService: (fn) => { runner = fn; },
        displayNotification: async (notification) => { displayed.push(notification); },
        stopForegroundService: async () => { stopped++; }, createChannel: async () => {},
        requestPermission: async () => { permissions++; } },
      AndroidImportance: { DEFAULT: 3 },
      AndroidForegroundServiceType: { FOREGROUND_SERVICE_TYPE_LOCATION: 8, FOREGROUND_SERVICE_TYPE_DATA_SYNC: 1 },
    },
    [abs('src/api/solar')]: { fetchTelemetry: (...args) => fetch(...args) },
    [abs('src/storage/secureStore')]: { Store: { getSystemId: async () => 'A', getSessionVersion: () => 0 } },
    [abs('src/storage/settingsStore')]: { SettingsStore: { loadSettings: async () => settings } },
    [abs('src/services/stateDetector')]: { detectAndAlert: async (...args) => { detections.push(args); } },
    [abs('src/storage/geofenceStore')]: { GeofenceStore: { getState: async () => ({ inside }),
      setState: async () => {}, recordEvent: async () => {} } },
    [abs('src/services/geofenceService')]: { resolveEffectiveMode: async () => effectiveMode ?? (geofenced ? 'geofenced' : 'always'),
      isGeofenceRegistered: async () => geofenced, verifyInsideZone: async () => null },
    [abs('src/storage/dataSyncBudgetStore')]: { isDataSyncBudgetEnforced: () => true,
      DataSyncBudgetStore: { recordRuntime: async () => {}, isExhausted: async () => exhausted,
        markDegraded: async () => { degraded = true; } } },
    [abs('src/services/remotePolling')]: { armRemotePolling: async () => { armed++; } },
  });
  const manager = load('src/services/foregroundService.ts').ForegroundServiceManager;
  return { manager, settings, displayed, detections, runner: () => runner(),
    fetch: (fn) => { fetch = fn; }, stopped: () => stopped, permissions: () => permissions,
    armed: () => armed, degraded: () => degraded };
}

test('concurrent foreground starts create one service with explicit dataSync type', async () => {
  const env = serviceEnvironment();
  await Promise.all([env.manager.startService(), env.manager.startService()]);
  assert.equal(env.displayed.length, 1);
  assert.deepEqual(env.displayed[0].android.foregroundServiceTypes, [1]);
  await env.manager.stopService();
});

test('stopping during HTTP prevents later detection or service resurrection', async () => {
  const env = serviceEnvironment();
  const gate = deferred();
  env.fetch(() => gate.promise);
  await env.manager.startService();
  const running = env.runner();
  await tick();
  await env.manager.stopService();
  gate.resolve(data);
  await running;
  assert.equal(env.detections.length, 0);
  assert.equal(env.displayed.length, 1);
  assert.equal(env.manager.isServiceRunning(), false);
});

test('unknown geofence state stays siren-capable and does not stop monitoring', async () => {
  const env = serviceEnvironment({ geofenced: true, inside: null });
  await env.manager.startService('geofence-enter');
  const running = env.runner();
  await tick();
  assert.equal(env.detections.length, 1);
  assert.equal(env.detections[0][2].remote, false);
  assert.equal(env.manager.isServiceRunning(), true);
  assert.equal(env.permissions(), 0);
  await env.manager.stopService();
  await running;
});

test('outside-zone service stops even if its final telemetry request fails', async () => {
  const env = serviceEnvironment({ geofenced: true, inside: false });
  env.fetch(async () => { throw new Error('Network Error'); });
  await env.manager.startService();
  await env.runner();
  assert.equal(env.manager.isServiceRunning(), false);
  assert.equal(env.stopped(), 1);
});

test('budget exhaustion hands off before HTTP and stops despite a network failure', async () => {
  const env = serviceEnvironment({ exhausted: true });
  env.fetch(async () => { throw new Error('Network Error'); });
  await env.manager.startService();
  await env.runner();
  assert.equal(env.armed(), 1);
  assert.equal(env.degraded(), true);
  assert.equal(env.manager.isServiceRunning(), false);
});

test('failed geofence permissions select dataSync fallback rather than location', async () => {
  const env = serviceEnvironment({ geofenced: true, effectiveMode: 'always' });
  await env.manager.startService();
  assert.deepEqual(env.displayed[0].android.foregroundServiceTypes, [1]);
  await env.manager.stopService();
});

test('runtime type stays fixed until a deliberate service restart', async () => {
  const env = serviceEnvironment({ geofenced: true, inside: true });
  await env.manager.startService();
  env.settings.monitoringMode = 'always';
  const running = env.runner();
  await tick();
  assert.ok(env.displayed.every((n) => n.android.foregroundServiceTypes[0] === 8));
  await env.manager.stopService();
  await running;
});

test('remote polling registers a 15-minute interval in seconds', async () => {
  let options;
  const load = createLoader({ 'expo-background-fetch': {
    registerTaskAsync: async (_name, config) => { options = config; }, unregisterTaskAsync: async () => {},
  } });
  await load('src/services/remotePolling.ts').armRemotePolling();
  assert.equal(options.minimumInterval, 900);
});

function fenceEnvironment() {
  const disk = storage(), registrations = [], gate = deferred();
  let first = true, stopped = 0;
  const load = createLoader({
    '@react-native-async-storage/async-storage': disk,
    'react-native': { Platform: { OS: 'android', Version: 35 } },
    [abs('modules/outage-alarm')]: { getBootId: () => '1' },
    [abs('src/services/geofenceTasks')]: { GEOFENCE_TASK: 'home' },
    'expo-background-fetch': {},
    'expo-location': {
      getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
      getBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
      startGeofencingAsync: async (_task, zones) => { registrations.push(zones[0]); if (first) { first = false; await gate.promise; } },
      hasStartedGeofencingAsync: async () => true,
      stopGeofencingAsync: async () => { stopped++; },
    },
  });
  return { fence: load('src/services/geofenceService.ts'), registrations, gate, stopped: () => stopped };
}

test('a zone update during registration is applied after the first zone', async () => {
  const env = fenceEnvironment();
  const one = env.fence.registerGeofence({ lat: 10, lng: 76, radiusMeters: 250 });
  await tick();
  const two = env.fence.registerGeofence({ lat: 11, lng: 77, radiusMeters: 500 });
  env.gate.resolve();
  await Promise.all([one, two]);
  assert.deepEqual(env.registrations.map((z) => z.latitude), [10, 11]);
});

test('unregister waits for a pending registration and leaves the fence disabled', async () => {
  const env = fenceEnvironment();
  const register = env.fence.registerGeofence({ lat: 10, lng: 76, radiusMeters: 250 });
  await tick();
  const unregister = env.fence.unregisterGeofence();
  env.gate.resolve();
  await Promise.all([register, unregister]);
  assert.equal(env.stopped(), 1);
});

test('zone normalization rejects non-finite radii and coordinates', () => {
  const { fence } = fenceEnvironment();
  assert.equal(fence.normalizeZone(10, 76, NaN), null);
  assert.equal(fence.normalizeZone(91, 76, 250), null);
  assert.deepEqual(fence.normalizeZone(10, 76, 20), { lat: 10, lng: 76, radiusMeters: 100 });
});

test('concurrent fence state updates retain both transition and registration fields', async () => {
  const disk = storage();
  const load = createLoader({
    '@react-native-async-storage/async-storage': disk,
    'react-native': { Platform: { OS: 'android' } },
    [abs('modules/outage-alarm')]: { getBootId: () => '1' },
  });
  const store = load('src/storage/geofenceStore.ts').GeofenceStore;
  await Promise.all([store.setState({ inside: true }), store.setState({ registeredAt: 123 })]);
  assert.equal((await store.getState()).inside, true);
  assert.equal((await store.getState()).registeredAt, 123);
});

test('remote background checks cover an inside-zone service that could not start', async () => {
  const load = createLoader({
    'expo-task-manager': { defineTask: () => {} },
    'expo-background-fetch': {}, 'expo-location': { LocationGeofencingEventType: { Enter: 1, Exit: 2 } },
    [abs('src/api/solar')]: {}, [abs('src/storage/secureStore')]: {},
    [abs('src/services/stateDetector')]: {},
    [abs('src/storage/settingsStore')]: { SettingsStore: { loadSettings: async () => ({ monitoringMode: 'geofenced', homeZone: {} }) } },
    [abs('src/storage/geofenceStore')]: { GeofenceStore: { getState: async () => ({ inside: true }) } },
    [abs('src/services/foregroundService')]: { ForegroundServiceManager: { isServiceRunning: () => false } },
    [abs('src/services/remotePolling')]: { GEOFENCE_REMOTE_POLL_TASK: 'remote' },
    [abs('src/storage/dataSyncBudgetStore')]: { isDataSyncBudgetEnforced: () => false },
  });
  assert.equal(await load('src/services/geofenceTasks.ts').shouldRemotePoll(), true);
});
