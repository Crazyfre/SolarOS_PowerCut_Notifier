import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { TelemetryData, AppSettings } from '../types/telemetry';
import { DEFAULT_SETTINGS } from '../storage/settingsStore';
import { serviceColors } from '../theme';
import OutageAlarm from '../../modules/outage-alarm';

export const ALARM_SOUND_OPTIONS = [
  { id: 'alarm' as const, name: 'Classic Siren', file: 'alarm.wav' },
  { id: 'siren' as const, name: 'Emergency Warble', file: 'siren.wav' },
  { id: 'digital_beep' as const, name: 'Digital Alert Beeps', file: 'digital_beep.wav' },
  { id: 'chime' as const, name: 'Gentle Chime', file: 'chime.wav' },
];

// â”€â”€â”€ Expo Go guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Permission & Channel Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function registerNotificationChannels(): Promise<void> {
  if (isExpoGo) return;

  if (Platform.OS === 'android') {
    // 1. Standard Alerts (High importance, system sound)
    await Notifications.setNotificationChannelAsync('solarguard', {
      name: 'SolarGuard Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: serviceColors.brand,
    });

    // 2. Battery Warnings (High importance, system sound)
    await Notifications.setNotificationChannelAsync('solarguard_low', {
      name: 'Battery Warnings',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: serviceColors.danger,
    });

    // 3. Silent Alerts (Default importance, system sound, no popup banner)
    await Notifications.setNotificationChannelAsync('solarguard_silent', {
      name: 'Silent Alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: serviceColors.brand,
    });

    // 4. Power Cut Alarms (Default/legacy channel, custom alarm sound)
    await Notifications.setNotificationChannelAsync('solarguard_alarm_v2', {
      name: 'Power Cut Alarms (Default)',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lightColor: serviceColors.danger,
      sound: 'alarm.wav',
    });

    // 5. Silent Power Cut Alarms (Default/legacy channel, custom alarm sound, no popup)
    await Notifications.setNotificationChannelAsync('solarguard_silent_alarm_v2', {
      name: 'Silent Power Cut Alarms (Default)',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: serviceColors.danger,
      sound: 'alarm.wav',
    });

    // 6. Register specific channels for each customizable alarm sound
    for (const option of ALARM_SOUND_OPTIONS) {
      // Standard channel (Max importance, alert banner popup)
      await Notifications.setNotificationChannelAsync(`sg_alarm_v2_${option.id}`, {
        name: `Power Cut Alarm (${option.name})`,
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        lightColor: serviceColors.danger,
        sound: option.file, // Android resource name WITH extension
      });

      // Silent/No-Popup channel (Default importance, keeps sound)
      await Notifications.setNotificationChannelAsync(`sg_silent_alarm_v2_${option.id}`, {
        name: `Silent Alarm (${option.name})`,
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: serviceColors.danger,
        sound: option.file,
      });
    }
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  await registerNotificationChannels();

  if (isExpoGo) {
    console.info(
      '[SolarGuard] Notifications are not available in Expo Go (SDK 53+). ' +
      'Use a development build for full notification support.'
    );
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// â”€â”€â”€ Shared helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function scheduleNotification(
  content: Notifications.NotificationContentInput
): Promise<string | undefined> {
  if (isExpoGo) {
    console.info(`[SolarGuard Notification] ${content.title}: ${content.body}`);
    return undefined;
  }
  return await Notifications.scheduleNotificationAsync({ content, trigger: null });
}

// â”€â”€â”€ Sound Options & Dynamic routing helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RouteConfig {
  channelId: string;
  sound: string | boolean;
  /** whether the native siren (OutageAlarm) may be triggered */
  allowSiren: boolean;
}

/**
 * Context for an outgoing alert. `remote: true` = device is outside the home
 * zone: sirens are suppressed, standard notification sound only.
 */
export interface AlertContext {
  remote?: boolean;
}

