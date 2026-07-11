import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Colors, BorderRadius, Typography, Spacing, Shadows } from '../theme';
import { TelemetryData } from '../types/telemetry';

interface OutageAlertProps {
  telemetry: TelemetryData;
  outageStartTime?: number | null;
}

function useElapsedTime(startTime?: number | null): string {
  const [elapsed, setElapsed] = React.useState('');

  useEffect(() => {
    if (!startTime) {
      setElapsed('');
      return;
    }

    const update = () => {
      const ms = Date.now() - startTime;
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (hours > 0) {
        setElapsed(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setElapsed(`${minutes}m ${seconds}s`);
      } else {
        setElapsed(`${seconds}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return elapsed;
}

export function OutageAlert({ telemetry, outageStartTime }: OutageAlertProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const elapsed = useElapsedTime(outageStartTime);

  const soc = telemetry.batterySoc ?? 0;
  const load = telemetry.usePower ?? Math.abs(telemetry.batteryPower ?? 0);
  const discharge = Math.abs(telemetry.batteryPower ?? 0);

  // Pulsing border/glow
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Icon scale pulse
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const borderOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          borderColor: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [Colors.danger + '66', Colors.danger],
          }),
        },
      ]}
    >
      {/* Background glow */}
      <View style={styles.glowBg} />

      {/* Header */}
      <View style={styles.header}>
        <Animated.Text
          style={[styles.alertIcon, { transform: [{ scale: pulseAnim }] }]}
        >
          ⚡
        </Animated.Text>
        <View>
          <Text style={styles.alertTitle}>POWER CUT</Text>
          <Text style={styles.alertSubtitle}>Running on Battery Backup</Text>
        </View>
      </View>

      {/* Elapsed time */}
      {elapsed ? (
        <View style={styles.elapsedRow}>
          <Text style={styles.elapsedLabel}>Outage Duration</Text>
          <Text style={styles.elapsedValue}>{elapsed}</Text>
        </View>
      ) : null}

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{soc}%</Text>
          <Text style={styles.statLabel}>Battery</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{load}W</Text>
          <Text style={styles.statLabel}>Load</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{discharge}W</Text>
          <Text style={styles.statLabel}>Batt. Out</Text>
        </View>
      </View>

      {/* Warning for low battery */}
      {soc <= 20 && (
        <View style={styles.lowBatteryWarning}>
          <Text style={styles.lowBatteryText}>
            ⚠️ Battery low — charge soon or reduce load
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    marginBottom: Spacing.base,
    overflow: 'hidden',
    ...Shadows.danger,
  },
  glowBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.dangerGlow,
    borderRadius: BorderRadius.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.base,
  },
  alertIcon: {
    fontSize: 40,
  },
  alertTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize['2xl'],
    color: Colors.danger,
    letterSpacing: 2,
  },
  alertSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  elapsedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.glassLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.base,
  },
  elapsedLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  elapsedValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.dangerLight,
    fontVariant: ['tabular-nums'],
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize['2xl'],
    color: Colors.textPrimary,
  },
  statLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.divider,
  },
  lowBatteryWarning: {
    marginTop: Spacing.md,
    backgroundColor: Colors.warningGlow,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  lowBatteryText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.amberLight,
    textAlign: 'center',
  },
});
