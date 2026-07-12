import { requireNativeModule } from 'expo';

interface OutageAlarmModuleType {
  triggerAlarm(soundName: string, durationSeconds: number): void;
  stopAlarm(): void;
  isAlarmPlaying(): boolean;
}

const OutageAlarm = requireNativeModule<OutageAlarmModuleType>('OutageAlarm');
export default OutageAlarm;
