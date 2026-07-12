import { requireNativeModule } from 'expo';

export interface OutageAlarmOptions {
  reason: string;
  sound: string;
  duration: number;
}

interface OutageAlarmModuleType {
  triggerAlarm(options: OutageAlarmOptions): void;
  stopAlarm(): void;
  isAlarmPlaying(): boolean;
}

const OutageAlarm = requireNativeModule<OutageAlarmModuleType>('OutageAlarm');
export default OutageAlarm;
