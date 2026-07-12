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
} from 'react-native-svg';
import { Colors, Typography, Spacing } from '../theme';
import {
  PlugZap,
  PowerOff,
  SunMedium,
  Cpu,
  Battery,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
  BatteryCharging,
  House,
} from 'lucide-react-native';

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

  const formatPower = (watts: number) => {
    return `${Math.round(watts)}W`;
  };

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

  // Solar glow/pulse & rotation animation
  const solarPulse = useRef(new Animated.Value(1)).current;
  const solarRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pvPower > 0) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(solarPulse, {
            toValue: 0.4,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(solarPulse, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();

      const rotateLoop = Animated.loop(
        Animated.timing(solarRotate, {
          toValue: 1,
          duration: 12000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      rotateLoop.start();

      return () => {
        pulseLoop.stop();
        rotateLoop.stop();
      };
    } else {
      solarPulse.setValue(1);
      solarRotate.setValue(0);
    }
  }, [pvPower]);

  const solarSpin = solarRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Battery icon selection based on state and SoC
  const getBatteryIcon = () => {
    if (isCharging) {
      return <BatteryCharging size={20} color={batteryColor} strokeWidth={2} />;
    }
    if (batterySoc > 80) {
      return <BatteryFull size={20} color={batteryColor} strokeWidth={2} />;
    }
    if (batterySoc > 30) {
      return <BatteryMedium size={20} color={batteryColor} strokeWidth={2} />;
    }
    if (batterySoc > 10) {
      return <BatteryLow size={20} color={batteryColor} strokeWidth={2} />;
    }
    return <BatteryWarning size={20} color={batteryColor} strokeWidth={2} />;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Power Flow</Text>
      <View style={styles.diagram}>
        {/* Fixed coordinate wrapper to align absolute dots and labels with SVG */}
        <View style={styles.canvas}>
          <Svg key={gridOn ? 'grid-on' : 'grid-off'} width="280" height="230" viewBox="0 0 280 230">
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

            {/* Node: Solar */}
            <Circle cx={nodes.solar.x} cy={nodes.solar.y} r="16" fill={Colors.surfaceElevated} stroke={solarColor} strokeWidth="2" />

            {/* Node: Inverter (center hub) */}
            <Circle cx={nodes.inverter.x} cy={nodes.inverter.y} r="20" fill={Colors.surface} stroke={Colors.amber} strokeWidth="2.5" />

            {/* Node: Battery */}
            <Circle cx={nodes.battery.x} cy={nodes.battery.y} r="16" fill={Colors.surfaceElevated} stroke={batteryColor} strokeWidth="2" />

            {/* Node: House */}
            <Circle cx={nodes.house.x} cy={nodes.house.y} r="18" fill={Colors.surfaceElevated} stroke={Colors.amberLight} strokeWidth="2" />
          </Svg>

          {/* Absolute overlay Lucide Icons */}
          {/* Grid Icon */}
          <View style={[styles.iconOverlay, { left: nodes.grid.x - 10, top: nodes.grid.y - 10 }]}>
            {gridOn ? (
              <PlugZap size={20} color={gridColor} strokeWidth={2} />
            ) : (
              <PowerOff size={20} color={gridColor} strokeWidth={2} />
            )}
          </View>

          {/* Solar Icon with pulse/glow/rotation */}
          <Animated.View style={[
            styles.iconOverlay, 
            { 
              left: nodes.solar.x - 10, 
              top: nodes.solar.y - 10, 
              opacity: solarPulse,
              transform: [{ rotate: solarSpin }]
            }
          ]}>
            <View>
              <SunMedium size={20} color={solarColor} strokeWidth={2} />
            </View>
          </Animated.View>

          {/* Inverter Icon */}
          <View style={[styles.iconOverlay, { left: nodes.inverter.x - 12, top: nodes.inverter.y - 12 }]}>
            <Cpu size={24} color={Colors.amber} strokeWidth={2} />
          </View>

          {/* Battery Icon */}
          <View style={[styles.iconOverlay, { left: nodes.battery.x - 10, top: nodes.battery.y - 10 }]}>
            {getBatteryIcon()}
          </View>

          {/* House Icon */}
          <View style={[styles.iconOverlay, { left: nodes.house.x - 10, top: nodes.house.y - 10 }]}>
            <House size={20} color={Colors.amberLight} strokeWidth={2} />
          </View>

          {/* Overlay text labels below/above nodes */}
          <View style={[styles.nodeLabel, { left: nodes.grid.x - 30, top: nodes.grid.y + 20, width: 60 }]}>
            <Text style={styles.nodeLabelTitle}>Grid</Text>
            {gridOn && (
              wirePower > 0 ? (
                <Text style={styles.subText}>{formatPower(wirePower)}</Text>
              ) : wirePower < 0 ? (
                <Text style={styles.subText}>{formatPower(Math.abs(wirePower))}</Text>
              ) : (
                <Text style={styles.subText}>0W</Text>
              )
            )}
          </View>
          <View style={[styles.nodeLabel, { left: nodes.solar.x - 30, top: nodes.solar.y - 42, width: 60 }]}>
            <Text style={styles.nodeLabelTitle}>Solar</Text>
            {pvPower > 0 && <Text style={styles.subText}>{formatPower(pvPower)}</Text>}
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
            {usePower > 0 && <Text style={styles.subText}>{formatPower(usePower)}</Text>}
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
          {gridOn && wirePower < 0 && (
            <FlowDot
              color={Colors.success}
              x1={nodes.inverter.x - 20} y1={nodes.inverter.y}
              x2={nodes.grid.x + 18} y2={nodes.grid.y}
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
  iconOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
