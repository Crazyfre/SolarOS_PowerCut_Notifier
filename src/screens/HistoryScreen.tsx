import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../theme';
import { useApp } from '../context/AppContext';
import { OutageRecord } from '../types/telemetry';
import Svg, { Line, Circle, Path } from 'react-native-svg';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms?: number): string {
  if (!ms) return 'Ongoing';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getRelativeDateStr(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

function OutageCard({ item, index }: { item: OutageRecord; index: number }) {
  const [expanded, setExpanded] = React.useState(false);
  const { settings } = useApp();
  const isOngoing = !item.endTime;
  const duration = item.endTime ? item.endTime - item.startTime : undefined;
  const isAmoled = settings?.amoledTheme ?? false;
  const preferredUnit = settings?.preferredUnit ?? 'W';

  const formatPower = (watts: number) => {
    if (preferredUnit === 'kW') {
      return `${(watts / 1000).toFixed(2)} kW`;
    }
    return `${Math.round(watts)} W`;
  };

  const startSoc = 100; // Assume full start or fallback
  const endSoc = item.minBatterySoc ?? 100;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => setExpanded(!expanded)}
      style={[
        styles.card,
        isOngoing && styles.cardOngoing,
        isAmoled && styles.cardAmoled,
      ]}
    >
      {isOngoing && <View style={styles.ongoingGlow} />}

      <View style={styles.cardHeader}>
        <Text style={styles.cardDayText}>{getRelativeDateStr(item.startTime)}</Text>
        {isOngoing ? (
          <View style={styles.ongoingBadge}>
            <Text style={styles.ongoingBadgeText}>● LIVE</Text>
          </View>
        ) : (
          <Text style={styles.expandHintText}>{expanded ? 'Collapse ▲' : 'Details ▼'}</Text>
        )}
      </View>

      <View style={styles.outageTitleRow}>
        <Text style={styles.outageIcon}>⚡</Text>
        <Text style={styles.outageTitle}>Outage</Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>Timeline</Text>
          <Text style={styles.timeValue}>
            {formatTime(item.startTime)} {item.endTime ? `→ ${formatTime(item.endTime)}` : ' (Ongoing)'}
          </Text>
        </View>

        <View style={[styles.timeBlock, { alignItems: 'flex-end' }]}>
          <Text style={styles.timeLabel}>Duration</Text>
          <Text style={styles.durationValue}>{formatDuration(duration)}</Text>
        </View>
      </View>

      <View style={styles.batteryDropRow}>
        <Text style={styles.batteryDropLabel}>Battery usage</Text>
        <Text style={styles.batteryDropValue}>
          {startSoc}% → {endSoc}%
        </Text>
      </View>

      {/* Expanded Details Graph & Timeline */}
      {expanded && !isOngoing && (
        <View style={styles.expandedContent}>
          <Text style={styles.expandedSectionTitle}>Load & Battery Timeline</Text>
          
          {/* Mini plot diagram using SVG */}
          <View style={styles.chartWrapper}>
            <Svg width="100%" height="80" viewBox="0 0 300 80">
              {/* Battery level line (descending) */}
              <Line x1="10" y1="20" x2="290" y2="60" stroke={Colors.blue} strokeWidth="3" />
              <Circle cx="10" cy="20" r="4" fill={Colors.blue} />
              <Circle cx="290" cy="60" r="4" fill={Colors.blue} />
              
              {/* Load line (varying) */}
              <Path
                d="M 10 50 Q 75 20 150 45 T 290 55"
                fill="none"
                stroke={Colors.amber}
                strokeWidth="2.5"
                strokeDasharray="4,2"
              />
              
              {/* Labels */}
              <Text style={styles.chartTextLeft}>100%</Text>
              <Text style={styles.chartTextRight}>{endSoc}%</Text>
            </Svg>
          </View>

          <View style={styles.expandedMeta}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Peak Load</Text>
              <Text style={styles.metaVal}>{formatPower(item.maxLoadW ?? 0)}</Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Lowest Battery</Text>
              <Text style={styles.metaVal}>{endSoc}%</Text>
            </View>
          </View>

          <View style={styles.timelineList}>
            <View style={styles.timelineEvent}>
              <Text style={styles.timelineDot}>●</Text>
              <Text style={styles.timelineEventText}>
                {formatTime(item.startTime)} - Outage started (Battery 100%)
              </Text>
            </View>
            {endSoc <= (settings?.batteryWarningThreshold ?? 20) && (
              <View style={styles.timelineEvent}>
                <Text style={[styles.timelineDot, { color: Colors.danger }]}>●</Text>
                <Text style={styles.timelineEventText}>
                  Battery warning threshold reached
                </Text>
              </View>
            )}
            {item.endTime && (
              <View style={styles.timelineEvent}>
                <Text style={[styles.timelineDot, { color: Colors.success }]}>●</Text>
                <Text style={styles.timelineEventText}>
                  {formatTime(item.endTime)} - Grid restored (Battery {endSoc}%)
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function HistoryScreen() {
  const { outageHistory, reloadHistory, settings } = useApp();

  useEffect(() => {
    reloadHistory();
  }, []);

  const sortedHistory = [...outageHistory].reverse(); // newest first
  const isAmoled = settings?.amoledTheme ?? false;

  return (
    <SafeAreaView style={[styles.root, isAmoled && { backgroundColor: '#000000' }]} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Outage History</Text>
        <TouchableOpacity
          onPress={reloadHistory}
          style={styles.refreshBtn}
          accessibilityLabel="Refresh history"
          testID="refresh-history-button"
        >
          <Text style={styles.refreshText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>

      {sortedHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🟢</Text>
          <Text style={styles.emptyTitle}>No outages recorded</Text>
          <Text style={styles.emptySubtitle}>
            Your grid has been stable. SolarGuard will log any outages here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedHistory}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <OutageCard item={item} index={sortedHistory.length - 1 - index} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.summaryBar}>
              <Text style={styles.summaryText}>
                {sortedHistory.length} outage{sortedHistory.length !== 1 ? 's' : ''} recorded
              </Text>
            </View>
          }
        />
      )}
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
  refreshBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.glassLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  refreshText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.amber,
  },
  listContent: {
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing['3xl'],
  },
  summaryBar: {
    paddingVertical: Spacing.base,
  },
  summaryText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadows.card,
  },
  cardOngoing: {
    borderColor: Colors.danger + '66',
  },
  ongoingGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.dangerGlow,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  indexBadge: {
    backgroundColor: Colors.glassLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  indexText: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  ongoingBadge: {
    backgroundColor: Colors.dangerGlow,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  ongoingBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.danger,
    letterSpacing: 1,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  timeBlock: {
    flex: 1,
  },
  timeLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  timeDate: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  timeValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  timeSeparator: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    gap: 4,
  },
  timeLine: {
    width: 1,
    height: 16,
    backgroundColor: Colors.divider,
  },
  durationBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.amber,
    textAlign: 'center',
  },
  cardStats: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.glassLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  statChipIcon: {
    fontSize: 12,
  },
  statChipText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3xl'],
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  cardAmoled: {
    backgroundColor: '#000000',
    borderColor: '#222',
  },
  cardDayText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  expandHintText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.amber,
  },
  outageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginVertical: Spacing.xs,
  },
  outageIcon: {
    fontSize: 16,
  },
  outageTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  durationValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.amber,
  },
  batteryDropRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  batteryDropLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  batteryDropValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.blueLight,
  },
  expandedContent: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  expandedSectionTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  chartWrapper: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chartTextLeft: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: 9,
    color: Colors.textMuted,
  },
  chartTextRight: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: 9,
    color: Colors.textMuted,
  },
  expandedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  metaVal: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  timelineList: {
    gap: Spacing.xs,
  },
  timelineEvent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  timelineDot: {
    fontSize: 10,
    color: Colors.blueLight,
  },
  timelineEventText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
});
