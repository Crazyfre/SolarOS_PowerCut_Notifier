import React, { useState } from 'react';
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

type RootStackParamList = {
  Dashboard: undefined;
  Settings: undefined;
};

type NavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;

export function SettingsScreen() {
  const { settings, updateSettings, logout } = useApp();
  const navigation = useNavigation<NavigationProp>();

  const [useAlarmSound, setUseAlarmSound] = useState(settings.useAlarmSound);
  const [alarmDuration, setAlarmDuration] = useState(settings.alarmDurationSeconds);
  const [onlyAlarmNoPopup, setOnlyAlarmNoPopup] = useState(settings.onlyAlarmNoPopup);
  
  const [alertOnPowerCut, setAlertOnPowerCut] = useState(settings.alertOnPowerCut);
  const [alertOnBatteryDischarge, setAlertOnBatteryDischarge] = useState(settings.alertOnBatteryDischarge);
  const [alertOnOverSolarLoad, setAlertOnOverSolarLoad] = useState(settings.alertOnOverSolarLoad);
  
  const [alertOnBatteryPercent, setAlertOnBatteryPercent] = useState(settings.alertOnBatteryPercent);
  const [batteryWarningThreshold, setBatteryWarningThreshold] = useState(
    String(settings.batteryWarningThreshold)
  );

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

    const updated = {
      alarmDurationSeconds: alarmDuration,
      useAlarmSound,
      onlyAlarmNoPopup,
      alertOnPowerCut,
      alertOnBatteryDischarge,
      alertOnOverSolarLoad,
      alertOnBatteryPercent,
      batteryWarningThreshold: thresholdNum,
    };

    await updateSettings(updated);
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
    <SafeAreaView style={styles.root} edges={['bottom']}>
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

        {/* SAVE BUTTON */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Preferences 💾</Text>
        </TouchableOpacity>

        {/* LOGOUT */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Sign Out of SolarOS</Text>
        </TouchableOpacity>

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
});
