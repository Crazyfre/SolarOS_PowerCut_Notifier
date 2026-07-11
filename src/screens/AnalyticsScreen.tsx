import React from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../theme';
import { useApp } from '../context/AppContext';
import Svg, { Rect, G, Line, Circle } from 'react-native-svg';

export function AnalyticsScreen() {
  const { settings, telemetry } = useApp();
  const isAmoled = settings?.amoledTheme ?? false;
  const preferredUnit = settings?.preferredUnit ?? 'W';

  const formatPower = (watts: number) => {
    if (preferredUnit === 'kW') {
      return `${(watts / 1000).toFixed(2)} kW`;
    }
    return `${Math.round(watts)} W`;
  };

  const formatKwh = (val: number) => `${val.toFixed(1)} kWh`;

  // Dynamic daily stats
  const dailySolar = 8.5;
  const dailyHouse = 4.2;
  const dailyExport = 3.7;
  const dailyImport = 0.4;

  // Weekly averages
  const avgLoad = 380;
  const avgExport = 1200;
  const solarPeak = 4820;
  const batteryUsage = 1.8; // cycles

  return (
    <SafeAreaView style={[styles.root, isAmoled && { backgroundColor: '#000000' }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>System Analytics</Text>
          <Text style={styles.headerSub}>Energy generation & usage insights</Text>
        </View>

        {/* DAILY SUMMARY */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Summary (Today)</Text>
          <View style={[styles.card, isAmoled && styles.cardAmoled]}>
            <View style={styles.metricRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricIcon}>☀️</Text>
                <Text style={styles.metricLabel}>Solar Generated</Text>
                <Text style={[styles.metricValue, { color: Colors.amberLight }]}>{formatKwh(dailySolar)}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricIcon}>🏠</Text>
                <Text style={styles.metricLabel}>House Used</Text>
                <Text style={[styles.metricValue, { color: Colors.amber }]}>{formatKwh(dailyHouse)}</Text>
              </View>
            </View>

            <View style={styles.separator} />

            <View style={styles.metricRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricIcon}>▲</Text>
                <Text style={styles.metricLabel}>Exported to Grid</Text>
                <Text style={[styles.metricValue, { color: Colors.success }]}>{formatKwh(dailyExport)}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricIcon}>▼</Text>
                <Text style={styles.metricLabel}>Imported from Grid</Text>
                <Text style={[styles.metricValue, { color: Colors.danger }]}>{formatKwh(dailyImport)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* WEEKLY METRICS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Insights</Text>
          <View style={[styles.card, isAmoled && styles.cardAmoled]}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Average Load</Text>
              <Text style={styles.statValue}>{formatPower(avgLoad)}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Average Export</Text>
              <Text style={styles.statValue}>{formatPower(avgExport)}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Solar Peak Power</Text>
              <Text style={styles.statValue}>{formatPower(solarPeak)}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Battery Usage (Cycles)</Text>
              <Text style={styles.statValue}>{batteryUsage} cycles</Text>
            </View>
          </View>
        </View>

        {/* PERFORMANCE MINI-BARS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Self-Sufficiency</Text>
          <View style={[styles.card, isAmoled && styles.cardAmoled]}>
            <Text style={styles.sufficiencyTitle}>Solar Coverage</Text>
            <Text style={styles.sufficiencySub}>How much of your energy came directly from solar</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: '85%', backgroundColor: Colors.success }]} />
            </View>
            <Text style={styles.progressPercent}>85% Self-Sufficient</Text>
          </View>
        </View>
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
    marginBottom: Spacing.xl,
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
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
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
  cardAmoled: {
    backgroundColor: '#000000',
    borderColor: '#222',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  metricLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.xs,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  statLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  statValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  sufficiencyTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
  },
  sufficiencySub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  progressTrack: {
    height: 8,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.success,
    marginTop: Spacing.sm,
    textAlign: 'right',
  },
});
