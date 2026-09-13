import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Linking,
  AppState,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, Typography, Spacing, PAGE_GUTTER } from '../theme';
import { useApp } from '../context/AppContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { StationService, SolarStation } from '../services/stationService';
import { DevOverridesStore } from '../storage/devOverridesStore';
import { sendTestNotification, ALARM_SOUND_OPTIONS, requestNotificationPermissions } from '../services/notifications';
import OutageAlarm from '../../modules/outage-alarm';
import { ForegroundServiceManager } from '../services/foregroundService';
import {
  ScreenHeader,
  HeaderAction,
  SectionHeader,
  Card,
  SettingRow,
  RowDivider,
  AppSwitch,
  SegmentedControl,
  Badge,
  Button,
  Input,
  StatusDot,
} from '../components/ui';
import {
  ArrowLeft,
  BellRing,
  Bell,
  Battery,
  MoonStar,
  MapPinned,
  CodeXml,
  LogOut,
  House,
  Building2,
  Zap,
  PlugZap,
  CircleOff,
  BatteryCharging,
  Pause,
  ChevronRight,
  MapPin,
  Crosshair,
} from 'lucide-react-native';
import {
  DEFAULT_ZONE_RADIUS_METERS,
  MIN_ZONE_RADIUS_METERS,
  MAX_ZONE_RADIUS_METERS,
  requestForegroundLocationPermission,
  requestBackgroundLocationPermission,
  getLocationPermissions,
  getCurrentLocation,
  normalizeZone,
  registerGeofence,
  unregisterGeofence,
  isGeofenceRegistered,
  armRemotePolling,
  disarmRemotePolling,
} from '../services/geofenceService';
import { GeofenceStore } from '../storage/geofenceStore';
import type { MonitoringMode, HomeZone } from '../types/telemetry';

type RootStackParamList = {
  Dashboard: undefined;
  Settings: undefined;
  About: undefined;
};

type NavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;

