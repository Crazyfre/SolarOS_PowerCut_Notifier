// StatusCard — telemetry stat card.
// Neutral surface; state is communicated by the StatusDot + optional
// status-colored value text — never by card borders/glows (those are
// reserved for the banner system).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, Typography, Spacing, BorderRadius } from '../theme';
import { StatusDot } from './ui/StatusDot';

export type StatusCardTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'discharge' | 'neutral';

interface StatusCardProps {
  title: string;
  value: string;
  subtitle?: string;
  /** leading status indicator next to the title */
  tone?: StatusCardTone;
  /** show breathing dot (live grid/solar states) */
  live?: boolean;
  /** large display value (grid connected/OFFLINE states) */
  large?: boolean;
  /** numeric value rendered in mono (power readouts) */
  numeric?: boolean;
  icon?: React.ReactNode;
  testID?: string;
}

function toneColorFor(tone: StatusCardTone, c: ReturnType<typeof useTheme>['colors']): string | null {
  switch (tone) {
    case 'success': return c.success;
    case 'warning': return c.warning;
    case 'danger': return c.danger;
    case 'info': return c.info;
    case 'brand': return c.brand;
    case 'discharge': return c.discharge;
    default: return null;
  }
}

export function StatusCard({
  title,
  value,
  subtitle,
  tone = 'neutral',
  live = false,
  large = false,
  numeric = false,
  icon,
  testID,
}: StatusCardProps) {
  const { colors, shadows } = useTheme();
  const dotColor = toneColorFor(tone, colors);

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: colors.surface1, borderColor: colors.border },
        shadows.card as object,
      ]}
    >
      <View style={styles.header}>
        {dotColor ? (
          <StatusDot
            color={dotColor}
            mode={live ? 'breathing' : 'steady'}
            size={7}
          />
        ) : null}
        <Text style={[styles.title, { color: colors.textSecondary }]} numberOfLines={1}>
          {title}
        </Text>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
      </View>
      <Text
        style={[
          large ? styles.valueLarge : numeric ? styles.valueNumeric : styles.valueText,
          dotColor ? { color: dotColor } : { color: colors.textPrimary },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit={large}
      >
        {value}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.base,
    overflow: 'hidden',
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    letterSpacing: Typography.tracking.label,
    textTransform: 'uppercase',
    flex: 1,
  },
  icon: {},
  valueLarge: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize['2xl'],
    letterSpacing: -0.4,
  },
  valueText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize['2xl'] - 4,
    letterSpacing: -0.3,
  },
  valueNumeric: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.xl,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    marginTop: Spacing.xs,
    lineHeight: 15,
  },
});
