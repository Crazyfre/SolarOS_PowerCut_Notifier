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
  Linking,
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
  const { telemetry, isFetching, fetchError, refreshTelemetry, lastFetchTime, updateInfo, settings } = useApp();
  const navigation = useNavigation<any>();
  const [outageStart, setOutageStart] = useState<number | null>(null);
  const [timeAgoStr, setTimeAgoStr] = useState('just now');

  // Load persisted outage start time
  React.useEffect(() => {
    Store.getOutageStartTime().then(setOutageStart);
  }, [telemetry]);

  const onRefresh = useCallback(async () => {
    await refreshTelemetry();
    const ts = await Store.getOutageStartTime();
    setOutageStart(ts);
  }, [refreshTelemetry]);

  // Keep track of time ago display
  React.useEffect(() => {
    const updateText = () => {
      if (lastFetchTime) {
        const diffSecs = Math.floor((Date.now() - lastFetchTime) / 1000);
        if (diffSecs < 10) setTimeAgoStr('just now');
        else if (diffSecs < 60) setTimeAgoStr(`${diffSecs}s ago`);
        else {
          const diffMins = Math.floor(diffSecs / 60);
          if (diffMins < 60) setTimeAgoStr(`${diffMins} min ago`);
          else setTimeAgoStr(new Date(lastFetchTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      } else {
        setTimeAgoStr('Connecting…');
      }
    };
    
    updateText();
    const interval = setInterval(updateText, 10000);
    return () => clearInterval(interval);
  }, [lastFetchTime]);

  const isGridOn = telemetry?.gridRelayStatus === 'on';
  const isOutage = telemetry?.gridRelayStatus === 'off';
  const batteryIsCharging = telemetry?.batteryStatus === 'CHARGE';
  const isAmoled = settings?.amoledTheme ?? false;

  const batteryCapacity = settings?.batteryCapacity ?? 5.12;

  const formatPower = (watts: number) => {
    return `${Math.round(watts)} W`;
  };

  const getBackupTimeText = () => {
    if (!telemetry) return '—';
    const soc = telemetry.batterySoc ?? 0;
    // load is usePower (house load) during outage, fallback to battery power or 300W
    const load = telemetry.usePower ?? Math.abs(telemetry.batteryPower ?? 0) ?? 300;
    const capacityWh = batteryCapacity * 1000;
    const usableEnergyWh = capacityWh * (soc / 100);
    const actualLoad = load > 0 ? load : 100;
    const hours = usableEnergyWh / actualLoad;
    const totalMins = Math.round(hours * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0) return `≈ ${h}h ${m}m`;
    return `≈ ${m}m`;
  };

  // Health indicators
  const getBatteryHealth = () => {
    const soc = telemetry?.batterySoc ?? 100;
    if (soc > 50) return 'Excellent';
    if (soc > 20) return 'Good';
    if (soc > 10) return 'Fair';
    return 'Critical';
  };

  const getGridHealth = () => {
    return isGridOn ? 'Stable' : 'Offline';
  };

  const getSolarHealth = () => {
    const pv = telemetry?.pvPower ?? 0;
    if (pv > 1000) return 'Producing Normally';
    if (pv > 0) return 'Low Sun';
    return 'No Sun';
  };

  return (
    <SafeAreaView style={[styles.root, isAmoled && { backgroundColor: '#000000' }]} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SolarGuard</Text>
          <Text style={styles.headerSub}>
            {lastFetchTime ? `Updated ${timeAgoStr}` : 'Connecting…'}
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

        {/* Update Available Banner */}
        {updateInfo?.updateAvailable && (
          <TouchableOpacity
            style={styles.updateBanner}
            onPress={() => Linking.openURL(updateInfo.releaseUrl).catch(() => {})}
            activeOpacity={0.8}
            testID="update-banner"
          >
            <View style={styles.updateBannerGlow} />
            <Text style={styles.updateBannerText}>
              🚀 A new update ({updateInfo.latestVersion}) is available!{' '}
              <Text style={styles.updateBannerLink}>Tap to download.</Text>
            </Text>
          </TouchableOpacity>
        )}

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
            {/* Smart Status Banner */}
            {(() => {
              if (!isOutage) {
                // Green: Grid Connected
                const isExporting = telemetry.wirePower < 0;
                const powerStr = formatPower(Math.abs(telemetry.wirePower));
                return (
                  <View style={[styles.gridBanner, { borderColor: Colors.success + '44' }, isAmoled && styles.bannerAmoled]}>
                    <View style={[styles.gridBannerGlow, { backgroundColor: Colors.successGlow }]} />
                    <Text style={[styles.gridBannerDot, { color: Colors.success }]}>🟢</Text>
                    <View>
                      <Text style={styles.gridBannerTitle}>Grid Connected</Text>
                      <Text style={styles.gridBannerSub}>
                        {isExporting ? `Exporting ${powerStr}` : telemetry.wirePower > 0 ? `Importing ${powerStr}` : 'Standby'}
                      </Text>
                    </View>
                  </View>
                );
              } else {
                const warningThreshold = settings?.batteryWarningThreshold ?? 20;
                const isCritical = (telemetry.batterySoc ?? 100) <= warningThreshold;
                if (isCritical) {
                  // Red: Battery Critical
                  return (
                    <View style={[styles.gridBanner, { borderColor: Colors.danger + '44' }, isAmoled && styles.bannerAmoled]}>
                      <View style={[styles.gridBannerGlow, { backgroundColor: Colors.dangerGlow }]} />
                      <Text style={[styles.gridBannerDot, { color: Colors.danger }]}>🔴</Text>
                      <View>
                        <Text style={styles.gridBannerTitle}>Battery Critical</Text>
                        <Text style={styles.gridBannerSub}>
                          {telemetry.batterySoc}% SOC · Estimated remaining {getBackupTimeText()}
                        </Text>
                      </View>
                    </View>
                  );
                } else {
                  // Yellow: Running on Battery
                  return (
                    <View style={[styles.gridBanner, { borderColor: Colors.amber + '44' }, isAmoled && styles.bannerAmoled]}>
                      <View style={[styles.gridBannerGlow, { backgroundColor: Colors.warningGlow }]} />
                      <Text style={[styles.gridBannerDot, { color: Colors.amber }]}>🟡</Text>
                      <View>
                        <Text style={styles.gridBannerTitle}>Running on Battery</Text>
                        <Text style={styles.gridBannerSub}>
                          Remaining {getBackupTimeText()}
                        </Text>
                      </View>
                    </View>
                  );
                }
              }
            })()}

            {/* Battery Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Battery</Text>
              <View style={[styles.batteryCard, isAmoled && styles.cardAmoled]}>
                <BatteryBar
                  soc={telemetry.batterySoc ?? 0}
                  voltage={telemetry.batteryBv}
                  isCharging={batteryIsCharging}
                  large
                  estimatedBackupText={getBackupTimeText()}
                  amoled={isAmoled}
                />
              </View>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statsRow}>
                <View style={[styles.statCell, { flex: 1, marginRight: Spacing.sm }]}>
                  <StatusCard
                    title="Grid"
                    value={isGridOn ? 'Connected' : 'OFFLINE'}
                    subtitle={
                      !isGridOn
                        ? 'Power cut active'
                        : `Flow: ${formatPower(Math.abs(telemetry.wirePower))} · Today: ↓${(telemetry.buyValue ?? 0).toFixed(1)} ↑${(telemetry.gridValue ?? 0).toFixed(1)} kWh`
                    }
                    icon={isGridOn ? '🔌' : '🚫'}
                    accentColor={isGridOn ? Colors.success : Colors.danger}
                    amoled={isAmoled}
                  />
                </View>
                <View style={[styles.statCell, { flex: 1, marginLeft: Spacing.sm }]}>
                  <StatusCard
                    title="House Load"
                    value={formatPower(telemetry.usePower ?? 0)}
                    subtitle={`Today: ${(telemetry.useValue ?? 0).toFixed(1)} kWh`}
                    icon="🏠"
                    accentColor={Colors.amber}
                    amoled={isAmoled}
                  />
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={[styles.statCell, { flex: 1, marginRight: Spacing.sm }]}>
                  <StatusCard
                    title="Battery Status"
                    value={
                      telemetry.batteryStatus === 'CHARGE'
                        ? '▲ Charging'
                        : telemetry.batteryStatus === 'DISCHARGE'
                        ? '▼ Discharging'
                        : 'Idle'
                    }
                    subtitle={
                      telemetry.batteryStatus === 'CHARGE'
                        ? `+${formatPower(Math.abs(telemetry.batteryPower ?? 0))} · Today: ${(telemetry.chargeValue ?? 0).toFixed(1)} kWh`
                        : telemetry.batteryStatus === 'DISCHARGE'
                        ? `-${formatPower(Math.abs(telemetry.batteryPower ?? 0))} · Today: ${(telemetry.dischargeValue ?? 0).toFixed(1)} kWh`
                        : `0 W · Today: ${(telemetry.chargeValue ?? 0).toFixed(1)} kWh`
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
                    amoled={isAmoled}
                  />
                </View>
                <View style={[styles.statCell, { flex: 1, marginLeft: Spacing.sm }]}>
                  <StatusCard
                    title="Solar PV"
                    value={formatPower(telemetry.pvPower ?? 0)}
                    subtitle={`Today: ${(telemetry.generationValue ?? 0).toFixed(1)} kWh`}
                    icon="☀️"
                    accentColor={Colors.amberLight}
                    amoled={isAmoled}
                  />
                </View>
              </View>
            </View>

            {/* Power Flow Diagram */}
            <View style={styles.section}>
              <View style={[styles.flowCard, isAmoled && styles.cardAmoled]}>
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

            {/* Health Indicators */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>System Health</Text>
              <View style={[styles.healthCard, isAmoled && styles.cardAmoled]}>
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Battery</Text>
                  <Text style={[styles.healthValue, { color: getBatteryHealth() === 'Critical' ? Colors.danger : Colors.success }]}>
                    {getBatteryHealth()} ({telemetry.batterySoc}%)
                  </Text>
                </View>
                <View style={styles.separator} />
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Grid Connection</Text>
                  <Text style={[styles.healthValue, { color: isGridOn ? Colors.success : Colors.danger }]}>
                    {getGridHealth()}
                  </Text>
                </View>
                <View style={styles.separator} />
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Solar PV Production</Text>
                  <Text style={[styles.healthValue, { color: telemetry.pvPower && telemetry.pvPower > 0 ? Colors.success : Colors.textMuted }]}>
                    {getSolarHealth()}
                  </Text>
                </View>
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
                  ['batteryPower', `${telemetry.batteryPower ?? 0} W`],
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
  updateBanner: {
    backgroundColor: Colors.blueGlow,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.blue + '44',
    padding: Spacing.md,
    marginBottom: Spacing.base,
    position: 'relative',
    overflow: 'hidden',
  },
  updateBannerGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.blue + '08',
  },
  updateBannerText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.blueLight,
    lineHeight: 18,
  },
  updateBannerLink: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.blueLight,
    textDecorationLine: 'underline',
  },
  rawVal: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  bannerAmoled: {
    backgroundColor: '#000000',
    borderColor: '#222',
  },
  cardAmoled: {
    backgroundColor: '#000000',
    borderColor: '#222',
  },
  healthCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.base,
    ...Shadows.card,
  },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  healthLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  healthValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.xs,
  },
});
