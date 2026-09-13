import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useTheme, Typography, Spacing, PAGE_GUTTER } from '../theme';
import { useApp } from '../context/AppContext';
import {
  ScreenHeader,
  SectionHeader,
  Card,
  Button,
} from '../components/ui';
import {
  SunMedium,
  House,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  Download,
  BatteryCharging,
  Battery,
  PiggyBank,
} from 'lucide-react-native';
import { ReportGenerator } from '../services/reportGenerator';
import { FinancialEngine } from '../services/financialEngine';

/**
 * MAPPING OF TELEMETRY TO SOLAROS SYSTEM API FIELDS:
 *
 * 1. Today's Statistics:
 *    - Solar Today: telemetry.generationValue (Today's Solar Generation in kWh)
 *    - Grid Import: telemetry.buyValue (Today's Grid Energy Imported in kWh)
 *    - Grid Export: telemetry.gridValue (Today's Energy Exported to Grid in kWh)
 *    - Consumption: telemetry.useValue (Today's Energy Consumed by house in kWh)
 *    - Battery Charge: telemetry.chargeValue (Today's Battery Charge Energy in kWh)
 *    - Battery Discharge: telemetry.dischargeValue (Today's Battery Discharge Energy in kWh)
 *
 * 2. Monthly Statistics: same fields with *Month suffix
 * 3. Lifetime Statistics: same fields with *Total suffix
 */

type MetricTone = 'brand' | 'success' | 'danger' | 'info' | 'discharge' | 'neutral';

function toneColors(tone: MetricTone, c: ReturnType<typeof useTheme>['colors']) {
  switch (tone) {
    case 'brand': return c.brandBright;
    case 'success': return c.successText;
    case 'danger': return c.dangerText;
    case 'info': return c.chargeText;
    case 'discharge': return c.dischargeText;
    default: return c.textPrimary;
  }
}

interface MetricDef {
  title: string;
  value?: number;
  icon: React.ReactNode;
  tone: MetricTone;
}

function MetricTile({ title, value, icon, tone }: MetricDef) {
  const { colors } = useTheme();
  const color = toneColors(tone, colors);

  const formatKwh = (val?: number) => {
    if (val === undefined || val === null) return '0.0';
    return val.toFixed(1);
  };

  return (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: colors.surface1, borderColor: colors.border },
      ]}
    >
      <View style={styles.metricHeader}>
        {icon}
        <Text style={[styles.metricTitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.metricValueRow}>
        <Text style={[styles.metricValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatKwh(value)}
        </Text>
        <Text style={[styles.metricUnit, { color: colors.textSecondary }]}>kWh</Text>
      </View>
    </View>
  );
}

