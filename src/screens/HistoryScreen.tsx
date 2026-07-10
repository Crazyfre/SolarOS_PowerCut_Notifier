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

function OutageCard({ item, index }: { item: OutageRecord; index: number }) {
  const isOngoing = !item.endTime;
  const duration = item.endTime ? item.endTime - item.startTime : undefined;

  return (
    <View style={[styles.card, isOngoing && styles.cardOngoing]}>
      {isOngoing && <View style={styles.ongoingGlow} />}

      <View style={styles.cardHeader}>
        <View style={styles.indexBadge}>
          <Text style={styles.indexText}>#{index + 1}</Text>
        </View>
        {isOngoing && (
          <View style={styles.ongoingBadge}>
            <Text style={styles.ongoingBadgeText}>● LIVE</Text>
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>Started</Text>
          <Text style={styles.timeDate}>{formatDate(item.startTime)}</Text>
          <Text style={styles.timeValue}>{formatTime(item.startTime)}</Text>
        </View>

        <View style={styles.timeSeparator}>
          <View style={styles.timeLine} />
          <Text style={styles.durationBadgeText}>{formatDuration(duration)}</Text>
          <View style={styles.timeLine} />
        </View>

        <View style={[styles.timeBlock, { alignItems: 'flex-end' }]}>
          <Text style={styles.timeLabel}>Ended</Text>
          {item.endTime ? (
            <>
              <Text style={styles.timeDate}>{formatDate(item.endTime)}</Text>
              <Text style={styles.timeValue}>{formatTime(item.endTime)}</Text>
            </>
          ) : (
            <Text style={[styles.timeValue, { color: Colors.danger }]}>Ongoing</Text>
          )}
        </View>
      </View>

      <View style={styles.cardStats}>
        {item.minBatterySoc !== undefined && (
          <View style={styles.statChip}>
            <Text style={styles.statChipIcon}>🔋</Text>
            <Text style={styles.statChipText}>Min {item.minBatterySoc}%</Text>
          </View>
        )}
        {item.maxLoadW !== undefined && (
          <View style={styles.statChip}>
            <Text style={styles.statChipIcon}>⚡</Text>
            <Text style={styles.statChipText}>Peak {item.maxLoadW}W</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function HistoryScreen() {
  const { outageHistory, reloadHistory } = useApp();

  useEffect(() => {
    reloadHistory();
  }, []);

  const sortedHistory = [...outageHistory].reverse(); // newest first

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
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
});
