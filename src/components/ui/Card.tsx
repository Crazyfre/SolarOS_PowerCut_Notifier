// Card — surface1 container. Neutral by default; elevation comes from the
// theme's surface ramp, glow only via the `glow` prop (energized states).

import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useTheme, Spacing, BorderRadius } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Reserved for energized states (LIVE outage cards, alarm banners) */
  glowColor?: string;
  testID?: string;
}

export function Card({ children, style, glowColor, testID }: CardProps) {
  const theme = useTheme();
  const { colors, shadows } = theme;

  const dynamic: ViewStyle = {
    backgroundColor: colors.surface1,
    borderColor: colors.border,
    ...(glowColor ? shadows.glow(glowColor) : shadows.card),
  };

  return (
    <View style={[styles.card, dynamic, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.base,
    overflow: 'hidden',
  },
});
