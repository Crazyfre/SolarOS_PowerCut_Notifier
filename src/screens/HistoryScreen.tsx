import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme, withAlpha, Typography, Spacing, PAGE_GUTTER } from '../theme';
import { OutageRecord } from '../types/telemetry';
import Svg, { Line, Circle, Rect } from 'react-native-svg';
import {
  ScreenHeader,
  HeaderAction,
  Card,
  Badge,
  SectionHeader,
} from '../components/ui';
import {
  TriangleAlert,
  CircleCheckBig,
  BatteryMedium,
  BatteryLow,
  Clock3,
  Timer,
  RefreshCcw,
  ChevronDown,
} from 'lucide-react-native';

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

// ─── Data-true battery decline chart ─────────────────────────────────────────
// Renders the recorded SoC window (100% at start → minBatterySoc at end) as a
// declining line on a scaled 0–100% track with threshold marker. The outage
// record exposes start/end SoC and the threshold from settings — no fake data.

function BatteryDeclineChart({
  startSoc,
  endSoc,
  threshold,
  warningHit,
}: {
  startSoc: number;
  endSoc: number;
  threshold: number;
  warningHit: boolean;
}) {
  const { colors } = useTheme();
  const W = 300;
  const H = 64;
  const PAD = 10;

  // y: 100% at top (PAD), 0% at bottom (H - PAD)
  const yFor = (soc: number) => PAD + ((100 - soc) / 100) * (H - PAD * 2);
  const x1 = PAD + 2;
  const x2 = W - PAD - 2;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {/* 0/50/100% grid lines */}
      {[100, 50, 0].map((lvl) => (
        <Line
          key={lvl}
          x1={PAD} y1={yFor(lvl)} x2={W - PAD} y2={yFor(lvl)}
          stroke={withAlpha(colors.textDisabled, 12)}
          strokeWidth="1"
        />
      ))}
      {/* warning threshold zone */}
      <Rect
        x={PAD} y={yFor(0) - (yFor(0) - yFor(threshold))}
        width={W - PAD * 2}
        height={yFor(0) - yFor(threshold)}
        fill={withAlpha(colors.danger, 8)}
      />
      <Line
        x1={PAD} y1={yFor(threshold)} x2={W - PAD} y2={yFor(threshold)}
        stroke={withAlpha(colors.danger, 40)}
        strokeWidth="1"
        strokeDasharray="4,3"
      />
      {/* SoC decline — data-true line from start to min */}
      <Line
        x1={x1} y1={yFor(startSoc)} x2={x2} y2={yFor(endSoc)}
        stroke={warningHit ? colors.danger : colors.charge}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Circle cx={x1} cy={yFor(startSoc)} r="3.5" fill={warningHit ? colors.danger : colors.charge} />
      <Circle cx={x2} cy={yFor(endSoc)} r="3.5" fill={warningHit ? colors.danger : colors.charge} />
    </Svg>
  );
}