export function SettingsScreen() {
  const { settings, updateSettings, logout, refreshTelemetry } = useApp();
  const { colors } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  // Permissions State
  const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean | null>(null);
  const [isBatteryOptimizationBypassed, setIsBatteryOptimizationBypassed] = useState<boolean | null>(null);

  // Developer overrides state
  const [devOverridesEnabled, setDevOverridesEnabled] = useState(false);
  const [devGridRelayStatus, setDevGridRelayStatus] = useState<'on' | 'off'>('on');
  const [devBatteryStatus, setDevBatteryStatus] = useState<string>('CHARGE');
  const [devBatterySoc, setDevBatterySoc] = useState('100');
  const [devBatteryPower, setDevBatteryPower] = useState('0');
  const [devPvPower, setDevPvPower] = useState('0');
  const [devUsePower, setDevUsePower] = useState('0');
  const [devScheduledPowerCutSeconds, setDevScheduledPowerCutSeconds] = useState('0');
  const [devScheduledPowerOnSeconds, setDevScheduledPowerOnSeconds] = useState('0');

  const [useAlarmSound, setUseAlarmSound] = useState(settings.useAlarmSound);
  const [alarmDuration, setAlarmDuration] = useState(settings.alarmDurationSeconds);
  const [onlyAlarmNoPopup, setOnlyAlarmNoPopup] = useState(settings.onlyAlarmNoPopup);
  const [alarmSoundName, setAlarmSoundName] = useState(settings.alarmSoundName ?? 'alarm');

  const [alertOnPowerCut, setAlertOnPowerCut] = useState(settings.alertOnPowerCut);
  const [alertOnGridOffOnly, setAlertOnGridOffOnly] = useState(settings.alertOnGridOffOnly);
  const [alertOnBatteryDischarge, setAlertOnBatteryDischarge] = useState(settings.alertOnBatteryDischarge);
  const [alertOnOverSolarLoad, setAlertOnOverSolarLoad] = useState(settings.alertOnOverSolarLoad);

  const [alertOnBatteryPercent, setAlertOnBatteryPercent] = useState(settings.alertOnBatteryPercent);
  const [batteryWarningThreshold, setBatteryWarningThreshold] = useState(
    String(settings.batteryWarningThreshold)
  );

  // V2 State variables
  const [batteryCapacity, setBatteryCapacity] = useState(String(settings.batteryCapacity ?? 5.12));
  const [refreshInterval, setRefreshInterval] = useState(settings.refreshIntervalMinutes ?? 5);
  const [amoledTheme, setAmoledTheme] = useState(settings.amoledTheme ?? false);
  const [tariffImportRate, setTariffImportRate] = useState(String(settings.tariffImportRate ?? 7.50));
  const [tariffExportRate, setTariffExportRate] = useState(String(settings.tariffExportRate ?? 5.00));
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(settings.quietHoursEnabled ?? false);
  const [quietHoursStart, setQuietHoursStart] = useState(settings.quietHoursStart ?? '23:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState(settings.quietHoursEnd ?? '07:00');
  const [foregroundServiceEnabled, setForegroundServiceEnabled] = useState(settings.foregroundServiceEnabled ?? false);

  // Location-aware monitoring state (V3)
  const [monitoringMode, setMonitoringMode] = useState<MonitoringMode>(settings.monitoringMode ?? 'always');
  const [homeZone, setHomeZone] = useState<HomeZone | null>(settings.homeZone ?? null);
  const [zoneLat, setZoneLat] = useState(settings.homeZone ? String(settings.homeZone.lat) : '');
  const [zoneLng, setZoneLng] = useState(settings.homeZone ? String(settings.homeZone.lng) : '');
  const [zoneRadius, setZoneRadius] = useState(String(settings.homeZone?.radiusMeters ?? DEFAULT_ZONE_RADIUS_METERS));
  const [locationPermissions, setLocationPermissions] = useState<{ foreground: boolean; background: boolean }>({ foreground: false, background: false });
  const [geofenceRegistered, setGeofenceRegistered] = useState(false);
  const [zoneStatus, setZoneStatus] = useState<string>('');

  // Developer features visibility & diagnostics state
  const isFocused = useIsFocused();
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [fsState, setFsState] = useState('Unknown');
  const [fsLastResult, setFsLastResult] = useState('Unknown');
  const [fsLastPoll, setFsLastPoll] = useState('');
  const [fsNextPoll, setFsNextPoll] = useState('');

  useEffect(() => {
    if (isFocused) {
      (async () => {
        const unlocked = await AsyncStorage.getItem('sg_dev_options_unlocked') === 'true';
        setDevUnlocked(unlocked);

        if (unlocked) {
          const state = await AsyncStorage.getItem('sg_fs_state') ?? 'Waiting for Next Poll';
          const lastResult = await AsyncStorage.getItem('sg_fs_last_result') ?? 'Success';
          const lastPoll = await AsyncStorage.getItem('sg_fs_last_poll');
          const nextPoll = await AsyncStorage.getItem('sg_fs_next_poll');

          setFsState(state);
          setFsLastResult(lastResult);

          if (lastPoll) {
            setFsLastPoll(new Date(parseInt(lastPoll, 10)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          } else {
            setFsLastPoll('Never');
          }

          if (nextPoll) {
            setFsNextPoll(new Date(parseInt(nextPoll, 10)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          } else {
            setFsNextPoll('Never');
          }
        }
      })();
    }
  }, [isFocused]);

  // Stations List state
  const [stations, setStations] = useState<SolarStation[]>([]);
  const [activeStationId, setActiveStationId] = useState<string | null>(settings.activeStationId ?? null);
  const [isLoadingStations, setIsLoadingStations] = useState(false);

  useEffect(() => {
    (async () => {
      setIsLoadingStations(true);
      try {
        const list = await StationService.getStations();
        setStations(list);

        // If there is no active station select the first one
        if (!activeStationId && list.length > 0) {
          setActiveStationId(list[0].id);
        }
      } catch (err) {
        console.warn('Failed to load stations:', err);
      } finally {
        setIsLoadingStations(false);
      }

      // Load developer overrides
      try {
        const overrides = await DevOverridesStore.getOverrides();
        setDevOverridesEnabled(overrides.enabled);
        setDevGridRelayStatus(overrides.gridRelayStatus ?? 'on');
        setDevBatteryStatus(overrides.batteryStatus ?? 'CHARGE');
        setDevBatterySoc(String(overrides.batterySoc ?? 100));
        setDevBatteryPower(String(overrides.batteryPower ?? 0));
        setDevPvPower(String(overrides.pvPower ?? 0));
        setDevUsePower(String(overrides.usePower ?? 0));

        const cutTime = overrides.scheduledPowerCutTime ?? 0;
        const onTime = overrides.scheduledPowerOnTime ?? 0;
        const now = Date.now();
        setDevScheduledPowerCutSeconds(cutTime > now ? String(Math.round((cutTime - now) / 1000)) : '0');
        setDevScheduledPowerOnSeconds(onTime > now ? String(Math.round((onTime - now) / 1000)) : '0');
      } catch (err) {
        console.warn('Failed to load developer overrides:', err);
      }

      // Check notification permissions
      try {
        const { status } = await Notifications.getPermissionsAsync();
        setHasNotificationPermission(status === 'granted');
      } catch (err) {
        console.warn('Failed to check notification permissions:', err);
      }

      // Check battery optimization status
      try {
        if (Platform.OS === 'android') {
          const ignored = OutageAlarm.isIgnoringBatteryOptimizations();
          setIsBatteryOptimizationBypassed(ignored);
        } else {
          setIsBatteryOptimizationBypassed(true);
        }
      } catch (err) {
        console.warn('Failed to check battery optimization status:', err);
      }

      // Location-aware monitoring state
      try {
        const perms = await getLocationPermissions();
        setLocationPermissions(perms);
        setGeofenceRegistered(await isGeofenceRegistered());
        const geoState = await GeofenceStore.getState();
        if (geoState.inside === true) setZoneStatus('Inside home zone');
        else if (geoState.inside === false) setZoneStatus('Outside home zone');
        else setZoneStatus('No transition seen yet');
      } catch (err) {
        console.warn('Failed to load geofence state:', err);
      }
    })();
  }, []);

  // Re-check permissions and battery optimization status when app returns from background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        Notifications.getPermissionsAsync().then(({ status }) => {
          setHasNotificationPermission(status === 'granted');
        }).catch(() => {});

        if (Platform.OS === 'android') {
          try {
            const ignored = OutageAlarm.isIgnoringBatteryOptimizations();
            setIsBatteryOptimizationBypassed(ignored);
          } catch (err) {}
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // â”€â”€â”€ Save settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleSave = async () => {
    const thresholdNum = parseInt(batteryWarningThreshold, 10);
    if (isNaN(thresholdNum) || thresholdNum < 10 || thresholdNum > 50) {
      Alert.alert('Invalid Input', 'Battery Warning Threshold must be between 10% and 50%.');
      return;
    }

    const capacityNum = parseFloat(batteryCapacity);
    if (isNaN(capacityNum) || capacityNum <= 0) {
      Alert.alert('Invalid Input', 'Battery capacity must be a positive number.');
      return;
    }

    const importRateNum = parseFloat(tariffImportRate);
    if (isNaN(importRateNum) || importRateNum < 0) {
      Alert.alert('Invalid Input', 'Import tariff must be a non-negative number.');
      return;
    }

    const exportRateNum = parseFloat(tariffExportRate);
    if (isNaN(exportRateNum) || exportRateNum < 0) {
      Alert.alert('Invalid Input', 'Export tariff must be a non-negative number.');
      return;
    }

    // Resolve the home zone to persist (null when unset or invalid)
    let zone: HomeZone | null = null;
    if (zoneLat.trim() && zoneLng.trim()) {
      const latNum = parseFloat(zoneLat);
      const lngNum = parseFloat(zoneLng);
      const radiusNum = parseInt(zoneRadius, 10) || DEFAULT_ZONE_RADIUS_METERS;
      zone = normalizeZone(latNum, lngNum, radiusNum);
      if (!zone) {
        Alert.alert('Invalid Input', 'Home zone coordinates are invalid.');
        return;
      }
      setHomeZone(zone);
      setZoneRadius(String(zone.radiusMeters));
    }

    // Validate home zone when geofenced mode is selected
    if (monitoringMode === 'geofenced') {
      const latNum = parseFloat(zoneLat);
      const lngNum = parseFloat(zoneLng);
      const radiusNum = parseInt(zoneRadius, 10);
      if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
        Alert.alert('Invalid Input', 'Home zone coordinates must be valid latitude/longitude values.');
        return;
      }
      if (isNaN(radiusNum) || radiusNum < MIN_ZONE_RADIUS_METERS || radiusNum > MAX_ZONE_RADIUS_METERS) {
        Alert.alert('Invalid Input', `Zone radius must be between ${MIN_ZONE_RADIUS_METERS} and ${MAX_ZONE_RADIUS_METERS} meters.`);
        return;
      }
    }

    const updated = {
      alarmDurationSeconds: alarmDuration,
      useAlarmSound,
      onlyAlarmNoPopup,
      alarmSoundName,
      alertOnPowerCut,
      alertOnGridOffOnly,
      alertOnBatteryDischarge,
      alertOnOverSolarLoad,
      alertOnBatteryPercent,
      batteryWarningThreshold: thresholdNum,
      batteryCapacity: capacityNum,
      activeStationId,
      refreshIntervalMinutes: refreshInterval,
      quietHoursStart,
      quietHoursEnd,
      quietHoursEnabled,
      amoledTheme,
      foregroundServiceEnabled,
      monitoringMode,
      homeZone: zone,
      tariffImportRate: importRateNum,
      tariffExportRate: exportRateNum,
    };

    if (activeStationId) {
      const selectedStation = stations.find(s => s.id === activeStationId);
      if (selectedStation) {
        await StationService.setActiveStation(selectedStation);
      }
    }

    await updateSettings(updated);

    // Save developer overrides
    const socVal = parseInt(devBatterySoc, 10);
    const powerVal = parseInt(devBatteryPower, 10);
    const pvVal = parseInt(devPvPower, 10);
    const useVal = parseInt(devUsePower, 10);

    const cutSecs = parseInt(devScheduledPowerCutSeconds, 10);
    const onSecs = parseInt(devScheduledPowerOnSeconds, 10);
    const now = Date.now();

    const overrides = {
      enabled: devOverridesEnabled,
      gridRelayStatus: devGridRelayStatus,
      batterySoc: isNaN(socVal) ? 100 : socVal,
      batteryStatus: devBatteryStatus,
      batteryPower: isNaN(powerVal) ? 0 : powerVal,
      pvPower: isNaN(pvVal) ? 0 : pvVal,
      usePower: isNaN(useVal) ? 0 : useVal,
      scheduledPowerCutTime: (!isNaN(cutSecs) && cutSecs > 0) ? (now + cutSecs * 1000) : undefined,
      scheduledPowerOnTime: (!isNaN(onSecs) && onSecs > 0) ? (now + onSecs * 1000) : undefined,
    };

    await DevOverridesStore.saveOverrides(overrides);

    // Arm/disarm the native geofence to match the saved configuration
    try {
      if (monitoringMode === 'geofenced' && zone) {
        await registerGeofence(zone);
        await armRemotePolling();
      } else {
        await unregisterGeofence();
        await disarmRemotePolling();
      }
      setGeofenceRegistered(await isGeofenceRegistered());
    } catch (err) {
      console.warn('Failed to sync geofence registration:', err);
    }

    // Trigger immediate refresh in the background so telemetry changes are applied & alerts run
    refreshTelemetry().catch(() => {});

    Alert.alert('Success', 'Settings saved successfully!', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  // â”€â”€â”€ Logout handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out from SolarGuard?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const switchA11y = (label: string) => ({ accessibilityLabel: label });

  const stationIcon = (name: string) => {
    const color = colors.textSecondary;
    if (name.includes('Home')) return <House size={16} color={color} strokeWidth={2} />;
    if (name.includes('Office')) return <Building2 size={16} color={color} strokeWidth={2} />;
    return <Zap size={16} color={color} strokeWidth={2} />;
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Settings"
        left={
          <HeaderAction
            onPress={() => navigation.goBack()}
            icon={<ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2} />}
            accessibilityLabel="Go back"
          />
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ALARM SYSTEM CONFIG */}
        <View style={styles.section}>
          <SectionHeader title="Alarm & Sound" icon={<BellRing size={14} color={colors.textSecondary} strokeWidth={2} />} />
          <Card>
            <SettingRow title="Custom Alarm Siren" subtitle="Use high-pitch pulsing siren tone">
              <AppSwitch value={useAlarmSound} onValueChange={setUseAlarmSound} {...switchA11y('Custom alarm siren')} />
            </SettingRow>
            <RowDivider />
            <SettingRow title="Only Alarm, No Popup" subtitle="Trigger sound without on-screen banner">
              <AppSwitch value={onlyAlarmNoPopup} onValueChange={setOnlyAlarmNoPopup} {...switchA11y('Only alarm no popup')} />
            </SettingRow>
            <RowDivider />
            <SettingRow title="Alarm Ring Duration">
              <Text style={[styles.inlineValue, { color: colors.brandBright }]}>{alarmDuration}s</Text>
            </SettingRow>
            <SegmentedControl
              options={[5, 10, 15, 30].map(s => ({ value: s, label: `${s}s` }))}
              value={alarmDuration}
              onChange={setAlarmDuration}
            />
            {useAlarmSound ? (
              <>
                <RowDivider />
                <SettingRow title="Alarm Tone">
                  <Text style={[styles.inlineValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    {ALARM_SOUND_OPTIONS.find(o => o.id === alarmSoundName)?.name ?? 'â€”'}
                  </Text>
                </SettingRow>
                <SegmentedControl
                  options={ALARM_SOUND_OPTIONS.map(o => ({ value: o.id as typeof alarmSoundName, label: o.name }))}
                  value={alarmSoundName}
                  onChange={setAlarmSoundName}
                />
              </>
            ) : null}
          </Card>
        </View>

        {/* ALERT FILTERS */}
        <View style={styles.section}>
          <SectionHeader title="Alert Filters" icon={<Bell size={14} color={colors.textSecondary} strokeWidth={2} />} />
          <Card>
            <SettingRow title="Grid Outages & Restores" subtitle="Alert instantly on power cuts">
              <AppSwitch value={alertOnPowerCut} onValueChange={setAlertOnPowerCut} {...switchA11y('Grid outage alerts')} />
            </SettingRow>
            <RowDivider />
            <SettingRow title="Grid Off Alerts Only" subtitle="Alarm only when grid goes offline">
              <AppSwitch value={alertOnGridOffOnly} onValueChange={setAlertOnGridOffOnly} {...switchA11y('Grid off only')} />
            </SettingRow>
            <RowDivider />
            <SettingRow title="Battery Discharging" subtitle="Alert when grid is on but using battery">
              <AppSwitch value={alertOnBatteryDischarge} onValueChange={setAlertOnBatteryDischarge} {...switchA11y('Battery discharging alerts')} />
            </SettingRow>
            <RowDivider />
            <SettingRow title="Load Exceeds Solar" subtitle="Alert when drawing remainder power">
              <AppSwitch value={alertOnOverSolarLoad} onValueChange={setAlertOnOverSolarLoad} {...switchA11y('Load exceeds solar alerts')} />
            </SettingRow>
            <RowDivider />
            <SettingRow title="Battery Warning Threshold" subtitle="Alert when SoC drops below %">
              <AppSwitch value={alertOnBatteryPercent} onValueChange={setAlertOnBatteryPercent} {...switchA11y('Battery warning threshold alerts')} />
            </SettingRow>
            {alertOnBatteryPercent ? (
              <View style={styles.thresholdRow}>
                <Text style={[styles.thresholdLabel, { color: colors.textSecondary }]}>Trigger at (%)</Text>
                <Input
                  value={batteryWarningThreshold}
                  onChangeText={setBatteryWarningThreshold}
                  keyboardType="numeric"
                  maxLength={2}
                  compactWidth={64}
                  accessibilityLabel="Battery warning threshold percent"
                />
              </View>
            ) : null}
          </Card>
        </View>

        {/* SYSTEM PERMISSIONS & BACKGROUND */}
        <View style={styles.section}>
          <SectionHeader title="Permissions & Background" icon={<Battery size={14} color={colors.textSecondary} strokeWidth={2} />} />
          <Card>
            <SettingRow
              title="Notification & Alarm Sound"
              subtitle={
                hasNotificationPermission === true
                  ? 'Permissions are granted'
                  : 'Required to play sirens and alert banners'
              }
            >
              {hasNotificationPermission === true ? (
                <Badge label="Granted" tone="success" />
              ) : (
                <Button
                  label="Enable"
                  size="sm"
                  onPress={async () => {
                    const granted = await requestNotificationPermissions();
                    setHasNotificationPermission(granted);
                    if (granted) {
                      Alert.alert('Success', 'Notification and alarm permissions have been granted successfully!');
                    } else {
                      Alert.alert('Permission Denied', 'Failed to request permission. Please enable notifications in your phone Settings.');
                    }
                  }}
                />
              )}
            </SettingRow>
            <RowDivider />
            <SettingRow
              title="Battery Optimization Bypass"
              subtitle={
                isBatteryOptimizationBypassed === true
                  ? 'Optimizations are disabled (Unrestricted)'
                  : 'Prevent Android from killing background monitoring'
              }
            >
              {isBatteryOptimizationBypassed === true ? (
                <Badge label="Configured" tone="success" />
              ) : (
                <Button
                  label="Configure"
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    Alert.alert(
                      'Background Performance',
                      'To ensure the app can run forever in the background and trigger sirens instantly, you must configure your device battery settings to "Unrestricted" or "Not Optimized" for SolarGuard.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Configure',
                          onPress: () => {
                            if (Platform.OS === 'android') {
                              Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() => {
                                Linking.openSettings().catch(() => {});
                              });
                            } else {
                              Linking.openSettings().catch(() => {});
                            }
                          },
                        },
                      ]
                    );
                  }}
                />
              )}
            </SettingRow>
            <RowDivider />
            <SettingRow
              title="Persistent Status Notification"
              subtitle={`Keep monitoring active in background (every ${refreshInterval} min)`}
            >
              <AppSwitch value={foregroundServiceEnabled} onValueChange={setForegroundServiceEnabled} {...switchA11y('Foreground monitoring service')} />
            </SettingRow>
          </Card>
        </View>

        {/* LOCATION-AWARE MONITORING */}
        <View style={styles.section}>
          <SectionHeader
            title="Location & Monitoring"
            icon={<MapPin size={14} color={colors.textSecondary} strokeWidth={2} />}
            right={
              monitoringMode === 'geofenced' ? (
                <Badge label={geofenceRegistered ? 'Armed' : 'Idle'} tone={geofenceRegistered ? 'success' : 'warning'} />
              ) : undefined
            }
          />
          <Card>
            <SettingRow
              title="Monitoring Mode"
              subtitle={
                monitoringMode === 'geofenced'
                  ? 'Full monitoring inside your home zone; quiet alerts outside'
                  : 'Always monitor, regardless of location'
              }
            />
            <SegmentedControl
              options={[
                { value: 'always' as MonitoringMode, label: 'Always' },
                { value: 'geofenced' as MonitoringMode, label: 'Geofenced' },
              ]}
              value={monitoringMode}
              onChange={setMonitoringMode}
            />

            {monitoringMode === 'geofenced' ? (
              <>
                <RowDivider />
                <SettingRow
                  title="Location Permission"
                  subtitle={
                    locationPermissions.background
                      ? 'Background location granted ("Allow all the time")'
                      : locationPermissions.foreground
                        ? 'Foreground granted â€” background ("Allow all the time") required for the fence'
                        : 'Location permission required to arm the home zone'
                  }
                >
                  {locationPermissions.background ? (
                    <Badge label="Granted" tone="success" />
                  ) : (
                    <Button
                      label="Enable"
                      size="sm"
                      onPress={async () => {
                        const fgOk = await requestForegroundLocationPermission();
                        if (!fgOk) {
                          Alert.alert('Permission Denied', 'Location permission is required for geofenced monitoring.');
                          return;
                        }
                        const bgOk = await requestBackgroundLocationPermission();
                        setLocationPermissions(await getLocationPermissions());
                        if (!bgOk) {
                          Alert.alert(
                            'Background Location Needed',
                            'Please set location access to "Allow all the time" so the fence works while SolarGuard is closed.'
                          );
                        }
                      }}
                    />
                  )}
                </SettingRow>
                <RowDivider />
                <SettingRow title="Home Zone" subtitle="Center coordinates and radius of your home area">
                  <Button
                    label="Use Current"
                    size="sm"
                    variant="secondary"
                    icon={<Crosshair size={14} color={colors.textPrimary} strokeWidth={2} />}
                    onPress={async () => {
                      const pos = await getCurrentLocation();
                      if (!pos) {
                        Alert.alert('Location Unavailable', 'Could not get a GPS fix. Check location permission and try again.');
                        return;
                      }
                      setZoneLat(String(pos.lat));
                      setZoneLng(String(pos.lng));
                    }}
                  />
                </SettingRow>
                <View style={styles.zoneInputGrid}>
                  <Input
                    label="Latitude"
                    value={zoneLat}
                    onChangeText={setZoneLat}
                    keyboardType="numeric"
                    placeholder="e.g. 12.9716"
                    accessibilityLabel="Home zone latitude"
                  />
                  <Input
                    label="Longitude"
                    value={zoneLng}
                    onChangeText={setZoneLng}
                    keyboardType="numeric"
                    placeholder="e.g. 77.5946"
                    accessibilityLabel="Home zone longitude"
                  />
                </View>
                <View style={styles.zoneRadiusRow}>
                  <Input
                    label={`Radius (m) â€” ${MIN_ZONE_RADIUS_METERS}â€“${MAX_ZONE_RADIUS_METERS}`}
                    value={zoneRadius}
                    onChangeText={setZoneRadius}
                    keyboardType="numeric"
                    compactWidth={120}
                    accessibilityLabel="Home zone radius in meters"
                  />
                </View>
                {homeZone ? (
                  <Text style={[styles.zoneHint, { color: colors.textSecondary }]}>
                    {zoneStatus || 'Zone saved'} Â· sirens play inside the zone; outside it, alarms become silent push notifications.
                  </Text>
                ) : (
                  <Text style={[styles.zoneHint, { color: colors.textSecondary }]}>
                    Enter coordinates and save to arm the fence. Alarms degrade to notifications outside your zone.
                  </Text>
                )}
              </>
            ) : null}
          </Card>
        </View>

        {/* SMART COMPANION CONFIG */}
        <View style={styles.section}>
          <SectionHeader title="System Configuration" icon={<MapPinned size={14} color={colors.textSecondary} strokeWidth={2} />} />
          <Card>
            {stations.length > 0 ? (
              <>
                <SettingRow title="Active Station" subtitle="Choose which solar plant to monitor" />
                <View style={styles.stationList}>
                  {stations.map((st) => {
                    const active = activeStationId === st.id;
                    return (
                      <TouchableOpacity
                        key={st.id}
                        onPress={() => setActiveStationId(st.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Station ${st.name}`}
                        style={[
                          styles.stationChip,
                          {
                            backgroundColor: active ? colors.brand : colors.surface2,
                            borderColor: active ? colors.brand : colors.border,
                          },
                        ]}
                      >
                        {stationIcon(st.name)}
                        <Text
                          style={[
                            styles.stationChipText,
                            { color: active ? colors.textInverse : colors.textPrimary },
                          ]}
                          numberOfLines={1}
                        >
                          {st.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <RowDivider />
              </>
            ) : null}

            <SettingRow title="Battery Capacity" subtitle="Total battery storage size">
              <Input
                value={batteryCapacity}
                onChangeText={setBatteryCapacity}
                keyboardType="numeric"
                placeholder="5.12"
                unit="kWh"
                compactWidth={96}
                accessibilityLabel="Battery capacity in kilowatt hours"
              />
            </SettingRow>
            <RowDivider />
            <SettingRow title="Import Tariff" subtitle="Electricity cost from grid">
              <Input
                value={tariffImportRate}
                onChangeText={setTariffImportRate}
                keyboardType="numeric"
                placeholder="7.50"
                unit="â‚¹/kWh"
                compactWidth={110}
                accessibilityLabel="Import tariff per kilowatt hour"
              />
            </SettingRow>
            <RowDivider />
            <SettingRow title="Export Tariff" subtitle="Feed-in credit to grid">
              <Input
                value={tariffExportRate}
                onChangeText={setTariffExportRate}
                keyboardType="numeric"
                placeholder="5.00"
                unit="â‚¹/kWh"
                compactWidth={110}
                accessibilityLabel="Export tariff per kilowatt hour"
              />
            </SettingRow>
            <RowDivider />
            <SettingRow title="Refresh Interval" subtitle="Live telemetry polling speed" />
            <SegmentedControl
              options={[1, 5, 15, 30].map(m => ({ value: m, label: `${m}m` }))}
              value={refreshInterval}
              onChange={setRefreshInterval}
            />
          </Card>
        </View>

        {/* DISPLAY & QUIET HOURS */}
        <View style={styles.section}>
          <SectionHeader title="Display & Quiet Hours" icon={<MoonStar size={14} color={colors.textSecondary} strokeWidth={2} />} />
          <Card>
            <SettingRow title="AMOLED Dark Theme" subtitle="Pure black surfaces for OLED screens">
              <AppSwitch value={amoledTheme} onValueChange={setAmoledTheme} {...switchA11y('AMOLED theme')} />
            </SettingRow>
            <RowDivider />
            <SettingRow title="Quiet Hours" subtitle="Mute alert sounds during set hours">
              <AppSwitch value={quietHoursEnabled} onValueChange={setQuietHoursEnabled} {...switchA11y('Quiet hours')} />
            </SettingRow>
            {quietHoursEnabled ? (
              <View style={styles.quietRow}>
                <Input
                  label="Start"
                  value={quietHoursStart}
                  onChangeText={setQuietHoursStart}
                  placeholder="23:00"
                  maxLength={5}
                  compactWidth={96}
                  accessibilityLabel="Quiet hours start time"
                />
                <Input
                  label="End"
                  value={quietHoursEnd}
                  onChangeText={setQuietHoursEnd}
                  placeholder="07:00"
                  maxLength={5}
                  compactWidth={96}
                  accessibilityLabel="Quiet hours end time"
                />
              </View>
            ) : null}
          </Card>
        </View>

        {/* DEVELOPER OPTIONS */}
        {devUnlocked ? (
          <View style={styles.section}>
            <SectionHeader
              title="Developer Options"
              icon={<CodeXml size={14} color={colors.dangerText} strokeWidth={2} />}
              right={<Badge label="Dev" tone="danger" />}
            />

            {/* Diagnostics panel */}
            <Card style={styles.diagCard}>
              <View style={styles.diagHeader}>
                <Text style={[styles.diagTitle, { color: colors.textPrimary }]}>Monitoring Engine</Text>
                <View style={styles.diagStatus}>
                  <StatusDot
                    color={ForegroundServiceManager.isServiceRunning() ? colors.success : colors.danger}
                    mode="steady"
                    size={7}
                  />
                  <Text
                    style={[
                      styles.diagStatusText,
                      { color: ForegroundServiceManager.isServiceRunning() ? colors.successText : colors.dangerText },
                    ]}
                  >
                    {ForegroundServiceManager.isServiceRunning() ? 'Running' : 'Stopped'}
                  </Text>
                </View>
              </View>
              {(
                [
                  ['State', fsState, fsState.includes('Error') ? colors.dangerText : colors.textPrimary],
                  ['Last Result', fsLastResult, fsLastResult === 'Success' ? colors.successText : colors.dangerText],
                  ['Service Type', 'Foreground Service', colors.textPrimary],
                  ['Interval', `${refreshInterval} minute${refreshInterval !== 1 ? 's' : ''}`, colors.textPrimary],
                  ['Last Poll', fsLastPoll, colors.textPrimary],
                  ['Next Poll', fsNextPoll, colors.textPrimary],
                ] as [string, string, string][]
              ).map(([label, value, color], i) => (
                <View key={label}>
                  {i > 0 ? <View style={[styles.diagSeparator, { backgroundColor: colors.divider }]} /> : null}
                  <View style={styles.diagRow}>
                    <Text style={[styles.diagLabel, { color: colors.textSecondary }]}>{label}</Text>
                    <Text style={[styles.diagValue, { color }]}>{value}</Text>
                  </View>
                </View>
              ))}
            </Card>

            {/* Test actions & overrides */}
            <Card style={{ marginTop: Spacing.md }}>
              <SettingRow title="Test Alarm System" subtitle="Trigger critical alarm sound test">
                <Button
                  label="Test"
                  size="sm"
                  variant="danger"
                  icon={<BellRing size={14} color={colors.textInverse} strokeWidth={2} />}
                  onPress={async () => {
                    try {
                      await requestNotificationPermissions();
                      const tempSettings = {
                        alarmDurationSeconds: alarmDuration,
                        useAlarmSound,
                        onlyAlarmNoPopup,
                        alarmSoundName,
                        alertOnPowerCut,
                        alertOnGridOffOnly,
                        alertOnBatteryDischarge,
                        alertOnOverSolarLoad,
                        alertOnBatteryPercent,
                        batteryWarningThreshold: parseInt(batteryWarningThreshold, 10) || 20,
                        batteryCapacity: parseFloat(batteryCapacity) || 5.12,
                        activeStationId,
                        refreshIntervalMinutes: refreshInterval,
                        quietHoursStart,
                        quietHoursEnd,
                        quietHoursEnabled,
                        amoledTheme,
                        foregroundServiceEnabled,
                        monitoringMode,
                        homeZone,
                      };
                      await sendTestNotification(tempSettings);
                      Alert.alert('Alert Sent', `Critical test alert has been scheduled for ${alarmDuration}s.`);
                    } catch (err) {
                      Alert.alert('Error', 'Failed to send alert.');
                    }
                  }}
                />
              </SettingRow>
              <RowDivider />
              <SettingRow title="Mock Telemetry Overrides" subtitle="Manually override grid & battery data">
                <AppSwitch value={devOverridesEnabled} onValueChange={setDevOverridesEnabled} {...switchA11y('Mock telemetry overrides')} />
              </SettingRow>

              {devOverridesEnabled ? (
                <View style={styles.devSection}>
                  <RowDivider />
                  <SettingRow title="Grid Status" />
                  <SegmentedControl
                    options={[
                      { value: 'on' as const, label: 'Grid On', icon: <PlugZap size={14} color={colors.success} strokeWidth={2} /> },
                      { value: 'off' as const, label: 'Grid Off', icon: <CircleOff size={14} color={colors.danger} strokeWidth={2} /> },
                    ]}
                    value={devGridRelayStatus}
                    onChange={setDevGridRelayStatus}
                  />
                  <RowDivider />
                  <SettingRow title="Battery Status" />
                  <SegmentedControl
                    options={[
                      { value: 'CHARGE', label: 'Charging', icon: <BatteryCharging size={14} color={colors.charge} strokeWidth={2} /> },
                      { value: 'DISCHARGE', label: 'Discharging', icon: <Battery size={14} color={colors.discharge} strokeWidth={2} /> },
                      { value: 'IDLE', label: 'Idle', icon: <Pause size={14} color={colors.textSecondary} strokeWidth={2} /> },
                    ]}
                    value={devBatteryStatus}
                    onChange={setDevBatteryStatus}
                  />
                  <View style={styles.devInputGrid}>
                    <Input
                      label="Battery SoC (%)"
                      value={devBatterySoc}
                      onChangeText={setDevBatterySoc}
                      keyboardType="numeric"
                      maxLength={3}
                      accessibilityLabel="Mock battery state of charge"
                    />
                    <Input
                      label="Battery Power (W)"
                      value={devBatteryPower}
                      onChangeText={setDevBatteryPower}
                      keyboardType="numeric"
                      accessibilityLabel="Mock battery power"
                    />
                  </View>
                  <View style={styles.devInputGrid}>
                    <Input
                      label="Solar PV (W)"
                      value={devPvPower}
                      onChangeText={setDevPvPower}
                      keyboardType="numeric"
                      accessibilityLabel="Mock solar power"
                    />
                    <Input
                      label="House Load (W)"
                      value={devUsePower}
                      onChangeText={setDevUsePower}
                      keyboardType="numeric"
                      accessibilityLabel="Mock house load"
                    />
                  </View>
                  <RowDivider />
                  <Text style={[styles.devScheduleLabel, { color: colors.textPrimary }]}>
                    Schedule Event (seconds from now)
                  </Text>
                  <View style={styles.devInputGrid}>
                    <Input
                      label="Power Cut (s)"
                      value={devScheduledPowerCutSeconds}
                      onChangeText={setDevScheduledPowerCutSeconds}
                      keyboardType="numeric"
                      placeholder="e.g. 15"
                      accessibilityLabel="Scheduled power cut in seconds"
                    />
                    <Input
                      label="Power On (s)"
                      value={devScheduledPowerOnSeconds}
                      onChangeText={setDevScheduledPowerOnSeconds}
                      keyboardType="numeric"
                      placeholder="e.g. 30"
                      accessibilityLabel="Scheduled power on in seconds"
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* SAVE */}
        <Button label="Save Preferences" onPress={handleSave} full style={{ marginTop: Spacing.md }} />

        {/* ABOUT ROW */}
        <TouchableOpacity
          onPress={() => navigation.navigate('About')}
          accessibilityRole="button"
          accessibilityLabel="About SolarGuard"
          style={[styles.aboutRow, { backgroundColor: colors.surface1, borderColor: colors.border }]}
        >
          <Text style={[styles.aboutRowText, { color: colors.textPrimary }]}>About SolarGuard</Text>
          <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2} />
        </TouchableOpacity>

        {/* LOGOUT */}
        <Button
          label="Sign Out of SolarOS"
          variant="ghost"
          icon={<LogOut size={16} color={colors.dangerText} strokeWidth={2} />}
          full
          style={[styles.logoutBtn, { borderColor: colors.dangerBorder }]}
          onPress={handleLogout}
        />

        <Text style={[styles.footerDisclaimer, { color: colors.textDisabled }]}>
          SolarGuard is an independent companion app and is not affiliated with or endorsed by SolarOS.
        </Text>
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.background }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: PAGE_GUTTER,
    paddingBottom: Spacing['2xl'],
  },
  section: {
    marginBottom: Spacing.xl,
  },
  inlineValue: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  thresholdLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
  },
  stationList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  stationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 40,
  },
  stationChipText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
  },
  quietRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  zoneInputGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  zoneRadiusRow: {
    marginTop: Spacing.md,
    alignItems: 'flex-start',
  },
  zoneHint: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    marginTop: Spacing.md,
    lineHeight: 15,
  },
  diagCard: {},
  diagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  diagTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.base,
  },
  diagStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  diagStatusText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  diagLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
  },
  diagValue: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
  diagSeparator: {
    height: 1,
  },
  devSection: {
    marginTop: Spacing.sm,
  },
  devInputGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  devScheduleLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    minHeight: 52,
  },
  aboutRowText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.base,
  },
  logoutBtn: {
    marginTop: Spacing.sm,
  },
  footerDisclaimer: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    lineHeight: 15,
  },
});
