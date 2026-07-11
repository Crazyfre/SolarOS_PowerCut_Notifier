import {
  requestNotificationPermissions,
  sendPowerCutNotification,
  sendGridRestoredNotification,
  sendBatteryLowNotification,
  sendBatteryCriticalNotification,
  sendOverSolarLoadNotification,
  sendBatteryDischargingNotification,
  sendSolarMilestoneNotification,
  isRunningInExpoGo,
} from './notifications';

export const NotificationService = {
  requestPermissions: requestNotificationPermissions,
  sendPowerCut: sendPowerCutNotification,
  sendGridRestored: sendGridRestoredNotification,
  sendBatteryLow: sendBatteryLowNotification,
  sendBatteryCritical: sendBatteryCriticalNotification,
  sendOverSolarLoad: sendOverSolarLoadNotification,
  sendBatteryDischarging: sendBatteryDischargingNotification,
  sendSolarMilestone: sendSolarMilestoneNotification,
  isExpoGo: isRunningInExpoGo,
};
export type { NotificationPayload } from '../types/telemetry';