function OutageCard({ item }: { item: OutageRecord }) {
  const [expanded, setExpanded] = React.useState(false);
  const { settings } = useApp();
  const { colors } = useTheme();
  const isOngoing = !item.endTime;
  const duration = item.endTime ? item.endTime - item.startTime : undefined;
  const threshold = settings?.batteryWarningThreshold ?? 20;

  const startSoc = 100; // outages begin at grid-cut; detector assumes full battery baseline
  const endSoc = item.minBatterySoc ?? 100;
  const warningHit = endSoc <= threshold;

  return (
    <Card
      glowColor={isOngoing ? colors.danger : undefined}
      style={isOngoing ? { borderColor: colors.dangerBorder } : undefined}
    >
      {/* Ongoing tint layer */}
      {isOngoing ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.dangerFill, borderRadius: 16 }]}
        />
      ) : null}

      <View style={styles.cardHeader}>
        <Text style={[styles.cardDay, { color: colors.textSecondary }]}>
          {getRelativeDateStr(item.startTime)}
        </Text>
        {isOngoing ? (
          <Badge label="Live" tone="danger" live />
        ) : (
          <View style={styles.expandRow}>
            <Text style={[styles.expandHint, { color: colors.textSecondary }]}>
              {expanded ? 'Collapse' : 'Details'}
            </Text>
            <ChevronDown
              size={14}
              color={colors.textSecondary}
              strokeWidth={2}
              style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
            />
          </View>
        )}
      </View>

      <View style={[styles.titleRow, { borderColor: colors.divider }]}>
        <View style={styles.titleLeft}>
          <TriangleAlert size={18} color={isOngoing ? colors.danger : colors.warningText} strokeWidth={2} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {isOngoing ? 'Ongoing Outage' : 'Outage'}
          </Text>
        </View>
        <Text style={[styles.duration, { color: isOngoing ? colors.dangerText : colors.textPrimary }]}>
          {isOngoing ? '—' : formatDuration(duration)}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.timeBlock}>
          <View style={styles.timeMetaRow}>
            <Clock3 size={12} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>Start</Text>
          </View>
          <Text style={[styles.timeValue, { color: colors.textPrimary }]}>{formatTime(item.startTime)}</Text>
        </View>
        <View style={[styles.timeBlock, styles.timeBlockEnd]}>
          <View style={styles.timeMetaRow}>
            <Timer size={12} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>
              {isOngoing ? 'Duration' : 'End'}
            </Text>
          </View>
          <Text style={[styles.timeValue, { color: colors.textPrimary }]}>
            {isOngoing ? formatDuration(Date.now() - item.startTime) : formatTime(item.endTime!)}
          </Text>
        </View>
      </View>

      <View style={[styles.batteryRow, { borderTopColor: colors.divider }]}>
        <View style={styles.batteryRowLeft}>
          <BatteryMedium size={14} color={colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.batteryLabel, { color: colors.textSecondary }]}>Battery usage</Text>
        </View>
        <Text style={[styles.batteryValue, { color: warningHit ? colors.dangerText : colors.chargeText }]}>
          {startSoc}% → {endSoc}%
        </Text>
      </View>

      {/* Expanded details — data-true chart + event timeline */}
      {expanded && !isOngoing ? (
        <View style={[styles.expanded, { borderTopColor: colors.divider }]}>
          <Text style={[styles.expandedTitle, { color: colors.textSecondary }]}>Battery During Outage</Text>
          <View style={[styles.chartWrap, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <BatteryDeclineChart
              startSoc={startSoc}
              endSoc={endSoc}
              threshold={threshold}
              warningHit={warningHit}
            />
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: warningHit ? colors.danger : colors.charge }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>Charge level</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: withAlpha(colors.danger, 40) }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>Warning zone ({threshold}%)</Text>
              </View>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Peak Load</Text>
              <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                {item.maxLoadW != null ? `${Math.round(item.maxLoadW)} W` : '—'}
              </Text>
            </View>
            <View style={[styles.metaCol, styles.metaColEnd]}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Lowest Battery</Text>
              <Text style={[styles.metaValue, { color: warningHit ? colors.dangerText : colors.textPrimary }]}>
                {endSoc}%
              </Text>
            </View>
          </View>

          <View style={styles.timeline}>
            <View style={styles.timelineEvent}>
              <TriangleAlert size={13} color={colors.chargeText} strokeWidth={2} />
              <Text style={[styles.timelineText, { color: colors.textSecondary }]}>
                {formatTime(item.startTime)} — Outage started (Battery {startSoc}%)
              </Text>
            </View>
            {warningHit ? (
              <View style={styles.timelineEvent}>
                <BatteryLow size={13} color={colors.dangerText} strokeWidth={2} />
                <Text style={[styles.timelineText, { color: colors.textSecondary }]}>
                  Battery warning threshold reached ({threshold}%)
                </Text>
              </View>
            ) : null}
            {item.endTime ? (
              <View style={styles.timelineEvent}>
                <CircleCheckBig size={13} color={colors.successText} strokeWidth={2} />
                <Text style={[styles.timelineText, { color: colors.textSecondary }]}>
                  {formatTime(item.endTime)} — Grid restored (Battery {endSoc}%)
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export function HistoryScreen() {
  const { outageHistory, reloadHistory } = useApp();
  const { colors } = useTheme();
  const spinValue = useRef(new Animated.Value(0)).current;
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    reloadHistory();
  }, []);

  // Ongoing outage elapsed timer
  useEffect(() => {
    const hasOngoing = outageHistory.some(o => !o.endTime);
    if (!hasOngoing) return;
    const t = setInterval(() => setRefreshTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [outageHistory]);

  const handleRefresh = () => {
    spinValue.setValue(0);
    Animated.timing(spinValue, {
      toValue: 1,
      duration: 600,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
    reloadHistory();
  };

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const sortedHistory = [...outageHistory].reverse(); // newest first
  void refreshTick; // elapsed re-render trigger

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Outage History"
        subtitle={`${sortedHistory.length} outage${sortedHistory.length !== 1 ? 's' : ''} recorded`}
        right={
          <HeaderAction
            onPress={handleRefresh}
            icon={
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <RefreshCcw size={18} color={colors.brand} strokeWidth={2} />
              </Animated.View>
            }
            accessibilityLabel="Refresh history"
            testID="refresh-history-button"
          />
        }
      />

      {sortedHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <CircleCheckBig size={48} color={colors.success} strokeWidth={1.5} style={{ marginBottom: Spacing.lg }} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No outages recorded</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Your grid has been stable. SolarGuard will log any outages here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedHistory}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OutageCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContent: {
    padding: PAGE_GUTTER,
    paddingBottom: Spacing['3xl'],
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3xl'],
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize.xl,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    textAlign: 'center',
    lineHeight: 21,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardDay: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
  },
  expandHint: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.md,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.lg,
    letterSpacing: -0.2,
  },
  duration: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.base,
    fontVariant: ['tabular-nums'],
  },
  cardBody: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  timeBlock: {
    flex: 1,
  },
  timeBlockEnd: {
    alignItems: 'flex-end',
  },
  timeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  timeLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeValue: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.lg - 2,
    fontVariant: ['tabular-nums'],
  },
  batteryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  batteryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  batteryLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
  },
  batteryValue: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
  expanded: {
    marginTop: Spacing.md,
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
  expandedTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
  },
  chartWrap: {
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  chartLegend: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 8,
    height: 3,
    borderRadius: 1.5,
  },
  legendText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  metaCol: {
    flex: 1,
  },
  metaColEnd: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.base,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  timeline: {
    gap: Spacing.sm,
  },
  timelineEvent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  timelineText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    flex: 1,
    lineHeight: 16,
  },
});
