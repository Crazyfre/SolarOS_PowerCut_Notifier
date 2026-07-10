import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { Colors, BorderRadius, Typography, Spacing } from '../theme';

interface BatteryBarProps {
  soc: number;          // 0–100
  voltage?: number;     // optional battery voltage
  isCharging?: boolean;
  large?: boolean;
}

function getSocColor(soc: number): string {
  if (soc > 50) return Colors.success;
  if (soc > 20) return Colors.amber;
  return Colors.danger;
}

export function BatteryBar({ soc, voltage, isCharging, large }: BatteryBarProps) {
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const clampedSoc = Math.max(0, Math.min(100, soc));
  const fillColor = getSocColor(clampedSoc);

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: clampedSoc,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clampedSoc]);

  // Pulse animation when SoC is critical
  useEffect(() => {
    if (clampedSoc <= 10) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.5,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [clampedSoc]);

  const barHeight = large ? 20 : 12;
  const fontSize = large ? Typography.fontSize['3xl'] : Typography.fontSize['2xl'];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Animated.Text
          style={[
            styles.percentage,
            { fontSize, color: fillColor, opacity: pulseAnim },
          ]}
        >
          {clampedSoc}%
        </Animated.Text>
        <View style={styles.statusRow}>
          {isCharging !== undefined && (
            <Text style={[styles.statusText, { color: isCharging ? Colors.success : Colors.amber }]}>
              {isCharging ? '⚡ Charging' : '🔋 Discharging'}
            </Text>
          )}
          {voltage !== undefined && (
            <Text style={styles.voltageText}>{voltage.toFixed(1)} V</Text>
          )}
        </View>
      </View>

      {/* Battery shell */}
      <View style={[styles.batteryShell, { height: barHeight + 8 }]}>
        <View style={[styles.batteryBody, { height: barHeight }]}>
          <Animated.View
            style={[
              styles.batteryFill,
              {
                width: animatedWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: fillColor,
                // Glow effect for critical
                shadowColor: fillColor,
                shadowOpacity: clampedSoc <= 20 ? 0.8 : 0.3,
                shadowRadius: 6,
                elevation: 3,
              },
            ]}
          />
          {/* Segment lines */}
          {[25, 50, 75].map((mark) => (
            <View
              key={mark}
              style={[styles.segmentLine, { left: `${mark}%` as unknown as number }]}
            />
          ))}
        </View>
        <View style={styles.batteryTerminal} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Spacing.sm,
  },
  percentage: {
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: -1,
  },
  statusRow: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statusText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
  },
  voltageText: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  batteryShell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryBody: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
    position: 'relative',
  },
  batteryFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: BorderRadius.sm,
  },
  segmentLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: Colors.overlay,
  },
  batteryTerminal: {
    width: 6,
    height: 12,
    backgroundColor: Colors.textMuted,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    marginLeft: 2,
  },
});
