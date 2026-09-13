// Badge — compact pill for statuses: LIVE, GRANTED, EXPO GO, config states.
// tone picks the palette mapping; always uppercase micro-typography.

import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme, ThemeColors, Typography, Spacing, BorderRadius } from '../../theme';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** breathing dot rendered inside the pill (live indicators) */
  live?: boolean;
  style?: StyleProp<ViewStyle>;
}

function toneColors(colors: ThemeColors, tone: BadgeTone) {
  switch (tone) {
    case 'success': return { fill: colors.successFill, border: colors.successBorder, text: colors.successText, dot: colors.success };
    case 'warning': return { fill: colors.warningFill, border: colors.warningBorder, text: colors.warningText, dot: colors.warning };
    case 'danger': return { fill: colors.dangerFill, border: colors.dangerBorder, text: colors.dangerText, dot: colors.danger };
    case 'info': return { fill: colors.infoFill, border: colors.infoBorder, text: colors.infoText, dot: colors.info };
    case 'brand': return { fill: 'rgba(245,166,35,0.12)', border: 'rgba(245,166,35,0.35)', text: colors.brandBright, dot: colors.brand };
    default: return { fill: colors.glassFill, border: colors.border, text: colors.textSecondary, dot: colors.textSecondary };
  }
}

export function Badge({ label, tone = 'neutral', live = false, style }: BadgeProps) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: t.fill, borderColor: t.border },
        style,
      ]}
    >
      {live && (
        <View
          style={[styles.dot, { backgroundColor: t.dot }]}
          accessibilityLabel={`${label} active`}
        />
      )}
      <Text style={[styles.text, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  text: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs - 1,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
