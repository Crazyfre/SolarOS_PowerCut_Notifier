import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { TelemetryData, AppSettings } from '../types/telemetry';
import { DEFAULT_SETTINGS } from '../storage/settingsStore';

// ─── Expo Go guard ────────────────────────────────────────────────────────────
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

// ─── Permission & Channel Setup ───────────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  if (isExpoGo) {
    console.info(
      '[SolarGuard] Notifications are not available in Expo Go (SDK 53+). ' +
      'Use a development build for full notification support.'
    );
    return false;
  }

  if (Platform.OS === 'android') {
    // 1. Standard Alerts (High importance, system sound)
    await Notifications.setNotificationChannelAsync('solarguard', {
      name: 'SolarGuard Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F59E0B',
    });

    // 2. Battery Warnings (High importance, system sound)
    await Notifications.setNotificationChannelAsync('solarguard_low', {
      name: 'Battery Warnings',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#EF4444',
    });

    // 3. Silent Alerts (Default importance, system sound, no popup banner)
    await Notifications.setNotificationChannelAsync('solarguard_silent', {
      name: 'Silent Alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#F59E0B',
    });

    // 4. Power Cut Alarms (Max importance, custom alarm sound, popup banner)
    await Notifications.setNotificationChannelAsync('solarguard_alarm', {
      name: 'Power Cut Alarms',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lightColor: '#EF4444',
      sound: 'alarm.wav',
    });

    // 5. Silent Power Cut Alarms (Default importance, custom alarm sound, no popup)
    await Notifications.setNotificationChannelAsync('solarguard_silent_alarm', {
      name: 'Silent Power Cut Alarms',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#EF4444',
      sound: 'alarm.wav',
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
    console.info(`[SolarGuard Notification] ${content.title}: ${content.body}`);
    return;
  }
  await Notifications.scheduleNotificationAsync({ content, trigger: null });
}

// ─── Dynamic routing helper ──────────────────────────────────────────────────

interface RouteConfig {
  channelId: string;
  sound: string | boolean;
}

function getNotificationRouting(
  isCritical: boolean,
  settings: AppSettings
): RouteConfig {
  const useAlarm = isCritical && settings.useAlarmSound;
  const noPopup = settings.onlyAlarmNoPopup;

  if (useAlarm) {
    return {
      channelId: noPopup ? 'solarguard_silent_alarm' : 'solarguard_alarm',
      sound: 'alarm.wav',
    };
  }

  // Standard sound path
  return {
    channelId: noPopup ? 'solarguard_silent' : 'solarguard',
    sound: true,
  };
}

// ─── Notification triggers ────────────────────────────────────────────────────

export async function sendPowerCutNotification(
  telemetry: TelemetryData,
  settings: AppSettings = DEFAULT_SETTINGS
): Promise<void> {
  const soc = telemetry.batterySoc ?? 0;
  const load = telemetry.usePower ?? Math.abs(telemetry.batteryPower ?? 0);
  const routing = getNotificationRouting(true, settings);

  await scheduleNotification({
    title: '⚡ Power Cut Detected',
    body:
      `Your home is now running on battery backup.\n` +
      `Battery: ${soc}% · Load: ${load}W`,
    data: { type: 'POWER_CUT' },
    sound: routing.sound as any,
    color: '#EF4444',
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

export async function sendGridRestoredNotification(
  durationMs: number,
  soc: number,
  settings: AppSettings = DEFAULT_SETTINGS,
  socDrop: number = 0
): Promise<void> {
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${minutes}m`;
  const routing = getNotificationRouting(false, settings);

  await scheduleNotification({
    title: '⚡ Grid Restored',
    body: `Duration: ${durationStr}\nBattery used: ${socDrop}%`,
    data: { type: 'GRID_RESTORED', durationMs, soc },
    sound: routing.sound as any,
    color: '#10B981',
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

export async function sendBatteryLowNotification(
  soc: number,
  loadW: number,
  settings: AppSettings = DEFAULT_SETTINGS
): Promise<void> {
  const routing = getNotificationRouting(false, settings);
  const batteryCapacity = settings.batteryCapacity ?? 5.12;
  const capacityWh = batteryCapacity * 1000;
  const usableEnergyWh = capacityWh * (soc / 100);
  const actualLoad = loadW > 0 ? loadW : 100;
  const remainingHours = usableEnergyWh / actualLoad;
  const totalMins = Math.round(remainingHours * 60);
  
  const remainingStr = totalMins >= 60 
    ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` 
    : `${totalMins} minutes`;

  await scheduleNotification({
    title: '⚠️ Battery Low',
    body: `Battery: ${soc}%\nEstimated backup: ${remainingStr}\nCurrent load: ${loadW}W`,
    data: { type: 'BATTERY_LOW', soc, loadW },
    sound: routing.sound as any,
    color: '#F59E0B',
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

export async function sendBatteryCriticalNotification(
  soc: number,
  settings: AppSettings = DEFAULT_SETTINGS
): Promise<void> {
  const routing = getNotificationRouting(true, settings);

  await scheduleNotification({
    title: '🚨 Battery Critical',
    body: `Battery at ${soc}% — shutdown imminent if grid doesn't restore soon.`,
    data: { type: 'BATTERY_CRITICAL', soc },
    sound: routing.sound as any,
    color: '#EF4444',
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

export async function sendSolarMilestoneNotification(
  generationKwh: number,
  settings: AppSettings = DEFAULT_SETTINGS
): Promise<void> {
  const routing = getNotificationRouting(false, settings);

  await scheduleNotification({
    title: '☀️ Great Day!',
    body: `Today's generation: ${generationKwh.toFixed(1)}kWh`,
    data: { type: 'SOLAR_MILESTONE', generationKwh },
    sound: routing.sound as any,
    color: '#F59E0B',
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

// ─── Extra custom alerts ──────────────────────────────────────────────────────

export async function sendOverSolarLoadNotification(
  loadW: number,
  pvPowerW: number,
  settings: AppSettings = DEFAULT_SETTINGS
): Promise<void> {
  const routing = getNotificationRouting(false, settings);

  await scheduleNotification({
    title: '⚠️ Load Exceeds Solar Output',
    body: `House consumption (${loadW}W) is higher than Solar Generation (${pvPowerW}W). Drawing remaining power from battery/grid.`,
    data: { type: 'OVER_SOLAR_LOAD', loadW, pvPowerW },
    sound: routing.sound as any,
    color: '#F59E0B',
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

export async function sendBatteryDischargingNotification(
  loadW: number,
  settings: AppSettings = DEFAULT_SETTINGS
): Promise<void> {
  const routing = getNotificationRouting(false, settings);

  await scheduleNotification({
    title: '🔋 System Discharging Battery',
    body: `Your battery is currently discharging to power your home load of ${loadW}W.`,
    data: { type: 'BATTERY_DISCHARGE', loadW },
    sound: routing.sound as any,
    color: '#F59E0B',
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

// ─── Expo Go notice helper ────────────────────────────────────────────────────

export function isRunningInExpoGo(): boolean {
  return isExpoGo;
}
