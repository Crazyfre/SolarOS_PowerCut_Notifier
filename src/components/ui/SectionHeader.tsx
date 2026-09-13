// SectionHeader — micro-label pattern for screen sections.
// Optional leading icon; consistent uppercase tracking everywhere.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, Typography, Spacing } from '../../theme';

interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  /** trailing accessory (e.g. a Badge) */
  right?: React.ReactNode;
}

export function SectionHeader({ title, icon, right }: SectionHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {icon}
      <Text style={[styles.label, { color: colors.textSecondary }]}>{title}</Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  label: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    letterSpacing: Typography.tracking.label,
    textTransform: 'uppercase',
    flex: 1,
  },
  right: {},
});
