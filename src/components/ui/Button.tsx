// Button — the app's single button implementation.
// Variants: primary (solid brand, no glow), secondary (surface2 + border),
// ghost (transparent), danger (solid red — destructive confirmations).
// 44px minimum touch target. Pressed = white overlay 150ms via TouchableOpacity
// activeOpacity; loading swaps content for an inline spinner.

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme, Typography, Spacing, BorderRadius } from '../../theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  full = false,
  size = 'md',
  style,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const { colors, motion } = useTheme();

  const isSolid = variant === 'primary' || variant === 'danger';
  const fillColor =
    variant === 'primary' ? colors.brand : variant === 'danger' ? colors.danger : 'transparent';

  const bg: ViewStyle =
    variant === 'secondary'
      ? { backgroundColor: colors.surface2, borderColor: colors.border }
      : variant === 'ghost'
        ? { borderColor: colors.borderStrong }
        : { backgroundColor: fillColor };

  const textColor = isSolid
    ? colors.textInverse
    : variant === 'ghost'
      ? colors.dangerText
      : colors.textPrimary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      testID={testID}
      style={[
        styles.base,
        size === 'sm' && styles.sm,
        full && styles.full,
        bg,
        (variant === 'secondary' || variant === 'ghost') && styles.bordered,
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isSolid ? colors.textInverse : colors.brand} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text
            style={[
              styles.label,
              size === 'sm' && styles.labelSm,
              { color: textColor },
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: {
    minHeight: 36,
    paddingHorizontal: Spacing.base,
  },
  full: {
    alignSelf: 'stretch',
  },
  bordered: {
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.base,
    letterSpacing: 0.2,
  },
  labelSm: {
    fontSize: Typography.fontSize.sm,
  },
});
