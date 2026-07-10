import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import Svg, {
  Circle,
  Line,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Path,
} from 'react-native-svg';
import { Colors, Typography, Spacing } from '../theme';

interface PowerFlowProps {
  gridOn: boolean;
  pvPower?: number;
  batteryStatus: 'CHARGE' | 'DISCHARGE' | 'IDLE' | string;
  usePower?: number;
  wirePower?: number;
  batterySoc?: number;
}

// Flow dot component that animates along a path
function FlowDot({ color, x1, y1, x2, y2, delay = 0 }: {
  color: string;
  x1: number; y1: number;
  x2: number; y2: number;
  delay?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const cx = anim.interpolate({ inputRange: [0, 1], outputRange: [x1, x2] });
  const cy = anim.interpolate({ inputRange: [0, 1], outputRange: [y1, y2] });

  return (
    <Animated.View
      style={[
        styles.flowDot,
        {
          backgroundColor: color,
          transform: [{ translateX: cx }, { translateY: cy }],
        },
      ]}
    />
  );
}

export function PowerFlowDiagram({
  gridOn,
  pvPower = 0,
  batteryStatus,
  usePower = 0,
  wirePower = 0,
  batterySoc = 0,
}: PowerFlowProps) {
  const isDischarging = batteryStatus === 'DISCHARGE';
  const isCharging = batteryStatus === 'CHARGE';

  // Node positions (relative to a 280×200 canvas)
  const nodes = {
    grid: { x: 30, y: 100 },
    solar: { x: 140, y: 20 },
    inverter: { x: 140, y: 100 },
    battery: { x: 140, y: 180 },
    house: { x: 250, y: 100 },
  };

  const gridColor = gridOn ? Colors.success : Colors.danger;
  const batteryColor = isDischarging ? Colors.amber : isCharging ? Colors.blue : Colors.textMuted;
  const solarColor = pvPower > 0 ? Colors.amberLight : Colors.textMuted;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Power Flow</Text>
      <View style={styles.diagram}>
        {/* Fixed coordinate wrapper to align absolute dots and labels with SVG */}
        <View style={styles.canvas}>
          <Svg width="280" height="200" viewBox="0 0 280 200">
            <Defs>
              <SvgLinearGradient id="gridGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={gridColor} stopOpacity="0.8" />
                <Stop offset="1" stopColor={Colors.amber} stopOpacity="0.8" />
              </SvgLinearGradient>
            </Defs>

            {/* Connection lines */}
            {/* Grid → Inverter */}
            <Line
              x1={nodes.grid.x + 18} y1={nodes.grid.y}
              x2={nodes.inverter.x - 18} y2={nodes.inverter.y}
              stroke={gridOn ? Colors.success + '60' : Colors.danger + '40'}
              strokeWidth="2"
              strokeDasharray="6,4"
            />
            {/* Solar → Inverter */}
            <Line
              x1={nodes.solar.x} y1={nodes.solar.y + 16}
              x2={nodes.inverter.x} y2={nodes.inverter.y - 18}
              stroke={solarColor + '60'}
              strokeWidth="2"
              strokeDasharray="6,4"
            />
            {/* Inverter → House */}
            <Line
              x1={nodes.inverter.x + 18} y1={nodes.inverter.y}
              x2={nodes.house.x - 18} y2={nodes.house.y}
              stroke={Colors.amber + '60'}
              strokeWidth="2"
              strokeDasharray="6,4"
            />
            {/* Inverter ↔ Battery */}
            <Line
              x1={nodes.inverter.x} y1={nodes.inverter.y + 18}
              x2={nodes.battery.x} y2={nodes.battery.y - 16}
              stroke={batteryColor + '60'}
              strokeWidth="2"
              strokeDasharray="6,4"
            />

            {/* Node: Grid */}
            <Circle cx={nodes.grid.x} cy={nodes.grid.y} r="18" fill={Colors.surfaceElevated} stroke={gridColor} strokeWidth="2" />
            {/* Node: Solar */}
            <Circle cx={nodes.solar.x} cy={nodes.solar.y} r="16" fill={Colors.surfaceElevated} stroke={solarColor} strokeWidth="2" />
            {/* Node: Inverter (center hub) */}
            <Circle cx={nodes.inverter.x} cy={nodes.inverter.y} r="20" fill={Colors.surface} stroke={Colors.amber} strokeWidth="2.5" />
            {/* Node: Battery */}
            <Circle cx={nodes.battery.x} cy={nodes.battery.y} r="16" fill={Colors.surfaceElevated} stroke={batteryColor} strokeWidth="2" />
            {/* Node: House */}
            <Circle cx={nodes.house.x} cy={nodes.house.y} r="18" fill={Colors.surfaceElevated} stroke={Colors.amberLight} strokeWidth="2" />
          </Svg>

          {/* Overlay labels */}
          <View style={[styles.nodeLabel, { left: nodes.grid.x - 20, top: nodes.grid.y + 20, width: 40 }]}>
            <Text style={styles.nodeLabelText}>{gridOn ? '🔌' : '❌'}</Text>
            <Text style={styles.nodeLabelTitle}>Grid</Text>
          </View>
          <View style={[styles.nodeLabel, { left: nodes.solar.x - 25, top: nodes.solar.y + 18, width: 50 }]}>
            <Text style={styles.nodeLabelText}>☀️</Text>
            <Text style={styles.nodeLabelTitle}>{pvPower > 0 ? `${pvPower}W` : 'Solar'}</Text>
          </View>
          <View style={[styles.nodeLabel, { left: nodes.inverter.x - 25, top: nodes.inverter.y - 18, width: 50 }]}>
            <Text style={styles.nodeLabelTitle}>⚡ INV</Text>
          </View>
          <View style={[styles.nodeLabel, { left: nodes.battery.x - 25, top: nodes.battery.y + 18, width: 50 }]}>
            <Text style={styles.nodeLabelText}>🔋</Text>
            <Text style={styles.nodeLabelTitle}>{batterySoc}%</Text>
          </View>
          <View style={[styles.nodeLabel, { left: nodes.house.x - 25, top: nodes.house.y + 20, width: 50 }]}>
            <Text style={styles.nodeLabelText}>🏠</Text>
            <Text style={styles.nodeLabelTitle}>{usePower > 0 ? `${usePower}W` : 'Home'}</Text>
          </View>

          {/* Animated flow dots */}
          {gridOn && (
            <FlowDot
              color={Colors.success}
              x1={nodes.grid.x + 18} y1={nodes.grid.y}
              x2={nodes.inverter.x - 18} y2={nodes.inverter.y}
              delay={0}
            />
          )}
          {pvPower > 0 && (
            <FlowDot
              color={Colors.amberLight}
              x1={nodes.solar.x} y1={nodes.solar.y + 16}
              x2={nodes.inverter.x} y2={nodes.inverter.y - 18}
              delay={100}
            />
          )}
          <FlowDot
            color={Colors.amber}
            x1={nodes.inverter.x + 18} y1={nodes.inverter.y}
            x2={nodes.house.x - 18} y2={nodes.house.y}
            delay={300}
          />
          {isDischarging && (
            <FlowDot
              color={Colors.amberLight}
              x1={nodes.battery.x} y1={nodes.battery.y - 16}
              x2={nodes.inverter.x} y2={nodes.inverter.y + 18}
              delay={150}
            />
          )}
          {isCharging && (
            <FlowDot
              color={Colors.blue}
              x1={nodes.inverter.x} y1={nodes.inverter.y + 18}
              x2={nodes.battery.x} y2={nodes.battery.y - 16}
              delay={150}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.base,
  },
  label: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  diagram: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: 280,
    height: 230,
    position: 'relative',
  },
  nodeLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeLabelText: {
    fontSize: 14,
  },
  nodeLabelTitle: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 9,
    color: Colors.textSecondary,
    marginTop: 1,
    textAlign: 'center',
  },
  flowDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    left: -4,
    top: -4,
  },
});
