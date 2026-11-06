const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createLoader, storage, deferred, tick, root } = require('./helpers.cjs');

const telemetry = (changes = {}) => ({ systemId: 'A', gridRelayStatus: 'on', batterySoc: 80,
  batteryStatus: 'CHARGE', batteryBv: 52, batteryPower: 100, wirePower: 300,
  usePower: 500, pvPower: 1000, ...changes });
const tokens = { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, token_type: 'bearer' };

function environment(extra = {}) {
  const asyncStorage = storage();
  const secureStorage = storage();
  const mocks = {
    '@react-native-async-storage/async-storage': asyncStorage,
    'expo-secure-store': { getItemAsync: secureStorage.getItem, setItemAsync: secureStorage.setItem,
      deleteItemAsync: secureStorage.removeItem },
    'react-native': { Platform: { OS: 'android', Version: 35 } },
    ...extra,
  };
  const load = createLoader(mocks);
  return { load, mocks, asyncStorage, secureStorage };
}

function authEnvironment() {
  let refreshCount = 0;
  let refresh = async () => tokens;
  const env = environment({
    [path.join(root, 'src/api/auth')]: {
      refreshAccessToken: async () => { refreshCount++; return refresh(); },
      loginWithPassword: async () => tokens,
    },
  });
  env.secureStorage.data.set('sg_refresh_token', 'old-refresh');
  env.secureStorage.data.set('sg_access_token', 'old-access');
  env.secureStorage.data.set('sg_token_expiry', '0');
  return { ...env, count: () => refreshCount, refresh: (fn) => { refresh = fn; } };
}

test('parallel API users share one token refresh', async () => {
  const env = authEnvironment();
  const gate = deferred();
  env.refresh(() => gate.promise);
  const { AuthService } = env.load('src/services/authService.ts');
  const pending = Array.from({ length: 8 }, () => AuthService.getAccessToken());
  await tick();
  assert.equal(env.count(), 1);
  gate.resolve(tokens);
  assert.deepEqual(await Promise.all(pending), Array(8).fill(tokens.access_token));
});

test('logout during refresh cannot restore credentials', async () => {
  const env = authEnvironment();
  const gate = deferred();
  env.refresh(() => gate.promise);
  const { AuthService } = env.load('src/services/authService.ts');
  const { Store } = env.load('src/storage/secureStore.ts');
  const pending = AuthService.getAccessToken();
  const rejected = assert.rejects(pending, /AUTH_REQUIRED/);
  await tick();
  await Store.clearAll();
  gate.resolve(tokens);
  await rejected;
  assert.equal(env.secureStorage.data.size, 0);
});

test('network errors remain retryable instead of becoming login errors', async () => {
  const env = authEnvironment();
  env.refresh(async () => { throw new Error('Network Error'); });
  const { AuthService } = env.load('src/services/authService.ts');
  await assert.rejects(AuthService.getAccessToken(), /Network Error/);
  env.refresh(async () => tokens);
  assert.equal(await AuthService.getAccessToken(), tokens.access_token);
});

test('a rejected old token reuses a refresh already completed by another request', async () => {
  const env = authEnvironment();
  const { AuthService } = env.load('src/services/authService.ts');
  await AuthService.getAccessToken();
  assert.equal(await AuthService.getAccessToken('old-access'), tokens.access_token);
  assert.equal(env.count(), 1);
});

test('corrupt expiry is treated as expired', async () => {
  const env = environment();
  env.secureStorage.data.set('sg_token_expiry', 'invalid');
  assert.equal(await env.load('src/storage/secureStore.ts').Store.isTokenExpired(), true);
});

function apiEnvironment() {
  let count = 0;
  let get = async () => ({ data: telemetry() });
  const authCalls = [];
  const env = environment({
    axios: { isAxiosError: (error) => error?.isAxiosError === true,
      create: () => ({ get: async (...args) => { count++; return get(...args); }, post: async () => ({ data: { data: [] } }) }) },
    [path.join(root, 'src/services/authService')]: { AuthService: {
      getAccessToken: async (rejected) => { authCalls.push(rejected); return rejected ? 'renewed' : 'initial'; },
    } },
  });
  return { ...env, count: () => count, get: (fn) => { get = fn; }, authCalls };
}

