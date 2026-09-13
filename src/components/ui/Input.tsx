// Input — themed TextInput on surface2 with a real focus state
// (brand ring). Unit suffix support for tariff/capacity fields.

import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps, ViewStyle, StyleProp } from 'react-native';
import { useTheme, Typography, Spacing, BorderRadius } from '../../theme';

interface InputProps extends TextInputProps {
  label?: string;
  unit?: string;
  /** fixed width for compact value inputs */
  compactWidth?: number;
  style?: StyleProp<ViewStyle>;
}

export function Input({ label, unit, compactWidth, style, ...inputProps }: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const container: ViewStyle = focused
    ? {
        backgroundColor: colors.surface2,
        borderColor: colors.brand,
        borderWidth: 1.5,
      }
    : {
        backgroundColor: colors.surface2,
        borderColor: colors.border,
        borderWidth: 1,
      };

  return (
    <View style={[style, compactWidth ? { width: compactWidth } : null]}>
      {label ? (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      ) : null}
      <View style={[styles.field, container, compactWidth ? styles.compactField : null]}>
        <TextInput
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          placeholderTextColor={colors.textDisabled}
          style={[styles.input, { color: colors.textPrimary }]}
        />
        {unit ? (
          <Text style={[styles.unit, { color: colors.textSecondary }]}>{unit}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    marginBottom: Spacing.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base,
    minHeight: 44,
  },
  compactField: {
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.base,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'center',
  },
  unit: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.xs,
    marginLeft: Spacing.xs,
  },
});
