import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { TelemetryData } from '../types/telemetry';

// ─── Expo Go guard ────────────────────────────────────────────────────────────
// expo-notifications push/local features are unavailable in Expo Go since SDK 53.
// All notification calls are no-ops when running inside Expo Go, so the app
// doesn't crash during development — full functionality requires a dev build.

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ─── Permission request ───────────────────────────────────────────────────────

/**
 * Request notification permissions from the OS.
 * Returns true if granted (or false if in Expo Go where they're unavailable).
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (isExpoGo) {
    console.info(
      '[SolarGuard] Notifications are not available in Expo Go (SDK 53+). ' +
      'Use a development build for full notification support.'
    );
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('solarguard', {
      name: 'SolarGuard Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F59E0B',
    });
    await Notifications.setNotificationChannelAsync('solarguard_low', {
      name: 'Battery Warnings',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#EF4444',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Shared helper ────────────────────────────────────────────────────────────

async function scheduleNotification(
  content: Notifications.NotificationContentInput
): Promise<void> {
  if (isExpoGo) {
    // Log to console so you can verify logic works during Expo Go testing
    console.info(`[SolarGuard Notification] ${content.title}: ${content.body}`);
    return;
  }
  await Notifications.scheduleNotificationAsync({ content, trigger: null });
}

// ─── Notification helpers ─────────────────────────────────────────────────────

/**
 * Power cut detected — grid went offline.
 */
export async function sendPowerCutNotification(
  telemetry: TelemetryData
): Promise<void> {
  const soc = telemetry.batterySoc ?? 0;
  const load = telemetry.usePower ?? telemetry.dischargePower ?? 0;

  await scheduleNotification({
    title: '⚡ Power Cut Detected',
    body:
      `Your home is now running on battery backup.\n` +
      `Battery: ${soc}% · Load: ${load}W`,
    data: { type: 'POWER_CUT' },
    sound: true,
    color: '#EF4444',
    ...(Platform.OS === 'android' && { channelId: 'solarguard' }),
  });
}

/**
 * Grid power restored after an outage.
 */
export async function sendGridRestoredNotification(
  durationMs: number,
  soc: number
): Promise<void> {
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${minutes} minutes`;

  await scheduleNotification({
    title: '✅ Grid Power Restored',
    body: `Mains power is back. Outage lasted ${durationStr}.\nBattery remaining: ${soc}%`,
    data: { type: 'GRID_RESTORED', durationMs, soc },
    sound: true,
    color: '#10B981',
    ...(Platform.OS === 'android' && { channelId: 'solarguard' }),
  });
}

/**
 * Battery SoC fell to warning level during an outage.
 */
export async function sendBatteryLowNotification(
  soc: number,
  loadW: number
): Promise<void> {
  await scheduleNotification({
    title: '🔋 Battery Running Low',
    body: `Battery at ${soc}% — power cut ongoing. Load: ${loadW}W`,
    data: { type: 'BATTERY_LOW', soc, loadW },
    sound: true,
    color: '#F59E0B',
    ...(Platform.OS === 'android' && { channelId: 'solarguard_low' }),
  });
}

/**
 * Battery SoC is critically low.
 */
export async function sendBatteryCriticalNotification(soc: number): Promise<void> {
  await scheduleNotification({
    title: '🚨 Battery Critical',
    body: `Battery at ${soc}% — shutdown imminent if grid doesn't restore soon.`,
    data: { type: 'BATTERY_CRITICAL', soc },
    sound: true,
    color: '#EF4444',
    ...(Platform.OS === 'android' && { channelId: 'solarguard' }),
  });
}

// ─── Expo Go notice helper ────────────────────────────────────────────────────

/**
 * Returns true when running inside Expo Go (notifications unavailable).
 * Used by UI to show an informational banner.
 */
export function isRunningInExpoGo(): boolean {
  return isExpoGo;
}
