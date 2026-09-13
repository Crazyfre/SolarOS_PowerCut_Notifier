// SegmentedControl — radio-style selector for mutually exclusive options
// (alarm duration, refresh interval, dev grid state). surface2 track,
// brand-active segment, optional per-option icons.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, Typography, Spacing, BorderRadius } from '../../theme';

interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** tint for the active segment (defaults to brand) */
  activeTint?: string;
  testID?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  activeTint,
  testID,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  const tint = activeTint ?? colors.brand;

  return (
    <View style={styles.track} testID={testID}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[
              styles.segment,
              {
                backgroundColor: active ? tint : colors.surface2,
                borderColor: active ? tint : colors.border,
              },
            ]}
          >
            {opt.icon ? <View style={styles.iconWrap}>{opt.icon}</View> : null}
            <Text
              style={[
                styles.label,
                { color: active ? colors.textInverse : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.xs,
  },
  iconWrap: {},
  label: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    textAlign: 'center',
  },
});