test('overlapping telemetry polls share the HTTP request but subsequent polls fetch anew', async () => {
  const env = apiEnvironment();
  const gate = deferred();
  env.get(() => gate.promise);
  const { fetchTelemetry } = env.load('src/api/solar.ts');
  const pending = [fetchTelemetry('A'), fetchTelemetry('A'), fetchTelemetry('A')];
  await tick();
  assert.equal(env.count(), 1);
  gate.resolve({ data: telemetry({ batterySoc: '76', generationMonth: '123.4' }) });
  for (const data of await Promise.all(pending)) {
    assert.equal(data.batterySoc, 76);
    assert.equal(data.generationMonth, 123.4);
  }
  env.get(async () => ({ data: telemetry() }));
  await fetchTelemetry('A');
  assert.equal(env.count(), 2);
});

test('missing grid status and invalid counters are rejected before detection / rendering', async () => {
  for (const invalid of [null, {}, telemetry({ gridRelayStatus: 'unknown' }), telemetry({ batterySoc: 101 }),
    telemetry({ batterySoc: null }), telemetry({ buyMonth: 'not-a-number' })]) {
    const env = apiEnvironment();
    env.get(async () => ({ data: invalid }));
    await assert.rejects(env.load('src/api/solar.ts').fetchTelemetry('A'), /Invalid telemetry/);
  }
});

test('401 is retried once and a repeated 401 consistently returns AUTH_REQUIRED', async () => {
  const env = apiEnvironment();
  env.get(async () => { throw { isAxiosError: true, response: { status: 401 } }; });
  await assert.rejects(env.load('src/api/solar.ts').fetchTelemetry('A'), /AUTH_REQUIRED/);
  assert.equal(env.count(), 2);
  assert.deepEqual(env.authCalls, [undefined, 'initial']);
});

function detectorEnvironment() {
  const sent = [];
  const notifications = {};
  for (const name of ['sendPowerCutNotification', 'sendGridRestoredNotification', 'sendBatteryLowNotification',
    'sendBatteryCriticalNotification', 'sendOverSolarLoadNotification', 'sendBatteryDischargingNotification']) {
    notifications[name] = async (...args) => { sent.push({ name, args }); };
  }
  let stopped = 0;
  notifications.stopOutageAlarm = () => { stopped++; };
  const env = environment({ [path.join(root, 'src/services/notifications')]: notifications });
  const settings = env.load('src/storage/settingsStore.ts').DEFAULT_SETTINGS;
  return { ...env, settings, sent, notifications, stopped: () => stopped,
    detector: env.load('src/services/stateDetector.ts') };
}

test('concurrent outage detection records and announces one grid transition', async () => {
  const env = detectorEnvironment();
  await env.detector.detectAndAlert(telemetry(), env.settings);
  await Promise.all(Array.from({ length: 6 }, () => env.detector.detectAndAlert(telemetry({ gridRelayStatus: 'off' }), env.settings)));
  assert.equal(env.sent.filter((s) => s.name === 'sendPowerCutNotification').length, 1);
  assert.equal((await env.detector.loadOutageHistory()).length, 1);
});

test('outage stats retain starting SOC, minimum SOC, peak load and actual SOC drop', async () => {
  const env = detectorEnvironment();
  await env.detector.detectAndAlert(telemetry(), env.settings);
  await env.detector.detectAndAlert(telemetry({ gridRelayStatus: 'off', batterySoc: 70 }), env.settings);
  await env.detector.detectAndAlert(telemetry({ gridRelayStatus: 'off', batterySoc: 40, usePower: 2200 }), env.settings);
  await env.detector.detectAndAlert(telemetry({ batterySoc: 45 }), env.settings);
  const [record] = await env.detector.loadOutageHistory();
  assert.equal(record.startBatterySoc, 70);
  assert.equal(record.minBatterySoc, 40);
  assert.equal(record.endBatterySoc, 45);
  assert.equal(record.maxLoadW, 2200);
  assert.equal(env.sent.find((s) => s.name === 'sendGridRestoredNotification').args[3], 25);
});

