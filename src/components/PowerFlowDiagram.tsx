// PowerFlowDiagram — SolarGuard's signature instrument.
// Symmetric cross layout: Grid ↔ Inverter (center) ↔ House, with Solar above
// and Battery below. Node chips are surface2 with hairline borders; status
// rings carry the state colors (grid green/red, battery blue/rose, solar
// amber). Flow dots run at constant speed — they represent real energy
// transfer. Responsive via viewBox scaling.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { useTheme, withAlpha, Typography } from '../theme';
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

// Canonical canvas — everything scales from this viewBox
const CANVAS_W = 300;
const CANVAS_H = 240;

const nodes = {
  grid: { x: 50, y: 120 },
  solar: { x: 150, y: 28 },
  inverter: { x: 150, y: 120 },
  battery: { x: 150, y: 212 },
  house: { x: 250, y: 120 },
};

function FlowDot({
  color,
  x1, y1, x2, y2,
  delay = 0,
  speed = 45,
  scale = 1,
}: {
  color: string;
  x1: number; y1: number;
  x2: number; y2: number;
  delay?: number;
  speed?: number;
  scale?: number;
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
          duration,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [x1, y1, x2, y2, speed, delay, anim]);

  const cx = anim.interpolate({ inputRange: [0, 1], outputRange: [x1, x2] });
  const cy = anim.interpolate({ inputRange: [0, 1], outputRange: [y1, y2] });

  return (
    <Animated.View
      style={[
        styles.flowDot,
        {
          backgroundColor: color,
          transform: [{ translateX: cx }, { translateY: cy }, { scale }],
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
  const { colors, motion } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const isDischarging = batteryStatus === 'DISCHARGE';
  const isCharging = batteryStatus === 'CHARGE';

  // Status colors — strict role mapping
  const gridColor = gridOn ? colors.success : colors.danger;
  const solarColor = pvPower > 0 ? colors.brand : colors.textDisabled;
  const batteryColor = isCharging
    ? colors.charge
    : isDischarging
      ? colors.discharge
      : colors.textSecondary;
  // Load is neutral by design — load is neither good nor bad; the flow
  // animation shows direction, color shows state.
  const loadColor = colors.textSecondary;

  // Scale canvas down on narrow screens so labels stay on-card
  const availWidth = Math.min(screenWidth - 48, CANVAS_W);
  const scale = availWidth / CANVAS_W;
  const scaledW = CANVAS_W * scale;
  const scaledH = CANVAS_H * scale;

  // Solar pulse (production is live)
  const solarPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (pvPower > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(solarPulse, { toValue: 0.45, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(solarPulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    solarPulse.setValue(1);
  }, [pvPower, solarPulse]);

  const formatPower = (watts: number) => `${Math.round(watts)}W`;

  const getBatteryIcon = () => {
    const size = 20;
    if (isCharging) return <BatteryCharging size={size} color={batteryColor} strokeWidth={2} />;
    if (batterySoc > 80) return <BatteryFull size={size} color={batteryColor} strokeWidth={2} />;
    if (batterySoc > 30) return <BatteryMedium size={size} color={batteryColor} strokeWidth={2} />;
    if (batterySoc > 10) return <BatteryLow size={size} color={batteryColor} strokeWidth={2} />;
    return <BatteryWarning size={size} color={batteryColor} strokeWidth={2} />;
  };

  const wireStroke = (active: boolean, color: string) =>
    active ? withAlpha(color, 45) : withAlpha(colors.textDisabled, 15);

  return (
    <View style={styles.container}>
      <View style={[styles.canvas, { width: scaledW, height: scaledH }]}>
        <Svg
          key={gridOn ? 'grid-on' : 'grid-off'}
          width={scaledW}
          height={scaledH}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        >
          {/* Connector wires (dashed hairlines; solid-ish when active) */}
          <Line
            x1={nodes.grid.x + 20} y1={nodes.grid.y}
            x2={nodes.inverter.x - 24} y2={nodes.inverter.y}
            stroke={wireStroke(gridOn, gridColor)}
            strokeWidth={gridOn ? 2.5 : 2}
            strokeDasharray={gridOn ? undefined : '5,4'}
          />
          <Line
            x1={nodes.solar.x} y1={nodes.solar.y + 18}
            x2={nodes.inverter.x} y2={nodes.inverter.y - 24}
            stroke={wireStroke(pvPower > 0, solarColor)}
            strokeWidth={pvPower > 0 ? 2.5 : 2}
            strokeDasharray={pvPower > 0 ? undefined : '5,4'}
          />
          <Line
            x1={nodes.inverter.x + 24} y1={nodes.inverter.y}
            x2={nodes.house.x - 20} y2={nodes.house.y}
            stroke={wireStroke(usePower > 0, loadColor)}
            strokeWidth={usePower > 0 ? 2.5 : 2}
            strokeDasharray={usePower > 0 ? undefined : '5,4'}
          />
          <Line
            x1={nodes.inverter.x} y1={nodes.inverter.y + 24}
            x2={nodes.battery.x} y2={nodes.battery.y - 18}
            stroke={wireStroke(isCharging || isDischarging, batteryColor)}
            strokeWidth={isCharging || isDischarging ? 2.5 : 2}
            strokeDasharray={isCharging || isDischarging ? undefined : '5,4'}
          />

          {/* Node chips: surface2 fill + status ring + outer hairline */}
          {/* Grid */}
          <Circle cx={nodes.grid.x} cy={nodes.grid.y} r="19" fill={colors.surface2} stroke={withAlpha(gridColor, 30)} strokeWidth="6" />
          <Circle cx={nodes.grid.x} cy={nodes.grid.y} r="19" fill={colors.surface2} stroke={gridColor} strokeWidth="2" />
          {/* Solar */}
          <Circle cx={nodes.solar.x} cy={nodes.solar.y} r="17" fill={colors.surface2} stroke={withAlpha(solarColor, 30)} strokeWidth="6" />
          <Circle cx={nodes.solar.x} cy={nodes.solar.y} r="17" fill={colors.surface2} stroke={solarColor} strokeWidth="2" />
          {/* Inverter (hub) */}
          <Circle cx={nodes.inverter.x} cy={nodes.inverter.y} r="21" fill={colors.surface2} stroke={withAlpha(colors.brand, 30)} strokeWidth="6" />
          <Circle cx={nodes.inverter.x} cy={nodes.inverter.y} r="21" fill={colors.surface2} stroke={colors.brand} strokeWidth="2.5" />
          {/* Battery */}
          <Circle cx={nodes.battery.x} cy={nodes.battery.y} r="17" fill={colors.surface2} stroke={withAlpha(batteryColor, 30)} strokeWidth="6" />
          <Circle cx={nodes.battery.x} cy={nodes.battery.y} r="17" fill={colors.surface2} stroke={batteryColor} strokeWidth="2" />
          {/* House */}
          <Circle cx={nodes.house.x} cy={nodes.house.y} r="19" fill={colors.surface2} stroke={withAlpha(loadColor, 30)} strokeWidth="6" />
          <Circle cx={nodes.house.x} cy={nodes.house.y} r="19" fill={colors.surface2} stroke={loadColor} strokeWidth="2" />
        </Svg>

        {/* Node icons — position in canvas units via percentage math */}
        {(
          [
            { node: 'grid', el: gridOn ? <PlugZap size={20} color={gridColor} strokeWidth={2} /> : <PowerOff size={20} color={gridColor} strokeWidth={2} /> },
            { node: 'inverter', el: <Cpu size={24} color={colors.brand} strokeWidth={2} /> },
            { node: 'battery', el: getBatteryIcon() },
            { node: 'house', el: <House size={20} color={loadColor} strokeWidth={2} /> },
          ] as const
        ).map(({ node, el }) => {
          const n = nodes[node];
          return (
            <View
              key={node}
              style={[
                styles.center,
                {
                  left: (n.x / CANVAS_W) * scaledW,
                  top: (n.y / CANVAS_H) * scaledH,
                  transform: [{ translateX: -12 }, { translateY: -12 }],
                },
              ]}
            >
              {el}
            </View>
          );
        })}

        {/* Solar icon (animated pulse) */}
        <Animated.View
          style={[
            styles.center,
            {
              left: (nodes.solar.x / CANVAS_W) * scaledW,
              top: (nodes.solar.y / CANVAS_H) * scaledH,
              opacity: solarPulse,
              transform: [{ translateX: -12 }, { translateY: -12 }],
            },
          ]}
        >
          <SunMedium size={20} color={solarColor} strokeWidth={2} />
        </Animated.View>

        {/* Node labels — percentages keep them glued to the SVG layout */}
        {(
          [
            { n: nodes.grid, label: 'Grid', value: gridOn ? (wirePower > 0 ? `+${formatPower(wirePower)}` : wirePower < 0 ? `−${formatPower(Math.abs(wirePower))}` : '0W') : 'OFFLINE', below: true, valueColor: gridColor },
            { n: nodes.solar, label: 'Solar', value: pvPower > 0 ? formatPower(pvPower) : null, below: false, valueColor: undefined },
            { n: nodes.inverter, label: 'Inverter', value: null, below: true, valueColor: undefined },
            { n: nodes.battery, label: 'Battery', value: `${Math.round(batterySoc)}%`, below: true, valueColor: batteryColor },
            { n: nodes.house, label: 'Load', value: usePower > 0 ? formatPower(usePower) : '0W', below: true, valueColor: undefined },
          ] as const
        ).map(({ n, label, value, below, valueColor }) => (
          <View
            key={label}
            style={[
              styles.nodeLabel,
              {
                left: (n.x / CANVAS_W) * scaledW,
                top: below
                  ? (n.y / CANVAS_H) * scaledH + 26
                  : (n.y / CANVAS_H) * scaledH - 44,
                transform: [{ translateX: -45 }],
              },
            ]}
          >
            <Text style={[styles.nodeLabelTitle, { color: colors.textPrimary }]}>{label}</Text>
            {value ? (
              <Text style={[styles.nodeLabelValue, { color: valueColor ?? colors.textSecondary }]}>
                {value}
              </Text>
            ) : null}
          </View>
        ))}

        {/* Flow dots (constant speed = real energy transfer) */}
        {gridOn && wirePower > 0 && (
          <FlowDot color={colors.charge} scale={scale}
            x1={(nodes.grid.x + 20) * scale} y1={nodes.grid.y * scale}
            x2={(nodes.inverter.x - 24) * scale} y2={nodes.inverter.y * scale}
            speed={motion.flowSpeed * scale} />
        )}
        {gridOn && wirePower < 0 && (
          <FlowDot color={colors.success} scale={scale}
            x1={(nodes.inverter.x - 24) * scale} y1={nodes.inverter.y * scale}
            x2={(nodes.grid.x + 20) * scale} y2={nodes.grid.y * scale}
            speed={motion.flowSpeed * scale} />
        )}
        {pvPower > 0 && (
          <FlowDot color={colors.brand} scale={scale} delay={100}
            x1={nodes.solar.x * scale} y1={(nodes.solar.y + 18) * scale}
            x2={nodes.inverter.x * scale} y2={(nodes.inverter.y - 24) * scale}
            speed={motion.flowSpeed * scale} />
        )}
        {usePower > 0 && (
          <FlowDot color={loadColor} scale={scale} delay={300}
            x1={(nodes.inverter.x + 24) * scale} y1={nodes.inverter.y * scale}
            x2={(nodes.house.x - 20) * scale} y2={nodes.house.y * scale}
            speed={motion.flowSpeed * scale} />
        )}
        {isDischarging && (
          <FlowDot color={colors.discharge} scale={scale} delay={150}
            x1={nodes.battery.x * scale} y1={(nodes.battery.y - 18) * scale}
            x2={nodes.inverter.x * scale} y2={(nodes.inverter.y + 24) * scale}
            speed={motion.flowSpeed * scale} />
        )}
        {isCharging && (
          <FlowDot color={colors.charge} scale={scale} delay={150}
            x1={nodes.inverter.x * scale} y1={(nodes.inverter.y + 24) * scale}
            x2={nodes.battery.x * scale} y2={(nodes.battery.y - 18) * scale}
            speed={motion.flowSpeed * scale} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    position: 'relative',
  },
  center: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeLabel: {
    position: 'absolute',
    width: 90,
    alignItems: 'center',
  },
  nodeLabelTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 11,
    textAlign: 'center',
  },
  nodeLabelValue: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
    textAlign: 'center',
  },
  flowDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    left: -3.5,
    top: -3.5,
  },
});
