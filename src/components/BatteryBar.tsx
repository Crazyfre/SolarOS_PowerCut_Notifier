import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Colors, BorderRadius, Typography, Spacing } from '../theme';

interface BatteryBarProps {
  soc: number;          // 0–100
  voltage?: number;     // battery voltage
  isCharging?: boolean;
  large?: boolean;
  estimatedBackupText?: string;
  amoled?: boolean;
}

function getSocColor(soc: number): string {
  if (soc > 50) return Colors.success;
  if (soc > 20) return Colors.amber;
  return Colors.danger;
}

export function BatteryBar({
  soc,
  voltage,
  isCharging,
  large,
  estimatedBackupText,
  amoled,
}: BatteryBarProps) {
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

  // Build character visualization: e.g. ███████████████░ (16 blocks total)
  const totalBlocks = 16;
  const numFilled = Math.round((clampedSoc / 100) * totalBlocks);
  const numEmpty = totalBlocks - numFilled;
  const blockBarString = '█'.repeat(Math.max(0, numFilled)) + '░'.repeat(Math.max(0, numEmpty));

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
              {isCharging ? '▲ Charging' : '▼ Discharging'}
            </Text>
          )}
          {voltage !== undefined && (
            <Text style={styles.voltageText}>{voltage.toFixed(1)}V</Text>
          )}
        </View>
      </View>

      {/* Character block bar */}
      <Text style={[styles.blockBar, { color: fillColor }]}>{blockBarString}</Text>

      {/* Backup time estimation */}
      {estimatedBackupText && (
        <View style={styles.backupContainer}>
          <Text style={styles.backupLabel}>Estimated Backup</Text>
          <Text style={styles.backupValue}>{estimatedBackupText}</Text>
        </View>
      )}
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
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
  },
  voltageText: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  blockBar: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.lg,
    letterSpacing: 2,
    marginVertical: Spacing.md,
  },
  backupContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  backupLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  backupValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
    marginTop: 2,
  },
});