test('first observation during an outage records it and warns about critical battery', async () => {
  const env = detectorEnvironment();
  await env.detector.detectAndAlert(telemetry({ gridRelayStatus: 'off', batterySoc: 5 }), env.settings);
  assert.equal((await env.detector.loadOutageHistory()).length, 1);
  assert.deepEqual(env.sent.map((s) => s.name), ['sendBatteryCriticalNotification']);
});

test('warning deduplication survives detector reinitialization', async () => {
  const env = detectorEnvironment();
  const low = telemetry({ gridRelayStatus: 'off', batterySoc: 15 });
  await env.detector.detectAndAlert(low, env.settings);
  const restarted = createLoader(env.mocks)('src/services/stateDetector.ts');
  await restarted.detectAndAlert(low, env.settings);
  assert.equal(env.sent.filter((s) => s.name === 'sendBatteryLowNotification').length, 1);
});

test('station switching does not create a restore for another station', async () => {
  const env = detectorEnvironment();
  await env.detector.detectAndAlert(telemetry({ gridRelayStatus: 'off' }), env.settings);
  await env.detector.detectAndAlert(telemetry({ systemId: 'B' }), env.settings);
  assert.equal(env.sent.length, 0);
  assert.equal((await env.detector.loadOutageHistory('B')).length, 0);
  assert.equal((await env.detector.loadOutageHistory('A')).length, 1);
});

test('simulation cannot change real transition state or history', async () => {
  const env = detectorEnvironment();
  await env.detector.detectAndAlert(telemetry(), env.settings);
  env.asyncStorage.data.set('sg_dev_overrides', JSON.stringify({ enabled: true }));
  await env.detector.detectAndAlert(telemetry({ gridRelayStatus: 'off' }), env.settings);
  env.asyncStorage.data.set('sg_dev_overrides', JSON.stringify({ enabled: false }));
  await env.detector.detectAndAlert(telemetry(), env.settings);
  assert.equal(env.sent.length, 0);
  assert.deepEqual(await env.detector.loadOutageHistory(), []);
});

test('restoring power stops a siren even when restore notifications are disabled', async () => {
  const env = detectorEnvironment();
  const settings = { ...env.settings, alertOnGridOffOnly: true };
  await env.detector.detectAndAlert(telemetry({ gridRelayStatus: 'off' }), settings);
  await env.detector.detectAndAlert(telemetry(), settings);
  assert.equal(env.stopped(), 1);
  assert.equal(env.sent.length, 0);
});

test('unchanged outage telemetry does not rewrite history', async () => {
  const env = detectorEnvironment();
  const off = telemetry({ gridRelayStatus: 'off' });
  await env.detector.detectAndAlert(off, env.settings);
  await env.detector.detectAndAlert(off, env.settings);
  assert.equal(env.asyncStorage.writes.filter((key) => key === 'sg_outage_history').length, 1);
});

test('notification failure cannot prevent outage history and subsequent battery warnings', async () => {
  const env = detectorEnvironment();
  env.notifications.sendPowerCutNotification = async () => { throw new Error('Permission denied'); };
  await env.detector.detectAndAlert(telemetry(), env.settings);
  await env.detector.detectAndAlert(telemetry({ gridRelayStatus: 'off', batterySoc: 15 }), env.settings);
  assert.equal((await env.detector.loadOutageHistory()).length, 1);
  assert.equal(env.sent[0].name, 'sendBatteryLowNotification');
});

