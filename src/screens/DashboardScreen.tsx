import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../theme';
import { useApp } from '../context/AppContext';
import { BatteryBar } from '../components/BatteryBar';
import { StatusCard } from '../components/StatusCard';
import { OutageAlert } from '../components/OutageAlert';
import { PowerFlowDiagram } from '../components/PowerFlowDiagram';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { Store } from '../storage/secureStore';
import { isRunningInExpoGo } from '../services/notifications';


function formatTime(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function DashboardScreen() {
  const { telemetry, isFetching, fetchError, refreshTelemetry, lastFetchTime } = useApp();
  const navigation = useNavigation<any>();
  const [outageStart, setOutageStart] = useState<number | null>(null);

  // Load persisted outage start time
  React.useEffect(() => {
    Store.getOutageStartTime().then(setOutageStart);
  }, [telemetry]);

  const onRefresh = useCallback(async () => {
    await refreshTelemetry();
    const ts = await Store.getOutageStartTime();
    setOutageStart(ts);
  }, [refreshTelemetry]);

  const isGridOn = telemetry?.gridRelayStatus === 'on';
  const isOutage = telemetry?.gridRelayStatus === 'off';
  const batteryIsCharging = telemetry?.batteryStatus === 'CHARGE';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SolarGuard</Text>
          <Text style={styles.headerSub}>
            {lastFetchTime ? `Updated ${formatTime(lastFetchTime)}` : 'Connecting…'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {isFetching && (
            <ActivityIndicator
              size="small"
              color={Colors.amber}
              style={{ marginRight: Spacing.sm }}
            />
          )}
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.settingsBtn}
            accessibilityLabel="Settings"
            testID="settings-button"
          >
            <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={Colors.textPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={onRefresh}
            tintColor={Colors.amber}
            colors={[Colors.amber]}
          />
        }
      >
        {/* Error banner */}
        {fetchError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {fetchError}</Text>
          </View>
        ) : null}

        {/* Expo Go notice — notifications require a dev build */}
        {isRunningInExpoGo() && (
          <View style={styles.expoGoBanner}>
            <Text style={styles.expoGoBannerText}>
              📱 Running in Expo Go — push notifications disabled.{' '}
              <Text style={styles.expoGoBannerLink}>Use a dev build for full functionality.</Text>
            </Text>
          </View>
        )}

        {/* No data yet */}
        {!telemetry && !isFetching && !fetchError ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📡</Text>
            <Text style={styles.emptyText}>Fetching inverter data…</Text>
          </View>
        ) : null}

        {telemetry ? (
          <>
            {/* OUTAGE ALERT — shown prominently when grid is off */}
            {isOutage && (
              <OutageAlert telemetry={telemetry} outageStartTime={outageStart} />
            )}

            {/* Grid Status Banner (normal) */}
            {!isOutage && (
              <View style={[styles.gridBanner, { borderColor: Colors.success + '44' }]}>
                <View style={styles.gridBannerGlow} />
                <Text style={styles.gridBannerDot}>●</Text>
                <View>
                  <Text style={styles.gridBannerTitle}>Grid Connected</Text>
                  <Text style={styles.gridBannerSub}>
                    {telemetry.wirePower > 0
                      ? `Drawing ${telemetry.wirePower}W from mains`
                      : 'Standby — running on solar/battery'}
                  </Text>
                </View>
              </View>
            )}

            {/* Battery Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Battery</Text>
              <View style={styles.batteryCard}>
                <BatteryBar
                  soc={telemetry.batterySoc ?? 0}
                  voltage={telemetry.batteryBv}
                  isCharging={batteryIsCharging}
                  large
                />
              </View>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statsRow}>
                <View style={[styles.statCell, { flex: 1, marginRight: Spacing.sm }]}>
                  <StatusCard
                    title="Grid"
                    value={isGridOn ? 'Available' : 'OFFLINE'}
                    subtitle={isGridOn ? `${telemetry.wirePower ?? 0}W import` : 'Power cut active'}
                    icon={isGridOn ? '🔌' : '🚫'}
                    accentColor={isGridOn ? Colors.success : Colors.danger}
                  />
                </View>
                <View style={[styles.statCell, { flex: 1, marginLeft: Spacing.sm }]}>
                  <StatusCard
                    title="House Load"
                    value={`${telemetry.usePower ?? 0}W`}
                    subtitle="Current consumption"
                    icon="🏠"
                    accentColor={Colors.amber}
                  />
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={[styles.statCell, { flex: 1, marginRight: Spacing.sm }]}>
                  <StatusCard
                    title="Battery Mode"
                    value={
                      telemetry.batteryStatus === 'CHARGE'
                        ? 'Charging'
                        : telemetry.batteryStatus === 'DISCHARGE'
                        ? 'Discharging'
                        : 'Idle'
                    }
                    subtitle={
                      telemetry.batteryStatus === 'CHARGE'
                        ? `+${telemetry.chargePower ?? 0}W`
                        : telemetry.batteryStatus === 'DISCHARGE'
                        ? `-${telemetry.dischargePower ?? 0}W`
                        : '0W'
                    }
                    icon={
                      telemetry.batteryStatus === 'CHARGE'
                        ? '⚡'
                        : telemetry.batteryStatus === 'DISCHARGE'
                        ? '🔋'
                        : '⏸️'
                    }
                    accentColor={
                      batteryIsCharging ? Colors.blue : Colors.amber
                    }
                  />
                </View>
                <View style={[styles.statCell, { flex: 1, marginLeft: Spacing.sm }]}>
                  <StatusCard
                    title="Solar PV"
                    value={`${telemetry.pvPower ?? 0}W`}
                    subtitle="Generation"
                    icon="☀️"
                    accentColor={Colors.amberLight}
                  />
                </View>
              </View>
            </View>

            {/* Power Flow Diagram */}
            <View style={styles.section}>
              <View style={styles.flowCard}>
                <PowerFlowDiagram
                  gridOn={isGridOn}
                  pvPower={telemetry.pvPower}
                  batteryStatus={telemetry.batteryStatus}
                  usePower={telemetry.usePower}
                  wirePower={telemetry.wirePower}
                  batterySoc={telemetry.batterySoc}
                />
              </View>
            </View>

            {/* Raw data for diagnostics */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Live Data</Text>
              <View style={styles.rawCard}>
                {[
                  ['gridRelayStatus', telemetry.gridRelayStatus],
                  ['wireStatus', telemetry.wireStatus],
                  ['wirePower', `${telemetry.wirePower ?? 0} W`],
                  ['batteryStatus', telemetry.batteryStatus],
                  ['batterySoc', `${telemetry.batterySoc ?? 0}%`],
                  ['batteryBv', `${telemetry.batteryBv ?? 0} V`],
                  ['usePower', `${telemetry.usePower ?? 0} W`],
                  ['pvPower', `${telemetry.pvPower ?? 0} W`],
                ].map(([key, val]) => (
                  <View key={key} style={styles.rawRow}>
                    <Text style={styles.rawKey}>{key}</Text>
                    <Text
                      style={[
                        styles.rawVal,
                        key === 'gridRelayStatus' && {
                          color: val === 'on' ? Colors.success : Colors.danger,
                        },
                      ]}
                    >
                      {String(val ?? '—')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={{ height: Spacing['3xl'] }} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glassLight,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing['2xl'],
  },
  errorBanner: {
    backgroundColor: Colors.dangerGlow,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.base,
  },
  errorText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.dangerLight,
  },
  expoGoBanner: {
    backgroundColor: Colors.purpleGlow,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.purple + '44',
    padding: Spacing.md,
    marginBottom: Spacing.base,
  },
  expoGoBannerText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.purple,
    lineHeight: 18,
  },
  expoGoBannerLink: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.purple,
    textDecorationLine: 'underline',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['5xl'],
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.base,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.base,
    color: Colors.textMuted,
  },
  gridBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.base,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  gridBannerGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.successGlow,
  },
  gridBannerDot: {
    fontSize: 24,
    color: Colors.success,
  },
  gridBannerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
  },
  gridBannerSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.base,
  },
  sectionTitle: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  batteryCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  statsGrid: {
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statCell: {
    flex: 1,
  },
  flowCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.base,
    ...Shadows.card,
  },
  rawCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
  },
  rawRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  rawKey: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  rawVal: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
});
