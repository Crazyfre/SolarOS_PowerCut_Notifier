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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../theme';
import { useApp } from '../context/AppContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { unregisterBackgroundFetch } from '../services/backgroundFetch';
import { StationService, SolarStation } from '../services/stationService';
import { DevOverridesStore } from '../storage/devOverridesStore';
import { sendTestNotification, ALARM_SOUND_OPTIONS } from '../services/notifications';

type RootStackParamList = {
  Dashboard: undefined;
  Settings: undefined;
  About: undefined;
};

type NavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;

export function SettingsScreen() {
  const { settings, updateSettings, logout, refreshTelemetry } = useApp();
  const navigation = useNavigation<NavigationProp>();

  // Developer overrides state
  const [devOverridesEnabled, setDevOverridesEnabled] = useState(false);
  const [devGridRelayStatus, setDevGridRelayStatus] = useState<'on' | 'off'>('on');
  const [devBatteryStatus, setDevBatteryStatus] = useState<string>('CHARGE');
  const [devBatterySoc, setDevBatterySoc] = useState('100');
  const [devBatteryPower, setDevBatteryPower] = useState('0');
  const [devPvPower, setDevPvPower] = useState('0');
  const [devUsePower, setDevUsePower] = useState('0');

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
      } catch (err) {
        console.warn('Failed to load developer overrides:', err);
      }
    })();
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

    const overrides = {
      enabled: devOverridesEnabled,
      gridRelayStatus: devGridRelayStatus,
      batterySoc: isNaN(socVal) ? 100 : socVal,
      batteryStatus: devBatteryStatus,
      batteryPower: isNaN(powerVal) ? 0 : powerVal,
      pvPower: isNaN(pvVal) ? 0 : pvVal,
      usePower: isNaN(useVal) ? 0 : useVal,
    };

    await DevOverridesStore.saveOverrides(overrides);

    // Trigger immediate refresh so telemetry changes are applied & alerts run
    await refreshTelemetry().catch(() => {});

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
          await unregisterBackgroundFetch();
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
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 32 }} /> {/* balance back button */}
        </View>

        {/* ALARM SYSTEM CONFIG */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Alarm & Sound Config</Text>
          
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
          <Text style={styles.sectionHeader}>Alert Filter Preferences</Text>

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

        {/* SMART COMPANION CONFIG */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Smart Companion Config</Text>
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
                      ]}
                      onPress={() => setActiveStationId(st.id)}
                    >
                      <Text
                        style={[
                          styles.stationText,
                          activeStationId === st.id && styles.stationTextActive,
                        ]}
                      >
                        {st.name.includes('Home') ? '🏠 ' : st.name.includes('Office') ? '🏢 ' : '⚡ '}
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
          <Text style={styles.sectionHeader}>Display & Quiet Hours</Text>
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
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>🚨 Developer options</Text>
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
                    };
                    await sendTestNotification(tempSettings);
                    Alert.alert('Alert Sent', `Critical test alert has been scheduled for ${alarmDuration}s.`);
                  } catch (err) {
                    Alert.alert('Error', 'Failed to send alert.');
                  }
                }}
              >
                <Text style={styles.testAlarmBtnText}>Test 🔔</Text>
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
                        ]}
                        onPress={() => setDevGridRelayStatus(status)}
                      >
                        <Text
                          style={[
                            styles.durationText,
                            devGridRelayStatus === status && styles.durationTextActive,
                          ]}
                        >
                          {status === 'on' ? '🔌 Grid On' : '🚫 Grid Off'}
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
                        ]}
                        onPress={() => setDevBatteryStatus(status)}
                      >
                        <Text
                          style={[
                            styles.durationText,
                            devBatteryStatus === status && styles.durationTextActive,
                          ]}
                        >
                          {status === 'CHARGE' ? '⚡ Charging' : status === 'DISCHARGE' ? '🔋 Discharging' : '⏸️ Idle'}
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
              </View>
            )}
          </View>
        </View>

        {/* SAVE BUTTON */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Preferences 💾</Text>
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
          <Text style={styles.logoutBtnText}>Sign Out of SolarOS</Text>
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
});
