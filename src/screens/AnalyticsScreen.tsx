import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../theme';
import { useApp } from '../context/AppContext';
import {
  SunMedium,
  House,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Battery,
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
 * 2. Monthly Statistics:
 *    - Solar Monthly: telemetry.generationMonth (Monthly Solar Generation in kWh)
 *    - Grid Import Monthly: telemetry.buyMonth (Monthly Imported Energy in kWh)
 *    - Grid Export Monthly: telemetry.gridMonth (Monthly Exported Energy in kWh)
 *    - Consumption Monthly: telemetry.useMonth (Monthly Consumed Energy in kWh)
 *    - Battery Charge Monthly: telemetry.chargeMonth (Monthly Battery Charge in kWh)
 *    - Battery Discharge Monthly: telemetry.dischargeMonth (Monthly Battery Discharge in kWh)
 * 
 * 3. Lifetime Statistics:
 *    - Solar Lifetime: telemetry.generationTotal (Total Solar Energy Generated in kWh)
 *    - Grid Import Lifetime: telemetry.buyTotal (Total Grid Energy Imported in kWh)
 *    - Grid Export Lifetime: telemetry.gridTotal (Total Energy Exported to Grid in kWh)
 *    - Consumption Lifetime: telemetry.useTotal (Total Energy Consumed in kWh)
 *    - Battery Charge Lifetime: telemetry.chargeTotal (Total Battery Charge Energy in kWh)
 *    - Battery Discharge Lifetime: telemetry.dischargeTotal (Total Battery Discharge Energy in kWh)
 */

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  isAmoled: boolean;
}

function MetricCard({ title, value, icon, color, isAmoled }: MetricCardProps) {
  return (
    <View style={[styles.metricCard, isAmoled && styles.cardAmoled, { borderLeftColor: color }]}>
      <View style={styles.metricCardHeader}>
        {icon}
        <Text style={styles.metricCardTitle}>{title}</Text>
      </View>
      <Text style={[styles.metricCardValue, { color }]}>{value}</Text>
    </View>
  );
}

