import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Linking,
  AppState,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../theme';
import { useApp } from '../context/AppContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { StationService, SolarStation } from '../services/stationService';
import { DevOverridesStore } from '../storage/devOverridesStore';
import { sendTestNotification, ALARM_SOUND_OPTIONS, requestNotificationPermissions } from '../services/notifications';
import OutageAlarm from '../../modules/outage-alarm';
import { ForegroundServiceManager } from '../services/foregroundService';
import {
  ArrowLeft,
  BellRing,
  Bell,
  Battery,
  RefreshCcw,
  MoonStar,
  MapPinned,
  CodeXml,
  Save,
  LogOut,
  House,
  Building2,
  Zap,
  PlugZap,
  CircleOff,
  BatteryCharging,
  Pause,
} from 'lucide-react-native';

type RootStackParamList = {
  Dashboard: undefined;
  Settings: undefined;
  About: undefined;
};

type NavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;

export function SettingsScreen() {
  const { settings, updateSettings, logout, refreshTelemetry } = useApp();
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
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(settings.quietHoursEnabled ?? false);
  const [quietHoursStart, setQuietHoursStart] = useState(settings.quietHoursStart ?? '23:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState(settings.quietHoursEnd ?? '07:00');
  const [foregroundServiceEnabled, setForegroundServiceEnabled] = useState(settings.foregroundServiceEnabled ?? false);

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
    })();
  }, []);

  // Re-check permissions and battery optimization status when app returns from background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // Re-check notification permission
        Notifications.getPermissionsAsync().then(({ status }) => {
          setHasNotificationPermission(status === 'granted');
        }).catch(() => {});

        // Re-check battery optimization
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


  // ─── Save settings ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    const thresholdNum = parseInt(batteryWarningThreshold, 10);
    if (
      isNaN(thresholdNum) ||
      thresholdNum < 10 ||
      thresholdNum > 50
    ) {
      Alert.alert('Invalid Input', 'Battery Warning Threshold must be between 10% and 50%.');
      return;
    }

    const capacityNum = parseFloat(batteryCapacity);
    if (isNaN(capacityNum) || capacityNum <= 0) {
      Alert.alert('Invalid Input', 'Battery capacity must be a positive number.');
      return;
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

    // Trigger immediate refresh in the background so telemetry changes are applied & alerts run
    refreshTelemetry().catch(() => {});

    Alert.alert('Success', 'Settings saved successfully!', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  // ─── Logout handler ────────────────────────────────────────────────────────

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

  return (
    <SafeAreaView style={[styles.root, amoledTheme && { backgroundColor: '#000000' }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={18} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          {/* balance back button */}
          <View style={{ width: 32 }} />
        </View>

        {/* ALARM SYSTEM CONFIG */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
            <BellRing size={16} color={Colors.textSecondary} />
            <Text style={[styles.sectionHeader, { marginBottom: 0 }]}>Alarm & Sound Config</Text>
          </View>
          
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Custom Alarm Siren</Text>
                <Text style={styles.rowSub}>Use high-pitch pulsing siren tone</Text>
              </View>
              <Switch
                value={useAlarmSound}
                onValueChange={setUseAlarmSound}
                trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                thumbColor={useAlarmSound ? Colors.textInverse : Colors.textMuted}
              />
            </View>

            <View style={styles.separator} />

            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Only Alarm, No Popup</Text>
                <Text style={styles.rowSub}>Trigger sound without on-screen banner</Text>
              </View>
              <Switch
                value={onlyAlarmNoPopup}
                onValueChange={setOnlyAlarmNoPopup}
                trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                thumbColor={onlyAlarmNoPopup ? Colors.textInverse : Colors.textMuted}
              />
            </View>

            <View style={styles.separator} />

            <View style={styles.column}>
              <Text style={styles.rowTitle}>Alarm Ring Duration</Text>
              <View style={styles.durationSelector}>
                {[5, 10, 15, 30].map((sec) => (
                  <TouchableOpacity
                    key={sec}
                    style={[
                      styles.durationButton,
                      alarmDuration === sec && styles.durationButtonActive,
                    ]}
                    onPress={() => setAlarmDuration(sec)}
                  >
                    <Text
                      style={[
                        styles.durationText,
                        alarmDuration === sec && styles.durationTextActive,
                      ]}
                    >
                      {sec}s
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {useAlarmSound && (
              <>
                <View style={styles.separator} />
                <View style={styles.column}>
                  <Text style={styles.rowTitle}>Select Alarm Tone</Text>
                  <View style={styles.soundSelector}>
                    {ALARM_SOUND_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.soundButton,
                          alarmSoundName === option.id && styles.soundButtonActive,
                        ]}
                        onPress={() => setAlarmSoundName(option.id)}
                      >
                        <Text
                          style={[
                            styles.soundText,
                            alarmSoundName === option.id && styles.soundTextActive,
                          ]}
                        >
                          {option.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* ALERTS FILTER */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
            <Bell size={16} color={Colors.textSecondary} />
            <Text style={[styles.sectionHeader, { marginBottom: 0 }]}>Alert Filter Preferences</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Grid Outages & Restores</Text>
                <Text style={styles.rowSub}>Alert instantly on power cuts</Text>
              </View>
              <Switch
                value={alertOnPowerCut}
                onValueChange={setAlertOnPowerCut}
                trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                thumbColor={alertOnPowerCut ? Colors.textInverse : Colors.textMuted}
              />
            </View>

            <View style={styles.separator} />

            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Grid Off Alerts Only</Text>
                <Text style={styles.rowSub}>Trigger alarm only when grid goes offline</Text>
              </View>
              <Switch
                value={alertOnGridOffOnly}
                onValueChange={setAlertOnGridOffOnly}
                trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                thumbColor={alertOnGridOffOnly ? Colors.textInverse : Colors.textMuted}
              />
            </View>

            <View style={styles.separator} />

            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Battery Discharging</Text>
                <Text style={styles.rowSub}>Alert when grid is on but using battery</Text>
              </View>
              <Switch
                value={alertOnBatteryDischarge}
                onValueChange={setAlertOnBatteryDischarge}
                trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                thumbColor={alertOnBatteryDischarge ? Colors.textInverse : Colors.textMuted}
              />
            </View>

            <View style={styles.separator} />

            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Load Exceeds Solar Output</Text>
                <Text style={styles.rowSub}>Alert when drawing remainder power</Text>
              </View>
              <Switch
                value={alertOnOverSolarLoad}
                onValueChange={setAlertOnOverSolarLoad}
                trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                thumbColor={alertOnOverSolarLoad ? Colors.textInverse : Colors.textMuted}
              />
            </View>

            <View style={styles.separator} />

            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Battery Warning Threshold</Text>
                <Text style={styles.rowSub}>Alert when battery SOC drops below %</Text>
              </View>
              <Switch
                value={alertOnBatteryPercent}
                onValueChange={setAlertOnBatteryPercent}
                trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                thumbColor={alertOnBatteryPercent ? Colors.textInverse : Colors.textMuted}
              />
            </View>

            {alertOnBatteryPercent && (
              <View style={styles.thresholdInputRow}>
                <Text style={styles.thresholdLabel}>Trigger Threshold (%)</Text>
                <TextInput
                  style={styles.thresholdInput}
                  value={batteryWarningThreshold}
                  onChangeText={setBatteryWarningThreshold}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
            )}
          </View>
        </View>

        {/* SYSTEM PERMISSIONS & BACKGROUND */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
            <Battery size={16} color={Colors.textSecondary} />
            <Text style={[styles.sectionHeader, { marginBottom: 0 }]}>System Permissions & Background</Text>
          </View>
          <View style={styles.card}>
            {/* Notification Permissions */}
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Notification & Alarm Sound</Text>
                <Text style={styles.rowSub}>
                  {hasNotificationPermission === true
                    ? 'Permissions are granted'
                    : 'Required to play sirens and alert banners'}
                </Text>
              </View>
              {hasNotificationPermission === true ? (
                <View style={styles.grantedBadge}>
                  <Text style={styles.grantedBadgeText}>✓ Granted</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.permissionBtn}
                  onPress={async () => {
                    const granted = await requestNotificationPermissions();
                    setHasNotificationPermission(granted);
                    if (granted) {
                      Alert.alert(
                        'Success',
                        'Notification and alarm permissions have been granted successfully!'
                      );
                    } else {
                      Alert.alert(
                        'Permission Denied',
                        'Failed to request permission. Please enable notifications in your phone Settings.'
                      );
                    }
                  }}
                >
                  <Text style={styles.permissionBtnText}>Enable</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.separator} />

            {/* Battery Optimization Bypass */}
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Background Battery Optimization</Text>
                <Text style={styles.rowSub}>
                  {isBatteryOptimizationBypassed === true
                    ? 'Optimizations are disabled (Unrestricted)'
                    : 'Prevent Android from killing SolarGuard background monitoring'}
                </Text>
              </View>
              {isBatteryOptimizationBypassed === true ? (
                <View style={styles.grantedBadge}>
                  <Text style={styles.grantedBadgeText}>✓ Configured</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.configureBtn}
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
                          }
                        }
                      ]
                    );
                  }}
                >
                  <Text style={styles.configureBtnText}>Configure</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.separator} />

            {/* Foreground Service Toggle */}
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Persistent Status Notification</Text>
                <Text style={styles.rowSub}>
                  Keep app active in background to fetch telemetry every 5 mins
                </Text>
              </View>
              <Switch
                value={foregroundServiceEnabled}
                onValueChange={setForegroundServiceEnabled}
                trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                thumbColor={foregroundServiceEnabled ? Colors.textInverse : Colors.textMuted}
              />
            </View>
          </View>
        </View>

        {/* SMART COMPANION CONFIG */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
            <MapPinned size={16} color={Colors.textSecondary} />
            <Text style={[styles.sectionHeader, { marginBottom: 0 }]}>Smart Companion Config</Text>
          </View>
          <View style={styles.card}>
            {/* Station switcher */}
            {stations.length > 0 && (
              <View style={styles.column}>
                <Text style={styles.rowTitle}>Select Active Station</Text>
                <Text style={styles.rowSub}>Choose which solar plant to monitor</Text>
                <View style={styles.stationSelector}>
                  {stations.map((st) => (
                    <TouchableOpacity
                      key={st.id}
                      style={[
                        styles.stationButton,
                        activeStationId === st.id && styles.stationButtonActive,
                        { flexDirection: 'row', alignItems: 'center', gap: 6 }
                      ]}
                      onPress={() => setActiveStationId(st.id)}
                    >
                      {st.name.includes('Home') ? (
                        <House size={16} color={activeStationId === st.id ? Colors.textInverse : Colors.amber} />
                      ) : st.name.includes('Office') ? (
                        <Building2 size={16} color={activeStationId === st.id ? Colors.textInverse : Colors.amber} />
                      ) : (
                        <Zap size={16} color={activeStationId === st.id ? Colors.textInverse : Colors.amber} />
                      )}
                      <Text
                        style={[
                          styles.stationText,
                          activeStationId === st.id && styles.stationTextActive,
                        ]}
                      >
                        {st.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.separator} />
              </View>
            )}

            {/* Battery Capacity */}
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Battery Capacity</Text>
                <Text style={styles.rowSub}>Enter total battery storage size in kWh</Text>
              </View>
              <View style={styles.capacityInputContainer}>
                <TextInput
                  style={styles.capacityInput}
                  value={batteryCapacity}
                  onChangeText={setBatteryCapacity}
                  keyboardType="numeric"
                  placeholder="5.12"
                />
                <Text style={styles.capacityUnit}>kWh</Text>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Refresh Interval */}
            <View style={styles.column}>
              <Text style={styles.rowTitle}>Refresh Interval</Text>
              <Text style={styles.rowSub}>Select live background/foreground refresh speed</Text>
              <View style={styles.durationSelector}>
                {[1, 5, 15, 30].map((mins) => (
                  <TouchableOpacity
                    key={mins}
                    style={[
                      styles.durationButton,
                      refreshInterval === mins && styles.durationButtonActive,
                    ]}
                    onPress={() => setRefreshInterval(mins)}
                  >
                    <Text
                      style={[
                        styles.durationText,
                        refreshInterval === mins && styles.durationTextActive,
                      ]}
                    >
                      {mins}m
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* DISPLAY & PREFERENCES */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
            <MoonStar size={16} color={Colors.textSecondary} />
            <Text style={[styles.sectionHeader, { marginBottom: 0 }]}>Display & Quiet Hours</Text>
          </View>
          <View style={styles.card}>
            {/* AMOLED Theme Switch */}
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>AMOLED Dark Theme</Text>
                <Text style={styles.rowSub}>Use pure black background for OLED screens</Text>
              </View>
              <Switch
                value={amoledTheme}
                onValueChange={setAmoledTheme}
                trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                thumbColor={amoledTheme ? Colors.textInverse : Colors.textMuted}
              />
            </View>

            <View style={styles.separator} />

            {/* Quiet Hours Switch */}
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Enable Quiet Hours</Text>
                <Text style={styles.rowSub}>Mute alert sound during specified hours</Text>
              </View>
              <Switch
                value={quietHoursEnabled}
                onValueChange={setQuietHoursEnabled}
                trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                thumbColor={quietHoursEnabled ? Colors.textInverse : Colors.textMuted}
              />
            </View>

            {quietHoursEnabled && (
              <View style={styles.quietHoursInputRow}>
                <View style={styles.timeInputBlock}>
                  <Text style={styles.timeInputLabel}>Start Time</Text>
                  <TextInput
                    style={styles.timeTextInput}
                    value={quietHoursStart}
                    onChangeText={setQuietHoursStart}
                    placeholder="23:00"
                    maxLength={5}
                  />
                </View>
                <View style={styles.timeInputBlock}>
                  <Text style={styles.timeInputLabel}>End Time</Text>
                  <TextInput
                    style={styles.timeTextInput}
                    value={quietHoursEnd}
                    onChangeText={setQuietHoursEnd}
                    placeholder="07:00"
                    maxLength={5}
                  />
                </View>
              </View>
            )}
          </View>
        </View>

        {/* DEVELOPER OPTIONS CONFIG */}
        {devUnlocked && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
              <CodeXml size={16} color={Colors.dangerLight} />
              <Text style={[styles.sectionHeader, { marginBottom: 0, color: Colors.dangerLight }]}>Developer Options</Text>
            </View>

            {/* Diagnostics Panel */}
            <View style={[styles.card, { marginBottom: Spacing.md }]}>
              <Text style={[styles.rowTitle, { color: Colors.amberLight, marginBottom: Spacing.sm }]}>Monitoring Engine Diagnostics</Text>
              
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Status</Text>
                <Text style={[styles.diagValue, { color: ForegroundServiceManager.isServiceRunning() ? Colors.success : Colors.danger, fontWeight: 'bold' }]}>
                  {ForegroundServiceManager.isServiceRunning() ? 'Running' : 'Stopped'}
                </Text>
              </View>
              <View style={styles.diagSeparator} />
              
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Current State</Text>
                <Text style={[styles.diagValue, { color: fsState.includes('Error') ? Colors.danger : Colors.textPrimary }]}>{fsState}</Text>
              </View>
              <View style={styles.diagSeparator} />

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Last Poll Result</Text>
                <Text style={[styles.diagValue, { color: fsLastResult === 'Success' ? Colors.success : Colors.danger }]}>{fsLastResult}</Text>
              </View>
              <View style={styles.diagSeparator} />

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Service Type</Text>
                <Text style={styles.diagValue}>Foreground Service</Text>
              </View>
              <View style={styles.diagSeparator} />

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Polling Interval</Text>
                <Text style={styles.diagValue}>{refreshInterval} minute{refreshInterval !== 1 ? 's' : ''}</Text>
              </View>
              <View style={styles.diagSeparator} />

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Last Poll Time</Text>
                <Text style={styles.diagValue}>{fsLastPoll}</Text>
              </View>
              <View style={styles.diagSeparator} />

              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Next Poll Time</Text>
                <Text style={styles.diagValue}>{fsNextPoll}</Text>
              </View>
            </View>

            {/* Test Actions & Overrides */}
            <View style={styles.card}>
              {/* Force Test Alarm */}
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>Test Alarm System</Text>
                  <Text style={styles.rowSub}>Immediately trigger critical alarm sound test</Text>
                </View>
                <TouchableOpacity
                  style={styles.testAlarmBtn}
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
                      };
                      await sendTestNotification(tempSettings);
                      Alert.alert('Alert Sent', `Critical test alert has been scheduled for ${alarmDuration}s.`);
                    } catch (err) {
                      Alert.alert('Error', 'Failed to send alert.');
                    }
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <BellRing size={14} color={Colors.dangerLight} />
                    <Text style={styles.testAlarmBtnText}>Test</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.separator} />

              {/* Overrides Toggle */}
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>Mock Telemetry Overrides</Text>
                  <Text style={styles.rowSub}>Enable manually overriding grid & battery data</Text>
                </View>
                <Switch
                  value={devOverridesEnabled}
                  onValueChange={setDevOverridesEnabled}
                  trackColor={{ false: Colors.glassLight, true: Colors.amber }}
                  thumbColor={devOverridesEnabled ? Colors.textInverse : Colors.textMuted}
                />
              </View>

              {devOverridesEnabled && (
                <View style={styles.developerSubSection}>
                  <View style={styles.separator} />

                  {/* Grid Status Selector */}
                  <View style={styles.column}>
                    <Text style={styles.rowTitle}>Grid Status</Text>
                    <View style={styles.durationSelector}>
                      {(['on', 'off'] as const).map((status) => (
                        <TouchableOpacity
                          key={status}
                          style={[
                            styles.durationButton,
                            devGridRelayStatus === status && styles.durationButtonActive,
                            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }
                          ]}
                          onPress={() => setDevGridRelayStatus(status)}
                        >
                          {status === 'on' ? (
                            <PlugZap size={14} color={devGridRelayStatus === status ? Colors.textInverse : Colors.success} />
                          ) : (
                            <CircleOff size={14} color={devGridRelayStatus === status ? Colors.textInverse : Colors.danger} />
                          )}
                          <Text
                            style={[
                              styles.durationText,
                              devGridRelayStatus === status && styles.durationTextActive,
                            ]}
                          >
                            Grid {status === 'on' ? 'On' : 'Off'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.separator} />

                  {/* Battery Status Selector */}
                  <View style={styles.column}>
                    <Text style={styles.rowTitle}>Battery Status</Text>
                    <View style={styles.durationSelector}>
                      {['CHARGE', 'DISCHARGE', 'IDLE'].map((status) => (
                        <TouchableOpacity
                          key={status}
                          style={[
                            styles.durationButton,
                            devBatteryStatus === status && styles.durationButtonActive,
                            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }
                          ]}
                          onPress={() => setDevBatteryStatus(status)}
                        >
                          {status === 'CHARGE' ? (
                            <BatteryCharging size={14} color={devBatteryStatus === status ? Colors.textInverse : Colors.blue} />
                          ) : status === 'DISCHARGE' ? (
                            <Battery size={14} color={devBatteryStatus === status ? Colors.textInverse : Colors.amber} />
                          ) : (
                            <Pause size={14} color={devBatteryStatus === status ? Colors.textInverse : Colors.textSecondary} />
                          )}
                          <Text
                            style={[
                              styles.durationText,
                              devBatteryStatus === status && styles.durationTextActive,
                            ]}
                          >
                            {status === 'CHARGE' ? 'Charging' : status === 'DISCHARGE' ? 'Discharging' : 'Idle'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.separator} />

                  {/* Grid inputs */}
                  <View style={styles.developerInputGrid}>
                    <View style={styles.devInputCol}>
                      <Text style={styles.inputLabel}>Battery SoC (%)</Text>
                      <TextInput
                        style={styles.devTextInput}
                        value={devBatterySoc}
                        onChangeText={setDevBatterySoc}
                        keyboardType="numeric"
                        maxLength={3}
                      />
                    </View>
                    <View style={styles.devInputCol}>
                      <Text style={styles.inputLabel}>Battery Power (W)</Text>
                      <TextInput
                        style={styles.devTextInput}
                        value={devBatteryPower}
                        onChangeText={setDevBatteryPower}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.developerInputGrid}>
                    <View style={styles.devInputCol}>
                      <Text style={styles.inputLabel}>Solar PV (W)</Text>
                      <TextInput
                        style={styles.devTextInput}
                        value={devPvPower}
                        onChangeText={setDevPvPower}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.devInputCol}>
                      <Text style={styles.inputLabel}>House Load (W)</Text>
                      <TextInput
                        style={styles.devTextInput}
                        value={devUsePower}
                        onChangeText={setDevUsePower}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* Scheduling Overrides */}
                  <View style={styles.separator} />
                  <Text style={styles.rowTitle}>Schedule Event (seconds from now)</Text>
                  
                  <View style={styles.developerInputGrid}>
                    <View style={styles.devInputCol}>
                      <Text style={styles.inputLabel}>Power Cut (s)</Text>
                      <TextInput
                        style={styles.devTextInput}
                        value={devScheduledPowerCutSeconds}
                        onChangeText={setDevScheduledPowerCutSeconds}
                        keyboardType="numeric"
                        placeholder="e.g. 15"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                    <View style={styles.devInputCol}>
                      <Text style={styles.inputLabel}>Power On (s)</Text>
                      <TextInput
                        style={styles.devTextInput}
                        value={devScheduledPowerOnSeconds}
                        onChangeText={setDevScheduledPowerOnSeconds}
                        keyboardType="numeric"
                        placeholder="e.g. 30"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* SAVE BUTTON */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            <Save size={18} color={Colors.textInverse} />
            <Text style={styles.saveBtnText}>Save Preferences</Text>
          </View>
        </TouchableOpacity>

        {/* ABOUT ROW */}
        <TouchableOpacity
          style={styles.aboutRowBtn}
          onPress={() => navigation.navigate('About')}
        >
          <View style={styles.aboutRowContent}>
            <Text style={styles.aboutRowText}>About SolarGuard</Text>
            <Text style={styles.aboutRowArrow}>→</Text>
          </View>
        </TouchableOpacity>

        {/* LOGOUT */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            <LogOut size={18} color={Colors.dangerLight} />
            <Text style={styles.logoutBtnText}>Sign Out of SolarOS</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.footerDisclaimer}>
          SolarGuard is an independent companion app and is not affiliated with or endorsed by SolarOS.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing['4xl'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    marginBottom: Spacing.xl,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glassLight,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  backButtonText: {
    color: Colors.textPrimary,
    fontSize: 18,
    lineHeight: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  rowInfo: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  rowTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
  },
  rowSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  column: {
    paddingVertical: Spacing.sm,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.xs,
  },
  durationSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  durationButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.glassLight,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  durationButtonActive: {
    backgroundColor: Colors.amber,
    borderColor: Colors.amber,
  },
  durationText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  durationTextActive: {
    color: Colors.textInverse,
  },
  thresholdInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  thresholdLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  thresholdInput: {
    width: 60,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: Colors.amber,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
    ...Shadows.amber,
  },
  saveBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.textInverse,
  },
  logoutBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.dangerGlow,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  logoutBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.dangerLight,
  },
  stationSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  stationButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.glassLight,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationButtonActive: {
    backgroundColor: Colors.amber,
    borderColor: Colors.amber,
  },
  stationText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  stationTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
  },
  capacityInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.sm,
  },
  capacityInput: {
    width: 60,
    paddingVertical: Spacing.xs,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  capacityUnit: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginLeft: 2,
  },
  quietHoursInputRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  timeInputBlock: {
    flex: 1,
  },
  timeInputLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  timeTextInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  testAlarmBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dangerGlow,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.danger + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testAlarmBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.dangerLight,
  },
  developerSubSection: {
    marginTop: Spacing.md,
  },
  developerInputGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  devInputCol: {
    flex: 1,
  },
  inputLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  devTextInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  soundSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  soundButton: {
    flex: 1,
    minWidth: '45%', // two buttons per row
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  soundButtonActive: {
    backgroundColor: Colors.amberGlow,
    borderColor: Colors.amber + '44',
  },
  soundText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
  },
  soundTextActive: {
    color: Colors.amberLight,
    fontFamily: Typography.fontFamily.bold,
  },
  aboutRowBtn: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    ...Shadows.card,
  },
  aboutRowContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aboutRowText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
  },
  aboutRowArrow: {
    fontSize: Typography.fontSize.base,
    color: Colors.textMuted,
  },
  footerDisclaimer: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    lineHeight: 16,
  },
  grantedBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.successGlow,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  grantedBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.successLight,
  },
  permissionBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.amberGlow,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.amber + '44',
  },
  permissionBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.amberLight,
  },
  configureBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.glassLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  configureBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.textPrimary,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  diagLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  diagValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  diagSeparator: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.xs,
  },
});