function getNotificationRouting(
  isCritical: boolean,
  settings: AppSettings,
  context: AlertContext = {}
): RouteConfig {
  const remote = context.remote === true;
  const useAlarm = isCritical && settings.useAlarmSound && !remote;
  const noPopup = settings.onlyAlarmNoPopup;
  const soundId = settings.alarmSoundName ?? 'alarm';

  if (useAlarm) {
    const option = ALARM_SOUND_OPTIONS.find(o => o.id === soundId) ?? ALARM_SOUND_OPTIONS[0];
    return {
      channelId: noPopup ? `sg_silent_alarm_v2_${soundId}` : `sg_alarm_v2_${soundId}`,
      sound: Platform.OS === 'ios' ? option.file : true,
      allowSiren: true,
    };
  }

  // Standard sound path. Remote (outside-zone) critical alerts intentionally
  // land here too: system notification sound, never the siren.
  return {
    channelId: noPopup ? 'solarguard_silent' : 'solarguard',
    sound: true,
    allowSiren: !remote,
  };
}

// â”€â”€â”€ Notification triggers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function sendPowerCutNotification(
  telemetry: TelemetryData,
  settings: AppSettings = DEFAULT_SETTINGS,
  context: AlertContext = {}
): Promise<void> {
  const soc = telemetry.batterySoc ?? 0;
  const load = telemetry.usePower ?? Math.abs(telemetry.batteryPower ?? 0);
  const routing = getNotificationRouting(true, settings, context);

  const id = await scheduleNotification({
    title: 'Power Cut Detected',
    body:
      `Your home is now running on battery backup.\n` +
      `Battery: ${soc}% Â· Load: ${load}W`,
    data: { type: 'POWER_CUT', remote: context.remote === true },
    sound: routing.sound as any,
    color: serviceColors.danger,
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });

  if (Platform.OS === 'android' && routing.allowSiren && settings.useAlarmSound) {
    try {
      const soundId = settings.alarmSoundName ?? 'alarm';
      OutageAlarm.triggerAlarm({
        reason: 'POWER_CUT',
        sound: soundId,
        duration: settings.alarmDurationSeconds,
        triggerTime: Date.now(),
      });
    } catch (err) {
      console.warn('Failed to trigger native alarm:', err);
    }
  }
}

export async function sendGridRestoredNotification(
  durationMs: number,
  soc: number,
  settings: AppSettings = DEFAULT_SETTINGS,
  socDrop: number = 0,
  context: AlertContext = {}
): Promise<void> {
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${minutes}m`;
  const routing = getNotificationRouting(false, settings);

  if (Platform.OS === 'android') {
    try {
      // Always silence any running siren when grid restores.
      OutageAlarm.stopAlarm();
      if (routing.allowSiren && settings.useAlarmSound) {
        OutageAlarm.triggerAlarm({
          reason: 'GRID_RESTORED',
          sound: 'chime',
          duration: 5,
          triggerTime: Date.now(),
        });
      }
    } catch (err) {
      console.warn('Failed to stop/trigger native alarm:', err);
    }
  }

  await scheduleNotification({
    title: 'Grid Restored',
    body: `Duration: ${durationStr}\nBattery used: ${socDrop}%`,
    data: { type: 'GRID_RESTORED', durationMs, soc },
    sound: routing.sound as any,
    color: serviceColors.success,
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

export async function sendBatteryLowNotification(
  soc: number,
  loadW: number,
  settings: AppSettings = DEFAULT_SETTINGS,
  context: AlertContext = {}
): Promise<void> {
  const routing = getNotificationRouting(false, settings, context);
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
    title: 'Battery Low',
    body: `Battery: ${soc}%\nEstimated backup: ${remainingStr}\nCurrent load: ${loadW}W`,
    data: { type: 'BATTERY_LOW', soc, loadW },
    sound: routing.sound as any,
    color: serviceColors.brand,
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

export async function sendBatteryCriticalNotification(
  soc: number,
  settings: AppSettings = DEFAULT_SETTINGS,
  context: AlertContext = {}
): Promise<void> {
  const routing = getNotificationRouting(true, settings, context);

  const id = await scheduleNotification({
    title: 'Battery Critical',
    body: `Battery at ${soc}% â€” shutdown imminent if grid doesn't restore soon.`,
    data: { type: 'BATTERY_CRITICAL', soc, remote: context.remote === true },
    sound: routing.sound as any,
    color: serviceColors.danger,
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });

  if (Platform.OS === 'android' && routing.allowSiren && settings.useAlarmSound) {
    try {
      const soundId = settings.alarmSoundName ?? 'alarm';
      OutageAlarm.triggerAlarm({
        reason: 'BATTERY_CRITICAL',
        sound: soundId,
        duration: settings.alarmDurationSeconds,
        triggerTime: Date.now(),
      });
    } catch (err) {
      console.warn('Failed to trigger native alarm:', err);
    }
  }
}

