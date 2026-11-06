import { NativeModules, Platform } from 'react-native';
import type notifeeApi from '@notifee/react-native';

type MonitoringApi = Pick<typeof notifeeApi,
  'registerForegroundService' | 'createChannel' | 'requestPermission' | 'displayNotification' | 'stopForegroundService'>;

// Importing Notifee itself throws when its native module is absent (Expo Go,
// web, or an older dev build). Keep the rest of the app usable in that case.
const native = Platform.OS === 'android' && NativeModules?.NotifeeApiModule
  ? require('@notifee/react-native') as typeof import('@notifee/react-native')
  : null;

const unavailable = async (): Promise<never> => {
  throw new Error('Background monitoring requires an Android development or release build.');
};
const notifee: MonitoringApi = native?.default ?? {
  registerForegroundService: () => {},
  createChannel: unavailable,
  requestPermission: unavailable,
  displayNotification: unavailable,
  stopForegroundService: async () => {},
};

export const AndroidImportance = native?.AndroidImportance ?? { DEFAULT: 3 };
export const AndroidForegroundServiceType = native?.AndroidForegroundServiceType ?? {
  FOREGROUND_SERVICE_TYPE_DATA_SYNC: 1,
  FOREGROUND_SERVICE_TYPE_LOCATION: 8,
};
export default notifee;
