import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme, Typography, Spacing, PAGE_GUTTER } from '../theme';
import { StatusCard } from '../components/StatusCard';
import { PowerFlowDiagram } from '../components/PowerFlowDiagram';
import { useNavigation } from '@react-navigation/native';
import { Store } from '../storage/secureStore';
import { isRunningInExpoGo } from '../services/notifications';
import { GeofenceStore } from '../storage/geofenceStore';
import OutageAlarm from '../../modules/outage-alarm';
import {
  ScreenHeader,
  HeaderAction,
  Banner,
  BannerVariant,
  SectionHeader,
  Card,
  Badge,
  Gauge,
  StatusDot,
  Button,
} from '../components/ui';
import {
  Settings,
  TriangleAlert,
  Rocket,
  Smartphone,
  Radio,
  PlugZap,
  CircleOff,
  BatteryCharging,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
  BatteryFull,
  PanelTop,
  ChevronDown,
  ChevronRight,
  House,
  SunMedium,
  CircleCheckBig,
  LogOut,
} from 'lucide-react-native';

function formatPower(watts: number): string {
  return `${Math.round(watts)} W`;
}

export function DashboardScreen() {
  const { telemetry, isFetching, fetchError, refreshTelemetry, lastFetchTime, updateInfo, settings, logout } = useApp();
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [outageStart, setOutageStart] = useState<number | null>(null);
  const [timeAgoStr, setTimeAgoStr] = useState('just now');
  const [nowTick, setNowTick] = useState(Date.now());
  const [diagExpanded, setDiagExpanded] = useState(false);
  const [zoneState, setZoneState] = useState<{ inside: boolean | null } | null>(null);

  const isGridOn = telemetry?.gridRelayStatus === 'on';
  const isOutage = telemetry?.gridRelayStatus === 'off';
  const batteryIsCharging = telemetry?.batteryStatus === 'CHARGE';
  const warningThreshold = settings?.batteryWarningThreshold ?? 20;
  const isCritical = isOutage && (telemetry?.batterySoc ?? 100) <= warningThreshold;
  const isGeofenced = settings?.monitoringMode === 'geofenced' && !!settings?.homeZone;

  // Load geofence inside/outside state (location-aware monitoring)
  useEffect(() => {
    if (!isGeofenced) {
      setZoneState(null);
      return;
    }
    let active = true;
    const load = async () => {
      const state = await GeofenceStore.getState();
      if (active) setZoneState({ inside: state.inside });
    };
    load();
    const interval = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isGeofenced, telemetry]);

  // ─── Outage start time + live tick (elapsed timer + "updated X ago") ───

  useEffect(() => {
    Store.getOutageStartTime().then(setOutageStart);
  }, [telemetry]);

  const onRefresh = useCallback(async () => {
    await refreshTelemetry();
    const ts = await Store.getOutageStartTime();
    setOutageStart(ts);
  }, [refreshTelemetry]);

  useEffect(() => {
    const update = () => {
      setNowTick(Date.now());
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
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [lastFetchTime]);

  // ─── Derived values ──────────────────────────────────────────────────────

  const batteryCapacity = settings?.batteryCapacity ?? 5.12;

  const getBackupTimeText = (): string => {
    if (!telemetry) return '—';
    const soc = telemetry.batterySoc ?? 0;
    const load = telemetry.usePower ?? Math.abs(telemetry.batteryPower ?? 0) ?? 300;
    const capacityWh = batteryCapacity * 1000;
    const usableEnergyWh = capacityWh * (soc / 100);
    const actualLoad = load > 0 ? load : 100;
    const hours = usableEnergyWh / actualLoad;
    const totalMins = Math.round(hours * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const getElapsedOutageText = (): string => {
    if (!outageStart) return '—';
    const secs = Math.max(0, Math.floor((nowTick - outageStart) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const getBatteryHealth = () => {
    const soc = telemetry?.batterySoc ?? 100;
    if (soc > 50) return 'Excellent';
    if (soc > 20) return 'Good';
    if (soc > 10) return 'Fair';
    return 'Critical';
  };

  const getSolarHealth = () => {
    const pv = telemetry?.pvPower ?? 0;
    if (pv > 1000) return 'Producing';
    if (pv > 0) return 'Low Sun';
    return 'No Sun';
  };

  // ─── Banner priority resolution (exactly one slot) ────────────────────────

  const resolveBanner = (): {
    variant: BannerVariant;
    title: string;
    subtitle?: string;
    metrics?: { label: string; value: string }[];
    actions?: { label: string; onPress: () => void }[];
    onPress?: () => void;
    infoTone?: 'info' | 'brand';
  } | null => {
    if (telemetry && isCritical) {
      return {
        variant: 'critical',
        title: 'Battery Critical',
        subtitle: 'Grid offline — battery below warning threshold.',
        metrics: [
          { label: 'Elapsed', value: getElapsedOutageText() },
          { label: 'Charge', value: `${telemetry.batterySoc ?? 0}%` },
          { label: 'Remaining', value: getBackupTimeText() },
        ],
        actions: [
          {
            label: 'Silence Alarm',
            onPress: () => {
              try { OutageAlarm.stopAlarm(); } catch {}
            },
          },
        ],
      };
    }
    if (telemetry && isOutage) {
      return {
        variant: 'battery',
        title: 'Running on Battery',
        subtitle: isGeofenced && zoneState?.inside === false
          ? 'Grid offline — you are outside your home zone, alarm is notification-only.'
          : 'Grid offline — the house is running on stored energy.',
        metrics: [
          { label: 'Elapsed', value: getElapsedOutageText() },
          { label: 'Charge', value: `${telemetry.batterySoc ?? 0}%` },
          { label: 'Remaining', value: getBackupTimeText() },
        ],
      };
    }
    if (telemetry && isGridOn) {
      const wire = telemetry.wirePower ?? 0;
      const isExporting = wire < 0;
      const powerStr = formatPower(Math.abs(wire));
      return {
        variant: 'connected',
        title: 'Grid Connected',
        subtitle: isExporting
          ? `Exporting ${powerStr} to grid`
          : wire > 0
            ? `Importing ${powerStr} from grid`
            : 'Standing by',
      };
    }
    if (fetchError) {
      const isAuth = fetchError.includes('Session expired');
      return {
        variant: 'error',
        title: isAuth ? 'Login Required' : 'Connection Issue',
        subtitle: fetchError,
        actions: isAuth
          ? [{ label: 'Sign In', onPress: () => logout() }]
          : undefined,
      };
    }
    if (updateInfo?.updateAvailable) {
      return {
        variant: 'info',
        title: 'Update Available',
        subtitle: `Version ${updateInfo.latestVersion} is ready to install.`,
        onPress: () => Linking.openURL(updateInfo.releaseUrl).catch(() => {}),
      };
    }
    if (isRunningInExpoGo()) {
      return {
        variant: 'info',
        infoTone: 'brand',
        title: 'Running in Expo Go',
        subtitle: 'Push notifications are disabled — use a dev build for full alarm functionality.',
      };
    }
    return null;
  };

  const banner = resolveBanner();

  // Battery state helpers for the stats grid
  const batteryIcon = (() => {
    const soc = telemetry?.batterySoc ?? 100;
    const c = batteryIsCharging ? colors.charge : telemetry?.batteryStatus === 'DISCHARGE' ? colors.discharge : colors.textSecondary;
    if (batteryIsCharging) return <BatteryCharging size={18} color={c} strokeWidth={2} />;
    if (soc > 80) return <BatteryFull size={18} color={c} strokeWidth={2} />;
    if (soc > 30) return <BatteryMedium size={18} color={c} strokeWidth={2} />;
    if (soc > 10) return <BatteryLow size={18} color={c} strokeWidth={2} />;
    return <BatteryWarning size={18} color={c} strokeWidth={2} />;
  })();

  const rawRows: [string, string][] = telemetry
    ? [
        ['gridRelayStatus', telemetry.gridRelayStatus],
        ['wireStatus', telemetry.wireStatus ?? '—'],
        ['wirePower', `${telemetry.wirePower ?? 0} W`],
        ['batteryStatus', telemetry.batteryStatus],
        ['batterySoc', `${telemetry.batterySoc ?? 0}%`],
        ['batteryBv', `${telemetry.batteryBv ?? 0} V`],
        ['batteryPower', `${telemetry.batteryPower ?? 0} W`],
        ['usePower', `${telemetry.usePower ?? 0} W`],
        ['pvPower', `${telemetry.pvPower ?? 0} W`],
      ]
    : [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="SolarGuard"
        subtitle={lastFetchTime ? `Updated ${timeAgoStr}` : 'Connecting…'}
        right={
          <View style={styles.headerActions}>
            {isFetching ? (
              <ActivityIndicator size="small" color={colors.brand} style={{ marginRight: Spacing.sm }} />
            ) : null}
            <HeaderAction
              onPress={() => navigation.navigate('Settings')}
              icon={<Settings size={20} color={colors.textPrimary} strokeWidth={2} />}
              accessibilityLabel="Settings"
              testID="settings-button"
            />
          </View>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      >
        {/* No data yet */}
        {!telemetry && !fetchError && !isFetching ? (
          <View style={styles.emptyState}>
            <Radio size={48} color={colors.textDisabled} style={{ marginBottom: Spacing.base }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Fetching inverter data…
            </Text>
          </View>
        ) : null}

        {/* Single-slot status banner */}
        {banner ? (
          <View style={styles.bannerWrap} key={banner.variant + banner.title}>
            <Banner
              variant={banner.variant}
              title={banner.title}
              subtitle={banner.subtitle}
              metrics={'metrics' in banner ? banner.metrics : undefined}
              actions={banner.actions}
              onPress={banner.onPress}
              infoTone={banner.infoTone}
              testID="status-banner"
            />
          </View>
        ) : null}

        {telemetry ? (
          <>
            {/* Power flow — the hero instrument */}
            <SectionHeader title="Power Flow" />
            <Card style={styles.flowCard}>
              <PowerFlowDiagram
                gridOn={!!isGridOn}
                pvPower={telemetry.pvPower}
                batteryStatus={telemetry.batteryStatus}
                usePower={telemetry.usePower}
                wirePower={telemetry.wirePower}
                batterySoc={telemetry.batterySoc}
              />
            </Card>

            {/* Battery + backup estimate */}
            <SectionHeader title="Battery" right={<Badge label={`${getBackupTimeText()} left`} tone={(telemetry.batterySoc ?? 0) <= warningThreshold ? 'danger' : 'neutral'} />} />
            <Card>
              <View style={styles.batteryTop}>
                <View style={styles.batteryId}>
                  {batteryIsCharging ? (
                    <BatteryCharging size={20} color={colors.charge} strokeWidth={2} />
                  ) : telemetry.batteryStatus === 'DISCHARGE' ? (
                    <BatteryMedium size={20} color={colors.discharge} strokeWidth={2} />
                  ) : (
                    <BatteryMedium size={20} color={colors.textSecondary} strokeWidth={2} />
                  )}
                  <Text style={[styles.batteryState, { color: colors.textPrimary }]}>
                    {telemetry.batteryStatus === 'CHARGE'
                      ? 'Charging'
                      : telemetry.batteryStatus === 'DISCHARGE'
                        ? 'Discharging'
                        : 'Idle'}
                  </Text>
                  {(telemetry.batterySoc ?? 0) <= warningThreshold && (
                    <Badge label="Low" tone="danger" />
                  )}
                </View>
                <Text style={[styles.batteryVoltage, { color: colors.textSecondary }]}>
                  {telemetry.batteryBv ?? 0} V
                </Text>
              </View>
              <View style={styles.batteryReadout}>
                <Text style={[styles.batteryPercent, { color: colors.textPrimary }]}>
                  {Math.round(telemetry.batterySoc ?? 0)}
                  <Text style={[styles.batteryPercentUnit, { color: colors.textSecondary }]}>%</Text>
                </Text>
                <Text style={[styles.batteryPowerText, { color: batteryIsCharging ? colors.chargeText : colors.dischargeText }]}>
                  {telemetry.batteryStatus === 'IDLE'
                    ? '0 W'
                    : `${telemetry.batteryStatus === 'CHARGE' ? '+' : '−'}${formatPower(Math.abs(telemetry.batteryPower ?? 0))}`}
                </Text>
              </View>
              <Gauge value={telemetry.batterySoc ?? 0} />
            </Card>

            {/* Stats grid 2×2 */}
            <SectionHeader title="Telemetry" />
            <View style={styles.statsGrid}>
              <View style={styles.statsRow}>
                <StatusCard
                  title="Grid"
                  value={isGridOn ? 'Connected' : 'OFFLINE'}
                  subtitle={
                    !isGridOn
                      ? 'Power cut active'
                      : `Today ↓${(telemetry.buyValue ?? 0).toFixed(1)} ↑${(telemetry.gridValue ?? 0).toFixed(1)} kWh`
                  }
                  tone={isGridOn ? 'success' : 'danger'}
                  live={isGridOn}
                  large
                  testID="card-grid"
                />
              </View>
              <View style={styles.statsRow}>
                <StatusCard
                  title="House Load"
                  value={formatPower(telemetry.usePower ?? 0)}
                  subtitle={`Today: ${(telemetry.useValue ?? 0).toFixed(1)} kWh`}
                  numeric
                  icon={<House size={16} color={colors.textSecondary} strokeWidth={2} />}
                  testID="card-load"
                />
              </View>
              <View style={styles.statsRow}>
                <StatusCard
                  title="Battery"
                  value={
                    telemetry.batteryStatus === 'CHARGE'
                      ? 'Charging'
                      : telemetry.batteryStatus === 'DISCHARGE'
                        ? 'Discharging'
                        : 'Idle'
                  }
                  subtitle={
                    telemetry.batteryStatus === 'CHARGE'
                      ? `+${formatPower(Math.abs(telemetry.batteryPower ?? 0))} · Today: ${(telemetry.chargeValue ?? 0).toFixed(1)} kWh`
                      : telemetry.batteryStatus === 'DISCHARGE'
                        ? `−${formatPower(Math.abs(telemetry.batteryPower ?? 0))} · Today: ${(telemetry.dischargeValue ?? 0).toFixed(1)} kWh`
                        : `0 W · Today: ${(telemetry.chargeValue ?? 0).toFixed(1)} kWh`
                  }
                  tone={batteryIsCharging ? 'info' : telemetry.batteryStatus === 'DISCHARGE' ? 'discharge' : 'neutral'}
                  icon={batteryIcon}
                  testID="card-battery"
                />
              </View>
              <View style={styles.statsRow}>
                <StatusCard
                  title="Solar PV"
                  value={formatPower(telemetry.pvPower ?? 0)}
                  subtitle={`Today: ${(telemetry.generationValue ?? 0).toFixed(1)} kWh`}
                  tone="brand"
                  live={(telemetry.pvPower ?? 0) > 0}
                  numeric
                  icon={<SunMedium size={16} color={(telemetry.pvPower ?? 0) > 0 ? colors.brand : colors.textDisabled} strokeWidth={2} />}
                  testID="card-solar"
                />
              </View>
            </View>

            {/* System health strip */}
            <SectionHeader title="System Health" />
            <Card>
              {isGeofenced ? (
                <>
                  <View style={styles.healthRow}>
                    <Text style={[styles.healthLabel, { color: colors.textSecondary }]}>Location</Text>
                    <View style={styles.healthValue}>
                      <StatusDot
                        size={7}
                        color={zoneState?.inside === false ? colors.warning : colors.success}
                        mode="breathing"
                      />
                      <Text
                        style={[
                          styles.healthText,
                          {
                            color:
                              zoneState?.inside === false
                                ? colors.warningText
                                : colors.successText,
                          },
                        ]}
                      >
                        {zoneState?.inside === false ? 'Outside home zone' : 'Inside home zone'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.healthDivider, { backgroundColor: colors.divider }]} />
                </>
              ) : null}
              <View style={styles.healthRow}>
                <Text style={[styles.healthLabel, { color: colors.textSecondary }]}>Battery</Text>
                <View style={styles.healthValue}>
                  <StatusDot
                    size={7}
                    color={getBatteryHealth() === 'Critical' ? colors.danger : colors.success}
                    mode={getBatteryHealth() === 'Critical' ? 'flashing' : 'steady'}
                  />
                  <Text
                    style={[
                      styles.healthText,
                      { color: getBatteryHealth() === 'Critical' ? colors.dangerText : colors.successText },
                    ]}
                  >
                    {getBatteryHealth()} · {telemetry.batterySoc ?? 0}%
                  </Text>
                </View>
              </View>
              <View style={[styles.healthDivider, { backgroundColor: colors.divider }]} />
              <View style={styles.healthRow}>
                <Text style={[styles.healthLabel, { color: colors.textSecondary }]}>Grid Connection</Text>
                <View style={styles.healthValue}>
                  <StatusDot size={7} color={isGridOn ? colors.success : colors.danger} mode="steady" />
                  <Text style={[styles.healthText, { color: isGridOn ? colors.successText : colors.dangerText }]}>
                    {isGridOn ? 'Stable' : 'Offline'}
                  </Text>
                </View>
              </View>
              <View style={[styles.healthDivider, { backgroundColor: colors.divider }]} />
              <View style={styles.healthRow}>
                <Text style={[styles.healthLabel, { color: colors.textSecondary }]}>Solar Production</Text>
                <View style={styles.healthValue}>
                  <StatusDot
                    size={7}
                    color={(telemetry.pvPower ?? 0) > 1000 ? colors.success : (telemetry.pvPower ?? 0) > 0 ? colors.warning : colors.textDisabled}
                    mode="steady"
                  />
                  <Text
                    style={[
                      styles.healthText,
                      {
                        color:
                          (telemetry.pvPower ?? 0) > 1000
                            ? colors.successText
                            : (telemetry.pvPower ?? 0) > 0
                              ? colors.warningText
                              : colors.textSecondary,
                      },
                    ]}
                  >
                    {getSolarHealth()}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Raw diagnostics drawer — power-user surface, collapsed by default */}
            <TouchableOpacity
              onPress={() => setDiagExpanded(!diagExpanded)}
              accessibilityRole="button"
              accessibilityLabel="Toggle raw telemetry"
              style={styles.diagToggle}
            >
              <Text style={[styles.diagToggleLabel, { color: colors.textSecondary }]}>
                Live Data
              </Text>
              {diagExpanded ? (
                <ChevronDown size={16} color={colors.textSecondary} />
              ) : (
                <ChevronRight size={16} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
            {diagExpanded ? (
              <Card style={styles.diagCard}>
                {rawRows.map(([key, val]) => (
                  <View key={key} style={styles.rawRow}>
                    <Text style={[styles.rawKey, { color: colors.textSecondary }]}>{key}</Text>
                    <Text
                      style={[
                        styles.rawVal,
                        { color: colors.textPrimary },
                        key === 'gridRelayStatus' && {
                          color: val === 'on' ? colors.successText : colors.dangerText,
                        },
                      ]}
                    >
                      {val}
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <View style={{ height: Spacing['3xl'] }} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: PAGE_GUTTER,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerWrap: {
    marginBottom: Spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['5xl'],
  },
  emptyText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.base,
  },
  flowCard: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  batteryId: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  batteryState: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.base,
  },
  batteryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  batteryVoltage: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
  batteryReadout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  batteryPercent: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize['3xl'],
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  batteryPercentUnit: {
    fontSize: Typography.fontSize.xl,
  },
  batteryPowerText: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.base,
    fontVariant: ['tabular-nums'],
  },
  statsGrid: {
    gap: Spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
  },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
  },
  healthLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
  },
  healthValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  healthText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
  },
  healthDivider: {
    height: 1,
    marginVertical: 2,
  },
  diagToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    minHeight: 44,
  },
  diagToggleLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    letterSpacing: Typography.tracking.label,
    textTransform: 'uppercase',
  },
  diagCard: {
    paddingVertical: Spacing.sm,
  },
  rawRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: Spacing.xs,
  },
  rawKey: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
  },
  rawVal: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
    fontVariant: ['tabular-nums'],
  },
});
