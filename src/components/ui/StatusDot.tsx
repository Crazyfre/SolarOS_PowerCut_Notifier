// StatusDot — the universal state indicator.
// Modes: 'steady' (a state), 'breathing' (live/active — 2s cadence),
// 'flashing' (alarm — 4 cycles then settles steady; infinite flashing is
// unusable). Always paired with a text label per the design rules.

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, StyleProp, ViewStyle } from 'react-native';

interface StatusDotProps {
  color: string;
  mode?: 'steady' | 'breathing' | 'flashing';
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function StatusDot({ color, mode = 'steady', size = 8, style }: StatusDotProps) {
  const theme = useThemeSafe();
  const breatheMs = theme?.motion.breatheDuration ?? 2000;

  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (mode === 'steady') {
      opacity.stopAnimation(() => opacity.setValue(1));
      return;
    }
    if (mode === 'breathing') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.35,
            duration: breatheMs / 2,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: breatheMs / 2,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    // flashing: 4 rapid cycles, then steady
    const seq: Animated.CompositeAnimation[] = [];
    for (let i = 0; i < 4; i++) {
      seq.push(Animated.timing(opacity, { toValue: 0.15, duration: 160, useNativeDriver: true }));
      seq.push(Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }));
    }
    const anim = Animated.sequence(seq);
    anim.start();
    return () => anim.stop();
  }, [mode, color, breatheMs, opacity]);

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
        },
        style,
      ]}
    />
  );
}

// Theme import kept lazy-safe: dot is often used inside theme context, but
// allow standalone usage without crashing.
import { useTheme } from '../../theme';
function useThemeSafe() {
  try {
    return useTheme();
  } catch {
    return null;
  }
}

const _ = StyleSheet; // (reserved for future static styles)
void _;
