import { requireOptionalNativeModule } from 'expo';

export interface OutageAlarmOptions {
  reason: string;
  sound: string;
  duration: number;
  triggerTime?: number;
}

interface OutageAlarmModuleType {
  triggerAlarm(options: OutageAlarmOptions): void;
  stopAlarm(): void;
  isAlarmPlaying(): boolean;
  isIgnoringBatteryOptimizations(): boolean;
  /** Stable OS boot counter; empty when unavailable. */
  getBootId(): string;
}

const nativeModule = requireOptionalNativeModule<OutageAlarmModuleType>('OutageAlarm');
const unavailable = (): never => { throw new Error('Native alarms require an Android development or release build.'); };
const OutageAlarm: OutageAlarmModuleType = nativeModule ?? {
  triggerAlarm: unavailable,
  stopAlarm: () => {},
  isAlarmPlaying: () => false,
  isIgnoringBatteryOptimizations: unavailable,
  getBootId: () => '',
};
export default OutageAlarm;
