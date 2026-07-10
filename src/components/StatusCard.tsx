import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, BorderRadius, Typography, Spacing, Shadows } from '../theme';

interface StatusCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  accentColor?: string;
  glowColor?: string;
  large?: boolean;
}

export function StatusCard({
  title,
  value,
  subtitle,
  icon,
  accentColor = Colors.amber,
  glowColor,
  large,
}: StatusCardProps) {
  const glow = glowColor ?? accentColor + '22';

  return (
    <View style={[styles.card, { borderColor: accentColor + '33' }]}>
      {/* Glow layer */}
      <View style={[styles.glowLayer, { backgroundColor: glow }]} />

      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text
        style={[
          styles.value,
          { color: accentColor, fontSize: large ? Typography.fontSize['3xl'] : Typography.fontSize['2xl'] },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.base,
    overflow: 'hidden',
    ...Shadows.card,
  },
  glowLayer: {
    ...StyleSheet.absoluteFill,
    borderRadius: BorderRadius.xl,
  },
  iconContainer: {
    marginBottom: Spacing.sm,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  value: {
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
});