export async function sendSolarMilestoneNotification(
  generationKwh: number,
  settings: AppSettings = DEFAULT_SETTINGS
): Promise<void> {
  const routing = getNotificationRouting(false, settings);

  await scheduleNotification({
    title: 'Great Day!',
    body: `Today's generation: ${generationKwh.toFixed(1)}kWh`,
    data: { type: 'SOLAR_MILESTONE', generationKwh },
    sound: routing.sound as any,
    color: serviceColors.brand,
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

// â”€â”€â”€ Extra custom alerts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function sendOverSolarLoadNotification(
  loadW: number,
  pvPowerW: number,
  settings: AppSettings = DEFAULT_SETTINGS,
  context: AlertContext = {}
): Promise<void> {
  const routing = getNotificationRouting(false, settings, context);

  await scheduleNotification({
    title: 'Load Exceeds Solar Output',
    body: `House consumption (${loadW}W) is higher than Solar Generation (${pvPowerW}W). Drawing remaining power from battery/grid.`,
    data: { type: 'OVER_SOLAR_LOAD', loadW, pvPowerW },
    sound: routing.sound as any,
    color: serviceColors.brand,
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

export async function sendBatteryDischargingNotification(
  loadW: number,
  settings: AppSettings = DEFAULT_SETTINGS,
  context: AlertContext = {}
): Promise<void> {
  const routing = getNotificationRouting(false, settings, context);

  await scheduleNotification({
    title: 'System Discharging Battery',
    body: `Your battery is currently discharging to power your home load of ${loadW}W.`,
    data: { type: 'BATTERY_DISCHARGE', loadW },
    sound: routing.sound as any,
    color: serviceColors.brand,
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });
}

export async function sendTestNotification(
  settings: AppSettings = DEFAULT_SETTINGS,
  context: AlertContext = {}
): Promise<void> {
  const routing = getNotificationRouting(true, settings, context);

  const id = await scheduleNotification({
    title: 'Outage Alarm Test',
    body: 'SolarGuard alarm sound test is working successfully!',
    data: { type: 'ALARM_TEST' },
    sound: routing.sound as any,
    color: serviceColors.danger,
    ...(Platform.OS === 'android' && { channelId: routing.channelId }),
  });

  if (Platform.OS === 'android' && routing.allowSiren && settings.useAlarmSound) {
    try {
      const soundId = settings.alarmSoundName ?? 'alarm';
      OutageAlarm.triggerAlarm({
        reason: 'ALARM_TEST',
        sound: soundId,
        duration: settings.alarmDurationSeconds,
        triggerTime: Date.now(),
      });
    } catch (err) {
      console.warn('Failed to trigger native alarm:', err);
    }
  }
}

// â”€â”€â”€ Expo Go notice helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function isRunningInExpoGo(): boolean {
  return isExpoGo;
}
