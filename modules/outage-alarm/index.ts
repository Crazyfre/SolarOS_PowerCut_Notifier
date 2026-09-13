import { requireNativeModule } from 'expo';

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
  /** Stable per-boot identifier (wallClock - elapsedRealtime). */
  getBootId(): string;
}

const OutageAlarm = requireNativeModule<OutageAlarmModuleType>('OutageAlarm');
export default OutageAlarm;
