// ScreenHeader — the single header pattern for all screens.
// Display-face title, optional live subtitle (with breathing dot),
// right action slot, bottom hairline. Handles the top safe area once.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useTheme, Typography, Spacing, PAGE_GUTTER } from '../../theme';
import { StatusDot } from './StatusDot';

interface ScreenHeaderProps {
  title: string;
  /** renders as "· subtitle" next to the title */
  subtitle?: string;
  /** subtitle gets a breathing brand dot (live data indicators) */
  liveSubtitle?: boolean;
  /** e.g. back button — 44px target */
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  liveSubtitle = false,
  left,
  right,
}: ScreenHeaderProps) {
  const { colors } = useTheme();

  return (
    <SafeAreaView
      edges={['top'] as Edge[]}
      style={{ backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        {left}
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
            {liveSubtitle && subtitle ? (
              <>
                <StatusDot color={colors.success} mode="breathing" size={6} />
                <Text style={[styles.live, { color: colors.textSecondary }]}>{subtitle}</Text>
              </>
            ) : null}
          </View>
          {subtitle && !liveSubtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          ) : null}
        </View>
        {right}
      </View>
    </SafeAreaView>
  );
}

/** Standard 44px circular header action (icon button) */
export function HeaderAction({
  onPress,
  icon,
  accessibilityLabel,
  testID,
}: {
  onPress: () => void;
  icon: React.ReactNode;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      testID={testID}
      style={[styles.action, { borderColor: colors.border, backgroundColor: colors.glassFill }]}
    >
      {icon}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: PAGE_GUTTER,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.base,
    borderBottomWidth: 1,
  },
  titleBlock: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize.xl,
    letterSpacing: -0.3,
  },
  live: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    marginTop: 2,
  },
  action: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