export function AnalyticsScreen() {
  const { settings, telemetry } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Collapsible accordion states
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [monthlyExpanded, setMonthlyExpanded] = useState(false);
  const [lifetimeExpanded, setLifetimeExpanded] = useState(false);

  const isAmoled = settings?.amoledTheme ?? false;

  const formatKwh = (val?: number) => {
    if (val === undefined || val === null) return '0.0 kWh';
    return `${val.toFixed(1)} kWh`;
  };

  // Run background Financial Engine calculations
  useEffect(() => {
    if (telemetry) {
      const importRate = settings?.tariffImportRate ?? 7.5;
      const exportRate = settings?.tariffExportRate ?? 5.0;
      const summary = FinancialEngine.summarize(telemetry, importRate, exportRate);
      
      console.log('[FinancialEngine] Telemetry update calculated:');
      console.log(' - Today Savings:', summary.today.netSavings.toFixed(2), 'INR');
      console.log(' - Month Savings:', summary.monthly.netSavings.toFixed(2), 'INR');
      console.log(' - Lifetime Savings:', summary.lifetime.netSavings.toFixed(2), 'INR');
    }
  }, [telemetry, settings]);

  const handleDownloadReport = async () => {
    setIsGenerating(true);
    try {
      // Station name falls back gracefully if not configured
      const stationName = settings?.activeStationId ? `Station ${settings.activeStationId}` : 'SolarGuard Plant';
      await ReportGenerator.generateAndShareMonthlyReport(telemetry, settings, stationName);
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Unable to generate monthly report.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, isAmoled && { backgroundColor: '#000000' }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>System Analytics</Text>
          <Text style={styles.headerSub}>Energy generation & usage insights</Text>
        </View>

        {/* PDF Download Trigger */}
        <TouchableOpacity
          style={[styles.downloadBtn, isGenerating && { opacity: 0.7 }]}
          onPress={handleDownloadReport}
          disabled={isGenerating}
          activeOpacity={0.8}
        >
          {isGenerating ? (
            <ActivityIndicator color={Colors.textInverse} size="small" />
          ) : (
            <Download size={18} color={Colors.textInverse} />
          )}
          <Text style={styles.downloadBtnText}>
            {isGenerating ? 'Compiling Report...' : 'Download Monthly Report'}
          </Text>
        </TouchableOpacity>

        {/* 1. TODAY'S STATISTICS SECTION */}
        <TouchableOpacity
          style={[styles.accordionHeader, isAmoled && styles.accordionHeaderAmoled]}
          onPress={() => setTodayExpanded(!todayExpanded)}
          activeOpacity={0.8}
        >
          <Text style={styles.accordionHeaderText}>Today's Statistics</Text>
          {todayExpanded ? (
            <ChevronUp size={20} color={Colors.textSecondary} />
          ) : (
            <ChevronDown size={20} color={Colors.textSecondary} />
          )}
        </TouchableOpacity>

        {todayExpanded && (
          <View style={styles.gridContainer}>
            <MetricCard
              title="Solar Generated"
              value={formatKwh(telemetry?.generationValue)}
              icon={<SunMedium size={18} color={Colors.amberLight} />}
              color={Colors.amberLight}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="House Consumed"
              value={formatKwh(telemetry?.useValue)}
              icon={<House size={18} color={Colors.blueLight} />}
              color={Colors.blueLight}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Grid Imported"
              value={formatKwh(telemetry?.buyValue)}
              icon={<ArrowDownLeft size={18} color={Colors.danger} />}
              color={Colors.danger}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Grid Exported"
              value={formatKwh(telemetry?.gridValue)}
              icon={<ArrowUpRight size={18} color={Colors.success} />}
              color={Colors.success}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Battery Charged"
              value={formatKwh(telemetry?.chargeValue)}
              icon={<Battery size={18} color="#8B5CF6" />}
              color="#8B5CF6"
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Battery Discharged"
              value={formatKwh(telemetry?.dischargeValue)}
              icon={<Battery size={18} color="#EC4899" />}
              color="#EC4899"
              isAmoled={isAmoled}
            />
          </View>
        )}

        {/* 2. MONTHLY STATISTICS SECTION */}
        <TouchableOpacity
          style={[styles.accordionHeader, isAmoled && styles.accordionHeaderAmoled, { marginTop: Spacing.sm }]}
          onPress={() => setMonthlyExpanded(!monthlyExpanded)}
          activeOpacity={0.8}
        >
          <Text style={styles.accordionHeaderText}>Monthly Summary</Text>
          {monthlyExpanded ? (
            <ChevronUp size={20} color={Colors.textSecondary} />
          ) : (
            <ChevronDown size={20} color={Colors.textSecondary} />
          )}
        </TouchableOpacity>

        {monthlyExpanded && (
          <View style={styles.gridContainer}>
            <MetricCard
              title="Solar Generated"
              value={formatKwh(telemetry?.generationMonth)}
              icon={<SunMedium size={18} color={Colors.amberLight} />}
              color={Colors.amberLight}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Energy Consumed"
              value={formatKwh(telemetry?.useMonth)}
              icon={<House size={18} color={Colors.blueLight} />}
              color={Colors.blueLight}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Grid Imported"
              value={formatKwh(telemetry?.buyMonth)}
              icon={<ArrowDownLeft size={18} color={Colors.danger} />}
              color={Colors.danger}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Grid Exported"
              value={formatKwh(telemetry?.gridMonth)}
              icon={<ArrowUpRight size={18} color={Colors.success} />}
              color={Colors.success}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Battery Charged"
              value={formatKwh(telemetry?.chargeMonth)}
              icon={<Battery size={18} color="#8B5CF6" />}
              color="#8B5CF6"
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Battery Discharged"
              value={formatKwh(telemetry?.dischargeMonth)}
              icon={<Battery size={18} color="#EC4899" />}
              color="#EC4899"
              isAmoled={isAmoled}
            />
          </View>
        )}

        {/* 3. LIFETIME STATISTICS SECTION */}
        <TouchableOpacity
          style={[styles.accordionHeader, isAmoled && styles.accordionHeaderAmoled, { marginTop: Spacing.sm }]}
          onPress={() => setLifetimeExpanded(!lifetimeExpanded)}
          activeOpacity={0.8}
        >
          <Text style={styles.accordionHeaderText}>Lifetime Statistics</Text>
          {lifetimeExpanded ? (
            <ChevronUp size={20} color={Colors.textSecondary} />
          ) : (
            <ChevronDown size={20} color={Colors.textSecondary} />
          )}
        </TouchableOpacity>

        {lifetimeExpanded && (
          <View style={styles.gridContainer}>
            <MetricCard
              title="Solar Generated"
              value={formatKwh(telemetry?.generationTotal)}
              icon={<SunMedium size={18} color={Colors.amberLight} />}
              color={Colors.amberLight}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Total Consumed"
              value={formatKwh(telemetry?.useTotal)}
              icon={<House size={18} color={Colors.blueLight} />}
              color={Colors.blueLight}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Grid Imported"
              value={formatKwh(telemetry?.buyTotal)}
              icon={<ArrowDownLeft size={18} color={Colors.danger} />}
              color={Colors.danger}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Grid Exported"
              value={formatKwh(telemetry?.gridTotal)}
              icon={<ArrowUpRight size={18} color={Colors.success} />}
              color={Colors.success}
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Battery Charged"
              value={formatKwh(telemetry?.chargeTotal)}
              icon={<Battery size={18} color="#8B5CF6" />}
              color="#8B5CF6"
              isAmoled={isAmoled}
            />
            <MetricCard
              title="Battery Discharged"
              value={formatKwh(telemetry?.dischargeTotal)}
              icon={<Battery size={18} color="#EC4899" />}
              color="#EC4899"
              isAmoled={isAmoled}
            />
          </View>
        )}
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
    paddingVertical: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.amber,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
    ...Shadows.amber,
  },
  downloadBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.textInverse,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    marginBottom: Spacing.sm,
    ...Shadows.card,
  },
  accordionHeaderAmoled: {
    backgroundColor: '#000000',
    borderColor: '#222',
  },
  accordionHeaderText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  metricCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderLeftWidth: 4,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
    ...Shadows.card,
  },
  cardAmoled: {
    backgroundColor: '#000000',
    borderColor: '#222',
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  metricCardTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 9,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricCardValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    marginTop: 2,
  },
});