function Accordion({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title} section`}
        style={[
          styles.accordionHeader,
          { backgroundColor: colors.surface1, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.accordionTitle, { color: colors.textPrimary }]}>{title}</Text>
        <ChevronDown
          size={18}
          color={colors.textSecondary}
          strokeWidth={2}
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>
      {expanded ? <View style={styles.accordionBody}>{children}</View> : null}
    </>
  );
}

export function AnalyticsScreen() {
  const { settings, telemetry } = useApp();
  const { colors } = useTheme();
  const [isGenerating, setIsGenerating] = useState(false);

  // Collapsible accordion states
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [monthlyExpanded, setMonthlyExpanded] = useState(false);
  const [lifetimeExpanded, setLifetimeExpanded] = useState(false);

  // Financial summary — the engine already computes it; surface it instead of console
  const savings = useMemo(() => {
    if (!telemetry) return null;
    const importRate = settings?.tariffImportRate ?? 7.5;
    const exportRate = settings?.tariffExportRate ?? 5.0;
    return FinancialEngine.summarize(telemetry, importRate, exportRate);
  }, [telemetry, settings?.tariffImportRate, settings?.tariffExportRate]);

  const handleDownloadReport = async () => {
    setIsGenerating(true);
    try {
      const stationName = settings?.activeStationId ? `Station ${settings.activeStationId}` : 'SolarGuard Plant';
      await ReportGenerator.generateAndShareMonthlyReport(telemetry, settings, stationName);
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Unable to generate monthly report.');
    } finally {
      setIsGenerating(false);
    }
  };

  const icon = (el: React.ReactNode) => el;

  const todayMetrics: MetricDef[] = [
    { title: 'Solar Generated', value: telemetry?.generationValue, tone: 'brand', icon: icon(<SunMedium size={15} color={colors.brandBright} strokeWidth={2} />) },
    { title: 'House Consumed', value: telemetry?.useValue, tone: 'neutral', icon: icon(<House size={15} color={colors.textSecondary} strokeWidth={2} />) },
    { title: 'Grid Exported', value: telemetry?.gridValue, tone: 'success', icon: icon(<ArrowUpRight size={15} color={colors.successText} strokeWidth={2} />) },
    { title: 'Grid Imported', value: telemetry?.buyValue, tone: 'danger', icon: icon(<ArrowDownLeft size={15} color={colors.dangerText} strokeWidth={2} />) },
    { title: 'Battery Charged', value: telemetry?.chargeValue, tone: 'info', icon: icon(<BatteryCharging size={15} color={colors.chargeText} strokeWidth={2} />) },
    { title: 'Battery Discharged', value: telemetry?.dischargeValue, tone: 'discharge', icon: icon(<Battery size={15} color={colors.dischargeText} strokeWidth={2} />) },
  ];

  const monthlyMetrics: MetricDef[] = [
    { title: 'Solar Generated', value: telemetry?.generationMonth, tone: 'brand', icon: icon(<SunMedium size={15} color={colors.brandBright} strokeWidth={2} />) },
    { title: 'Energy Consumed', value: telemetry?.useMonth, tone: 'neutral', icon: icon(<House size={15} color={colors.textSecondary} strokeWidth={2} />) },
    { title: 'Grid Exported', value: telemetry?.gridMonth, tone: 'success', icon: icon(<ArrowUpRight size={15} color={colors.successText} strokeWidth={2} />) },
    { title: 'Grid Imported', value: telemetry?.buyMonth, tone: 'danger', icon: icon(<ArrowDownLeft size={15} color={colors.dangerText} strokeWidth={2} />) },
    { title: 'Battery Charged', value: telemetry?.chargeMonth, tone: 'info', icon: icon(<BatteryCharging size={15} color={colors.chargeText} strokeWidth={2} />) },
    { title: 'Battery Discharged', value: telemetry?.dischargeMonth, tone: 'discharge', icon: icon(<Battery size={15} color={colors.dischargeText} strokeWidth={2} />) },
  ];

  const lifetimeMetrics: MetricDef[] = [
    { title: 'Solar Generated', value: telemetry?.generationTotal, tone: 'brand', icon: icon(<SunMedium size={15} color={colors.brandBright} strokeWidth={2} />) },
    { title: 'Total Consumed', value: telemetry?.useTotal, tone: 'neutral', icon: icon(<House size={15} color={colors.textSecondary} strokeWidth={2} />) },
    { title: 'Grid Exported', value: telemetry?.gridTotal, tone: 'success', icon: icon(<ArrowUpRight size={15} color={colors.successText} strokeWidth={2} />) },
    { title: 'Grid Imported', value: telemetry?.buyTotal, tone: 'danger', icon: icon(<ArrowDownLeft size={15} color={colors.dangerText} strokeWidth={2} />) },
    { title: 'Battery Charged', value: telemetry?.chargeTotal, tone: 'info', icon: icon(<BatteryCharging size={15} color={colors.chargeText} strokeWidth={2} />) },
    { title: 'Battery Discharged', value: telemetry?.dischargeTotal, tone: 'discharge', icon: icon(<Battery size={15} color={colors.dischargeText} strokeWidth={2} />) },
  ];

  const metricGrid = (metrics: MetricDef[]) => (
    <View style={styles.grid}>
      {metrics.map((m) => (
        <MetricTile key={m.title} {...m} />
      ))}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Analytics" subtitle="Energy generation & usage insights" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Savings hero — previously computed but only logged to console */}
        {savings ? (
          <Card style={styles.savingsCard}>
            <View style={styles.savingsHeader}>
              <PiggyBank size={16} color={colors.successText} strokeWidth={2} />
              <Text style={[styles.savingsLabel, { color: colors.textSecondary }]}>
                Estimated Savings
              </Text>
            </View>
            <View style={styles.savingsRow}>
              <View style={styles.savingsCol}>
                <Text style={[styles.savingsValue, { color: colors.textPrimary }]}>
                  ₹{savings.today.netSavings.toFixed(0)}
                </Text>
                <Text style={[styles.savingsSub, { color: colors.textSecondary }]}>Today</Text>
              </View>
              <View style={styles.savingsDivider} />
              <View style={styles.savingsCol}>
                <Text style={[styles.savingsValue, { color: colors.textPrimary }]}>
                  ₹{savings.monthly.netSavings.toFixed(0)}
                </Text>
                <Text style={[styles.savingsSub, { color: colors.textSecondary }]}>This Month</Text>
              </View>
              <View style={styles.savingsDivider} />
              <View style={styles.savingsCol}>
                <Text style={[styles.savingsValue, { color: colors.textPrimary }]}>
                  ₹{savings.lifetime.netSavings.toFixed(0)}
                </Text>
                <Text style={[styles.savingsSub, { color: colors.textSecondary }]}>Lifetime</Text>
              </View>
            </View>
          </Card>
        ) : null}

        <SectionHeader title="Reports" />
        <Button
          label={isGenerating ? 'Compiling Report…' : 'Download Monthly Report'}
          onPress={handleDownloadReport}
          disabled={isGenerating}
          loading={isGenerating}
          icon={!isGenerating ? <Download size={16} color={colors.textInverse} strokeWidth={2} /> : undefined}
          full
        />

        <View style={styles.accordions}>
          <Accordion title="Today's Statistics" expanded={todayExpanded} onToggle={() => setTodayExpanded(!todayExpanded)}>
            {metricGrid(todayMetrics)}
          </Accordion>

          <Accordion title="Monthly Summary" expanded={monthlyExpanded} onToggle={() => setMonthlyExpanded(!monthlyExpanded)}>
            {metricGrid(monthlyMetrics)}
          </Accordion>

          <Accordion title="Lifetime Statistics" expanded={lifetimeExpanded} onToggle={() => setLifetimeExpanded(!lifetimeExpanded)}>
            {metricGrid(lifetimeMetrics)}
          </Accordion>
        </View>

        {!telemetry ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Waiting for telemetry data…
            </Text>
          </View>
        ) : null}

        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    padding: PAGE_GUTTER,
    paddingBottom: Spacing['2xl'],
  },
  savingsCard: {
    marginBottom: Spacing.lg,
  },
  savingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  savingsLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savingsCol: {
    flex: 1,
    alignItems: 'center',
  },
  savingsDivider: {
    width: 1,
    alignSelf: 'stretch',
    opacity: 0.5,
  },
  savingsValue: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize.xl,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  savingsSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    marginTop: 2,
  },
  accordions: {
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 52,
  },
  accordionTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  accordionBody: {
    marginTop: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metricCard: {
    width: '48.5%',
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.md,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
    minHeight: 18,
  },
  metricTitle: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    flex: 1,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  metricValue: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.lg,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  metricUnit: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['4xl'],
    gap: Spacing.base,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
  },
});
