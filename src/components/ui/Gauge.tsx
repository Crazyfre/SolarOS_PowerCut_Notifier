// Gauge — SVG battery gauge with tiered color and 25/50/75 tick marks.
// Replaces the ASCII `████░░░` bar. Readout in mono with tabular numerals.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, DimensionValue } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { useTheme, Typography, Spacing, BorderRadius } from '../../theme';

interface GaugeProps {
  /** 0–100 */
  value: number;
  /** tier color override; defaults to SoC tier mapping */
  color?: string;
  height?: number;
  width?: DimensionValue;
  /** show 25/50/75 tick marks */
  ticks?: boolean;
  testID?: string;
}

function socTier(soc: number, theme: ReturnType<typeof useTheme>['colors']) {
  if (soc > 50) return theme.success;
  if (soc > 20) return theme.warning;
  return theme.danger;
}

export function Gauge({
  value,
  color,
  height = 12,
  width = '100%',
  ticks = true,
  testID,
}: GaugeProps) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(100, value));
  const tierColor = color ?? socTier(clamped, colors);

  // Animate fill width on mount/value change
  const anim = useRef(new Animated.Value(0)).current;
  const prev = useRef(0);

  useEffect(() => {
    const target = clamped / 100;
    Animated.timing(anim, {
      toValue: target,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    prev.current = clamped;
  }, [clamped, anim]);

  const fillWidth = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={{ width, height: height + 4 }} testID={testID}>
      <View
        style={[
          styles.track,
          { height, borderRadius: height / 2, backgroundColor: colors.surface2 },
        ]}
      >
        {ticks && (
          <Svg
            width="100%"
            height={height}
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            {[25, 50, 75].map((t) => (
              <Line
                key={t}
                x1={t}
                y1={height * 0.25}
                x2={t}
                y2={height * 0.75}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1"
              />
            ))}
          </Svg>
        )}
        <Animated.View
          style={[
            styles.fill,
            {
              width: fillWidth as unknown as DimensionValue,
              height,
              borderRadius: height / 2,
              backgroundColor: tierColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

// Companion readout row: percentage + supporting values in mono
export function GaugeReadout({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.readoutRow}>
      <Text style={[styles.primary, { color: colors.textPrimary }]}>{primary}</Text>
      {secondary ? (
        <Text style={[styles.secondary, { color: colors.textSecondary }]}>{secondary}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
  primary: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize['3xl'],
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  secondary: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: Typography.fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
});
