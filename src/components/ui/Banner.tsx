// Banner — the single-slot status banner system.
// Variants map 1:1 to the monitoring state machine:
//   connected  — grid on (sub-state: exporting / importing / standby)
//   battery     — grid off, SoC above warning threshold
//   critical    — grid off, SoC at/below threshold (alarm treatment)
//   error       — fetch/auth failures (action: sign in)
//   info        — update available / Expo Go notice
// Exactly one banner renders at a time, chosen by priority rank.

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ViewStyle,
} from 'react-native';
import { useTheme, ThemeColors, Typography, Spacing, BorderRadius } from '../../theme';
import { StatusDot } from './StatusDot';
import { Button } from './Button';

export type BannerVariant =
  | 'connected'
  | 'battery'
  | 'critical'
  | 'error'
  | 'info';

export interface BannerAction {
  label: string;
  onPress: () => void;
}

interface BannerProps {
  variant: BannerVariant;
  title: string;
  subtitle?: string;
  /** mono-formatted metric row (elapsed time, SoC, backup estimate) */
  metrics?: { label: string; value: string }[];
  actions?: BannerAction[];
  onPress?: () => void;
  /** visual tone override for info (update=info, expogo=brand) */
  infoTone?: 'info' | 'brand';
  testID?: string;
}

function variantColors(
  colors: ThemeColors,
  variant: BannerVariant,
  infoTone: 'info' | 'brand'
) {
  switch (variant) {
    case 'connected':
      return { fill: colors.successFill, border: colors.successBorder, tone: colors.success, toneText: colors.successText };
    case 'battery':
      return { fill: colors.warningFill, border: colors.warningBorder, tone: colors.warning, toneText: colors.warningText };
    case 'critical':
      return { fill: colors.dangerFill, border: colors.dangerBorder, tone: colors.danger, toneText: colors.dangerText };
    case 'error':
      return { fill: colors.dangerFill, border: colors.dangerBorder, tone: colors.danger, toneText: colors.dangerText };
    case 'info':
      return infoTone === 'brand'
        ? { fill: 'rgba(245,166,35,0.10)', border: 'rgba(245,166,35,0.35)', tone: colors.brand, toneText: colors.brandBright }
        : { fill: colors.infoFill, border: colors.infoBorder, tone: colors.info, toneText: colors.infoText };
  }
}

export function Banner({
  variant,
  title,
  subtitle,
  metrics,
  actions,
  onPress,
  infoTone = 'info',
  testID,
}: BannerProps) {
  const { colors, shadows, motion } = useTheme();
  const v = variantColors(colors, variant, infoTone);

  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (variant !== 'critical') {
      flash.setValue(0);
      return;
    }
    // Alarm flash: 4 cycles then steady — never loops forever
    const seq: Animated.CompositeAnimation[] = [];
    for (let i = 0; i < 4; i++) {
      seq.push(Animated.timing(flash, { toValue: 1, duration: 150, useNativeDriver: true }));
      seq.push(Animated.timing(flash, { toValue: 0, duration: 150, useNativeDriver: true }));
    }
    const anim = Animated.sequence(seq);
    anim.start();
    return () => anim.stop();
  }, [variant, flash]);

  const isAlarm = variant === 'critical';
  const dotMode = variant === 'critical' ? 'flashing' : variant === 'connected' ? 'breathing' : 'steady';

  const containerStyle: ViewStyle = {
    backgroundColor: v.fill,
    borderColor: v.border,
    ...(isAlarm ? shadows.glow(v.tone) : null),
  };

  const Row = onPress ? TouchableOpacity : View;

  const content = (
    <>
      {isAlarm ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: v.tone, opacity: flash }]}
        />
      ) : null}
      <View style={styles.topRow}>
        <StatusDot color={v.tone} mode={dotMode} size={10} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
      {metrics && metrics.length > 0 ? (
        <View style={[styles.metrics, { borderColor: colors.border }]}>
          {metrics.map((m) => (
            <View key={m.label} style={styles.metric}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{m.label}</Text>
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{m.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {actions && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((a, i) => (
            <Button
              key={a.label}
              label={a.label}
              onPress={a.onPress}
              variant={i === 0 ? (variant === 'critical' ? 'danger' : 'primary') : 'secondary'}
              size="sm"
            />
          ))}
        </View>
      ) : null}
    </>
  );

  return (
    <Row
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}${subtitle ? `. ${subtitle}` : ''}`}
      testID={testID}
      style={[styles.banner, containerStyle]}
    >
      {content}
    </Row>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.base,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize.lg,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    marginTop: Spacing.xs,
    lineHeight: 18,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.xl,
  },
  metric: {
    minWidth: 80,
  },
  metricLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.base,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
});
