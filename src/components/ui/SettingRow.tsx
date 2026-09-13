// SettingRow — the atomic settings row: leading icon (optional), title,
// subtitle, trailing control (Switch / input / Badge / Button / custom).
// Used inside a Card; rows separated by RowDivider.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, Typography, Spacing } from '../../theme';

interface SettingRowProps {
  title: string;
  subtitle?: string;
  /** label rendered above the title (e.g. group context) */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function SettingRow({ title, subtitle, icon, children }: SettingRowProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={[styles.info, { paddingRight: Spacing.md }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        ) : null}
      </View>
      {children ? <View style={styles.control}>{children}</View> : null}
    </View>
  );
}

export function RowDivider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: Spacing.sm }} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  icon: {
    marginRight: Spacing.md,
    alignSelf: 'center',
  },
  info: {
    flex: 1,
  },
  title: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    marginTop: 2,
    lineHeight: 15,
  },
  control: {
    alignItems: 'flex-end',
  },
});
