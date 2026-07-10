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
  Rect,
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

// Flow dot component that animates along a path with symmetric speed
function FlowDot({ color, x1, y1, x2, y2, delay = 0, speed = 45 }: {
  color: string;
  x1: number; y1: number;
  x2: number; y2: number;
  delay?: number;
  speed?: number; // Pixels per second
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const duration = (distance / speed) * 1000;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: duration,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [x1, y1, x2, y2, speed, delay]);

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

  // Node positions (relative to a 280×230 canvas) forming a perfect symmetric cross (90px spacing)
  const nodes = {
    grid: { x: 50, y: 115 },
    solar: { x: 140, y: 25 },
    inverter: { x: 140, y: 115 },
    battery: { x: 140, y: 205 },
    house: { x: 230, y: 115 },
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
          <Svg width="280" height="230" viewBox="0 0 280 230">
            {/* Connection lines */}
            {/* Grid ↔ Inverter */}
            <Line
              x1={nodes.grid.x + 18} y1={nodes.grid.y}
              x2={nodes.inverter.x - 20} y2={nodes.inverter.y}
              stroke={gridOn ? Colors.success + '40' : Colors.danger + '20'}
              strokeWidth="2"
              strokeDasharray="5,4"
            />
            {/* Solar → Inverter */}
            <Line
              x1={nodes.solar.x} y1={nodes.solar.y + 16}
              x2={nodes.inverter.x} y2={nodes.inverter.y - 20}
              stroke={pvPower > 0 ? Colors.amber + '40' : Colors.textMuted + '20'}
              strokeWidth="2"
              strokeDasharray="5,4"
            />
            {/* Inverter → House */}
            <Line
              x1={nodes.inverter.x + 20} y1={nodes.inverter.y}
              x2={nodes.house.x - 18} y2={nodes.house.y}
              stroke={usePower > 0 ? Colors.amber + '40' : Colors.textMuted + '20'}
              strokeWidth="2"
              strokeDasharray="5,4"
            />
            {/* Inverter ↔ Battery */}
            <Line
              x1={nodes.inverter.x} y1={nodes.inverter.y + 20}
              x2={nodes.battery.x} y2={nodes.battery.y - 16}
              stroke={batteryColor + '40'}
              strokeWidth="2"
              strokeDasharray="5,4"
            />

            {/* Node: Grid */}
            <Circle cx={nodes.grid.x} cy={nodes.grid.y} r="18" fill={Colors.surfaceElevated} stroke={gridColor} strokeWidth="2" />
            {/* SVG Plug Icon for Grid */}
            <Path
              d={`M ${nodes.grid.x - 4} ${nodes.grid.y - 6} h 8 v 6 a 4 4 0 0 1 -8 0 z M ${nodes.grid.x - 2} ${nodes.grid.y - 10} v 4 M ${nodes.grid.x + 2} ${nodes.grid.y - 10} v 4 M ${nodes.grid.x} ${nodes.grid.y + 4} v 6`}
              stroke={gridColor}
              strokeWidth="1.5"
              fill="none"
            />

            {/* Node: Solar */}
            <Circle cx={nodes.solar.x} cy={nodes.solar.y} r="16" fill={Colors.surfaceElevated} stroke={solarColor} strokeWidth="2" />
            {/* SVG Sun Icon for Solar */}
            <Circle cx={nodes.solar.x} cy={nodes.solar.y} r="6" fill="none" stroke={solarColor} strokeWidth="1.5" />
            <Path
              d={`M ${nodes.solar.x} ${nodes.solar.y - 10} v 2 M ${nodes.solar.x} ${nodes.solar.y + 8} v 2 M ${nodes.solar.x - 10} ${nodes.solar.y} h 2 M ${nodes.solar.x + 8} ${nodes.solar.y} h 2 M ${nodes.solar.x - 7} ${nodes.solar.y - 7} l 1.5 1.5 M ${nodes.solar.x + 5.5} ${nodes.solar.y + 5.5} l 1.5 1.5 M ${nodes.solar.x - 7} ${nodes.solar.y + 7} l 1.5 -1.5 M ${nodes.solar.x + 5.5} ${nodes.solar.y - 5.5} l 1.5 -1.5`}
              stroke={solarColor}
              strokeWidth="1.5"
            />

            {/* Node: Inverter (center hub) */}
            <Circle cx={nodes.inverter.x} cy={nodes.inverter.y} r="20" fill={Colors.surface} stroke={Colors.amber} strokeWidth="2.5" />
            {/* SVG Inverter Sine/Wave Icon */}
            <Path
              d={`M ${nodes.inverter.x - 10} ${nodes.inverter.y} q 5 -6 10 0 t 10 0`}
              stroke={Colors.amber}
              strokeWidth="2"
              fill="none"
            />
            <Path
              d={`M ${nodes.inverter.x - 8} ${nodes.inverter.y + 5} h 16`}
              stroke={Colors.textMuted}
              strokeWidth="1.5"
              strokeDasharray="2,2"
            />

            {/* Node: Battery */}
            <Circle cx={nodes.battery.x} cy={nodes.battery.y} r="16" fill={Colors.surfaceElevated} stroke={batteryColor} strokeWidth="2" />
            {/* SVG Battery Icon */}
            <Rect x={nodes.battery.x - 6} y={nodes.battery.y - 8} width="12" height="16" rx="2" fill="none" stroke={batteryColor} strokeWidth="1.5" />
            <Rect x={nodes.battery.x - 2} y={nodes.battery.y - 11} width="4" height="3" fill={batteryColor} />
            {/* Dynamic Charge Fill Bar */}
            {batterySoc > 0 && (
              <Rect
                x={nodes.battery.x - 4}
                y={nodes.battery.y - 6 + (12 - 12 * (batterySoc / 100))}
                width="8"
                height={12 * (batterySoc / 100)}
                fill={batteryColor}
                opacity="0.8"
              />
            )}

            {/* Node: House */}
            <Circle cx={nodes.house.x} cy={nodes.house.y} r="18" fill={Colors.surfaceElevated} stroke={Colors.amberLight} strokeWidth="2" />
            {/* SVG House Icon */}
            <Path
              d={`M ${nodes.house.x - 8} ${nodes.house.y + 6} v -7 l 8 -6 l 8 6 v 7 z`}
              stroke={Colors.amberLight}
              strokeWidth="1.5"
              fill="none"
            />
            <Rect x={nodes.house.x - 2} y={nodes.house.y + 1} width="4" height="5" fill="none" stroke={Colors.amberLight} strokeWidth="1" />
          </Svg>

          {/* Overlay text labels below/above nodes */}
          <View style={[styles.nodeLabel, { left: nodes.grid.x - 30, top: nodes.grid.y + 20, width: 60 }]}>
            <Text style={styles.nodeLabelTitle}>Grid</Text>
            {gridOn && wirePower > 0 && <Text style={styles.subText}>{wirePower}W</Text>}
          </View>
          <View style={[styles.nodeLabel, { left: nodes.solar.x - 30, top: nodes.solar.y - 28, width: 60 }]}>
            <Text style={styles.nodeLabelTitle}>Solar</Text>
            {pvPower > 0 && <Text style={styles.subText}>{pvPower}W</Text>}
          </View>
          <View style={[styles.nodeLabel, { left: nodes.inverter.x - 30, top: nodes.inverter.y + 22, width: 60 }]}>
            <Text style={styles.nodeLabelTitle}>Inverter</Text>
          </View>
          <View style={[styles.nodeLabel, { left: nodes.battery.x - 30, top: nodes.battery.y + 18, width: 60 }]}>
            <Text style={styles.nodeLabelTitle}>Battery</Text>
            <Text style={styles.subText}>{batterySoc}%</Text>
          </View>
          <View style={[styles.nodeLabel, { left: nodes.house.x - 30, top: nodes.house.y + 20, width: 60 }]}>
            <Text style={styles.nodeLabelTitle}>Load</Text>
            {usePower > 0 && <Text style={styles.subText}>{usePower}W</Text>}
          </View>

          {/* Animated flow dots (symmetric speed) */}
          {gridOn && wirePower > 0 && (
            <FlowDot
              color={Colors.success}
              x1={nodes.grid.x + 18} y1={nodes.grid.y}
              x2={nodes.inverter.x - 20} y2={nodes.inverter.y}
              delay={0}
            />
          )}
          {pvPower > 0 && (
            <FlowDot
              color={Colors.amberLight}
              x1={nodes.solar.x} y1={nodes.solar.y + 16}
              x2={nodes.inverter.x} y2={nodes.inverter.y - 20}
              delay={100}
            />
          )}
          {usePower > 0 && (
            <FlowDot
              color={Colors.amber}
              x1={nodes.inverter.x + 20} y1={nodes.inverter.y}
              x2={nodes.house.x - 18} y2={nodes.house.y}
              delay={300}
            />
          )}
          {isDischarging && (
            <FlowDot
              color={Colors.amber}
              x1={nodes.battery.x} y1={nodes.battery.y - 16}
              x2={nodes.inverter.x} y2={nodes.inverter.y + 20}
              delay={150}
            />
          )}
          {isCharging && (
            <FlowDot
              color={Colors.blue}
              x1={nodes.inverter.x} y1={nodes.inverter.y + 20}
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
  nodeLabelTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 10,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subText: {
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