function notificationEnvironment() {
  const scheduled = [], alarms = [], channels = [];
  const env = environment({
    'expo-constants': { __esModule: true, default: { executionEnvironment: 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient' } },
    'expo-notifications': {
      setNotificationHandler: () => {}, AndroidImportance: { HIGH: 4, DEFAULT: 3, MAX: 5 },
      setNotificationChannelAsync: async (id, channel) => { channels.push({ id, channel }); },
      scheduleNotificationAsync: async (request) => { scheduled.push(request); return 'id'; },
    },
    [path.join(root, 'src/theme')]: { serviceColors: {} },
    [path.join(root, 'modules/outage-alarm')]: { triggerAlarm: (options) => alarms.push(options), stopAlarm: () => {} },
  });
  return { ...env, scheduled, alarms, channels, notifications: env.load('src/services/notifications.ts'),
    settings: env.load('src/storage/settingsStore.ts').DEFAULT_SETTINGS };
}

test('Android alerts select their channel in the immediate trigger', async () => {
  const env = notificationEnvironment();
  await env.notifications.sendPowerCutNotification(telemetry(), env.settings);
  assert.equal(env.scheduled[0].trigger.channelId, 'sg_alarm_v2_alarm');
  assert.equal(env.scheduled[0].content.channelId, undefined);
  assert.equal(env.alarms.length, 1);
});

test('remote restore suppresses the native restoration chime', async () => {
  const env = notificationEnvironment();
  await env.notifications.sendGridRestoredNotification(60_000, 70, env.settings, 10, { remote: true });
  assert.equal(env.alarms.length, 0);
  assert.equal(env.scheduled[0].trigger.channelId, 'solarguard');
});

test('quiet hours support overnight and daytime windows with an exclusive end', () => {
  const env = notificationEnvironment();
  const quiet = { ...env.settings, quietHoursEnabled: true };
  const at = (hour, minute = 0) => new Date(2026, 10, 6, hour, minute);
  assert.equal(env.notifications.isWithinQuietHours(quiet, at(23)), true);
  assert.equal(env.notifications.isWithinQuietHours(quiet, at(3)), true);
  assert.equal(env.notifications.isWithinQuietHours(quiet, at(7)), false);
  assert.equal(env.notifications.isWithinQuietHours({ ...quiet, quietHoursStart: '09:00', quietHoursEnd: '17:00' }, at(12)), true);
  assert.equal(env.notifications.isWithinQuietHours({ ...quiet, quietHoursStart: 'invalid' }, at(12)), false);
});

test('quiet alerts use a soundless channel and never invoke native sirens', async () => {
  const env = notificationEnvironment();
  const minute = new Date().getHours() * 60 + new Date().getMinutes();
  const format = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const quiet = { ...env.settings, quietHoursEnabled: true,
    quietHoursStart: format((minute + 1439) % 1440), quietHoursEnd: format((minute + 2) % 1440) };
  await env.notifications.registerNotificationChannels();
  await env.notifications.sendPowerCutNotification(telemetry(), quiet);
  assert.equal(env.scheduled[0].trigger.channelId, 'sg_quiet');
  assert.equal(env.scheduled[0].content.sound, false);
  assert.equal(env.scheduled[0].content.data.sgSilent, true);
  assert.equal(env.channels.find((c) => c.id === 'sg_quiet').channel.sound, null);
  assert.equal(env.alarms.length, 0);
});

test('tariffs survive JSON storage including the open upper band', async () => {
  const env = environment();
  const { SettingsStore, DEFAULT_SETTINGS } = env.load('src/storage/settingsStore.ts');
  await SettingsStore.saveSettings(DEFAULT_SETTINGS);
  const loaded = await SettingsStore.loadSettings();
  assert.equal(loaded.tariff.nonTelescopicBands.at(-1).upTo, Infinity);
  assert.equal(env.load('src/services/tariff/ksebTariff.ts').estimateBill(600, loaded.tariff).total, 6072);
});

test('failed settings persistence rejects instead of reporting success', async () => {
  const env = environment();
  env.asyncStorage.setItem = async () => { throw new Error('Disk full'); };
  const { SettingsStore, DEFAULT_SETTINGS } = env.load('src/storage/settingsStore.ts');
  await assert.rejects(SettingsStore.saveSettings(DEFAULT_SETTINGS), /Disk full/);
});

test('invalid persisted settings recover usable values instead of breaking screens or timers', async () => {
  const env = environment();
  env.asyncStorage.data.set('solarguard_settings', JSON.stringify({
    batteryCapacity: null, refreshIntervalMinutes: -5, alarmDurationSeconds: 999,
    homeZone: { lat: 100, lng: 76, radiusMeters: 250 }, tariff: { monthlyCycleFactor: 0 },
  }));
  const settings = await env.load('src/storage/settingsStore.ts').SettingsStore.loadSettings();
  assert.equal(settings.batteryCapacity, 5.12);
  assert.equal(settings.refreshIntervalMinutes, 1);
  assert.equal(settings.alarmDurationSeconds, 10);
  assert.equal(settings.homeZone, null);
  assert.equal(settings.tariff.monthlyCycleFactor, 1);
});

test('tariff cliff scales with a two-month billing cycle', () => {
  const env = environment();
  const tariff = env.load('src/services/tariff/ksebTariff.ts');
  const cfg = { ...tariff.DEFAULT_KSEB_TARIFF, monthlyCycleFactor: 2 };
  assert.equal(tariff.cliffJump(cfg), 568.43);
});

test('rolling budget counts only runtime inside the last 24 hours', async () => {
  const env = environment();
  const now = Date.now(), hour = 3_600_000;
  env.asyncStorage.data.set('sg_fs_datasync_budget', JSON.stringify({ segments: [[now - 25 * hour, now - 23 * hour]], exhausted: false }));
  const used = await env.load('src/storage/dataSyncBudgetStore.ts').DataSyncBudgetStore.getUsedHours();
  assert.ok(Math.abs(used - 1) < 0.001, `Expected 1 hour, received ${used}`);
});

test('concurrent budget writes retain separate runtime segments without double counting overlaps', async () => {
  const env = environment();
  const budget = env.load('src/storage/dataSyncBudgetStore.ts').DataSyncBudgetStore;
  const now = Date.now(), hour = 3_600_000;
  await Promise.all([
    budget.recordRuntime(now - 4 * hour, now - 3 * hour),
    budget.recordRuntime(now - 2 * hour, now - hour),
  ]);
  await budget.recordRuntime(now - 4 * hour, now - 3 * hour);
  assert.ok(Math.abs(await budget.getUsedHours() - 2) < 0.001);
});

test('optional native module lets unsupported platforms load without an import crash', () => {
  const load = createLoader({ expo: { requireOptionalNativeModule: () => null } });
  const alarm = load('modules/outage-alarm/index.ts').default;
  assert.equal(alarm.isAlarmPlaying(), false);
  assert.throws(() => alarm.triggerAlarm({}), /Android development or release build/);
});

test('monitoring adapter avoids importing Notifee when its native module is absent', async () => {
  const load = createLoader({ 'react-native': { Platform: { OS: 'android' }, NativeModules: {} } });
  const monitoring = load('src/services/nativeMonitoring.ts').default;
  monitoring.registerForegroundService(() => Promise.resolve());
  await monitoring.stopForegroundService();
  await assert.rejects(monitoring.displayNotification({}), /Android development or release build/);
});

test('release comparison handles beta versions and release-v workflow tags', () => {
  const compare = environment().load('src/services/updateChecker.ts').compareVersions;
  assert.equal(compare('3.1.5', '3.1.6-beta.3'), -1);
  assert.equal(compare('release-v3.1.6', '3.1.6-beta.3'), 1);
  assert.equal(compare('3.1.6-beta.10', '3.1.6-beta.3'), 1);
  assert.equal(compare('3.1.6-beta.3', '3.1.6'), -1);
  assert.equal(compare('v3.2.0+build.5', '3.1.6'), 1);
  assert.equal(compare('bad-version', '3.1.6'), 0);
});
