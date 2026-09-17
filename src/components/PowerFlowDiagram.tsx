// PowerFlowDiagram — SolarGuard's signature instrument.
// Symmetric cross layout: Grid ↔ Inverter (center) ↔ House, with Solar above
// and Battery below. Node chips are surface2 with hairline borders; status
// rings carry the state colors (grid green/red, battery blue/rose, solar
// amber). Flow dots run at constant speed — they represent real energy
// transfer.
//
// Geometry note: the canvas (320×300) reserves label margins INSIDE the
// viewBox — every node has ≥26 units of clearance for its label, so nothing
// can clip at the card boundary. All overlays (icons, labels, dots) are
// positioned in scaled canvas space; label offsets scale with the canvas so
// the layout stays proportional on any screen width.

import React, { useEffect, useRef, useState, memo } from 'react';
import { View, Text, StyleSheet, Animated, Easing, useWindowDimensions, AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
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

// Canonical canvas — everything scales from this viewBox.
// Vertical budget: solar label zone (0–62) · nodes (49–255) · battery label
// zone (255–310). Horizontal: labels span 13–307, inside 0–320.
const CANVAS_W = 320;
const CANVAS_H = 310;

const nodes = {
  grid: { x: 58, y: 150 },
  solar: { x: 160, y: 66 },
  inverter: { x: 160, y: 150 },
  battery: { x: 160, y: 236 },
  house: { x: 262, y: 150 },
};

// Wire endpoints (canvas units) — shared by SVG lines and flow dots
const WIRE = {
  gridX1: nodes.grid.x + 20,       // 78
  gridX2: nodes.inverter.x - 25,    // 135
  solarY1: nodes.solar.y + 18,      // 84
  solarY2: nodes.inverter.y - 25,   // 125
  houseX1: nodes.inverter.x + 25,   // 185
  houseX2: nodes.house.x - 20,      // 242
  battY1: nodes.inverter.y + 25,    // 175
  battY2: nodes.battery.y - 18,     // 218
};

// Label placement (canvas units, relative to node center)
const LABEL_BELOW = 27;  // below node center — clears the r≤21 circle + ring
const LABEL_ABOVE = 54;  // above node center — clears the r=17 circle + ring
                          // even with both label lines rendered at min scale
const LABEL_WIDTH = 90;  // fixed overlay box width (px, centered)

function FlowDot({
  color,
  x1, y1, x2, y2,
  delay = 0,
  speed = 45,
  scale = 1,
  active = true,
}: {
  color: string;
  x1: number; y1: number;
  x2: number; y2: number;
  delay?: number;
  speed?: number;
  scale?: number;
  active?: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const duration = (Math.hypot(x2 - x1, y2 - y1) / speed) * 1000;
  const cycleDuration = duration + delay;
  const inputRange = delay > 0 ? [0, delay / cycleDuration, 1] : [0, 1];

  useEffect(() => {
    if (!active) {
      anim.stopAnimation();
      anim.setValue(0);
      return;
    }
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: cycleDuration,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [cycleDuration, anim, active, x1, y1, x2, y2]);

  const cx = anim.interpolate({ inputRange, outputRange: delay > 0 ? [x1, x1, x2] : [x1, x2] });
  const cy = anim.interpolate({ inputRange, outputRange: delay > 0 ? [y1, y1, y2] : [y1, y2] });

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

export const PowerFlowDiagram = memo(function PowerFlowDiagram({
  gridOn,
  pvPower = 0,
  batteryStatus,
  usePower = 0,
  wirePower = 0,
  batterySoc = 0,
}: PowerFlowProps) {
  const { colors, motion } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const isFocused = useIsFocused();
  const appState = useRef(AppState.currentState);
  const [appActive, setAppActive] = useState(appState.current === 'active');
  const animated = isFocused && appActive;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      appState.current = state;
      setAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

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

  // Responsive sizing: use the full card width (screen − scroll gutter −
  // card padding). Allow a slight upscale on wide screens, floor for narrow
  // ones so labels always keep their reserved canvas margins.
  const availWidth = Math.max(screenWidth - 80, 240);
  const scale = Math.max(Math.min(availWidth / CANVAS_W, 1.1), 0.8);
  const scaledW = CANVAS_W * scale;
  const scaledH = CANVAS_H * scale;

  // Solar pulse (production is live)
  const solarPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (pvPower > 0 && animated) {
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
  }, [pvPower, solarPulse, animated]);

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

  // Overlay position helpers — canvas units → scaled px
  const px = (x: number) => x * scale;
  const labelTop = (n: { y: number }, below: boolean) =>
    (below ? n.y + LABEL_BELOW : n.y - LABEL_ABOVE) * scale;

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
            x1={WIRE.gridX1} y1={nodes.grid.y}
            x2={WIRE.gridX2} y2={nodes.inverter.y}
            stroke={wireStroke(gridOn, gridColor)}
            strokeWidth={gridOn ? 2.5 : 2}
            strokeDasharray={gridOn ? undefined : '5,4'}
          />
          <Line
            x1={nodes.solar.x} y1={WIRE.solarY1}
            x2={nodes.inverter.x} y2={WIRE.solarY2}
            stroke={wireStroke(pvPower > 0, solarColor)}
            strokeWidth={pvPower > 0 ? 2.5 : 2}
            strokeDasharray={pvPower > 0 ? undefined : '5,4'}
          />
          <Line
            x1={WIRE.houseX1} y1={nodes.inverter.y}
            x2={WIRE.houseX2} y2={nodes.house.y}
            stroke={wireStroke(usePower > 0, loadColor)}
            strokeWidth={usePower > 0 ? 2.5 : 2}
            strokeDasharray={usePower > 0 ? undefined : '5,4'}
          />
          <Line
            x1={nodes.inverter.x} y1={WIRE.battY1}
            x2={nodes.battery.x} y2={WIRE.battY2}
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

        {/* Node icons — centered on the scaled node position */}
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
                  left: px(n.x),
                  top: px(n.y),
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
              left: px(nodes.solar.x),
              top: px(nodes.solar.y),
              opacity: solarPulse,
              transform: [{ translateX: -12 }, { translateY: -12 }],
            },
          ]}
        >
          <SunMedium size={20} color={solarColor} strokeWidth={2} />
        </Animated.View>

        {/* Node labels — offset in scaled canvas space so they track nodes */}
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
                left: px(n.x),
                top: labelTop(n, below),
                width: LABEL_WIDTH,
                transform: [{ translateX: -LABEL_WIDTH / 2 }],
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
          <FlowDot color={colors.charge} scale={scale} active={animated}
            x1={px(WIRE.gridX1)} y1={px(nodes.grid.y)}
            x2={px(WIRE.gridX2)} y2={px(nodes.inverter.y)}
            speed={motion.flowSpeed * scale} />
        )}
        {gridOn && wirePower < 0 && (
          <FlowDot color={colors.success} scale={scale} active={animated}
            x1={px(WIRE.gridX2)} y1={px(nodes.inverter.y)}
            x2={px(WIRE.gridX1)} y2={px(nodes.grid.y)}
            speed={motion.flowSpeed * scale} />
        )}
        {pvPower > 0 && (
          <FlowDot color={colors.brand} scale={scale} delay={100} active={animated}
            x1={px(nodes.solar.x)} y1={px(WIRE.solarY1)}
            x2={px(nodes.inverter.x)} y2={px(WIRE.solarY2)}
            speed={motion.flowSpeed * scale} />
        )}
        {usePower > 0 && (
          <FlowDot color={loadColor} scale={scale} delay={300} active={animated}
            x1={px(WIRE.houseX1)} y1={px(nodes.inverter.y)}
            x2={px(WIRE.houseX2)} y2={px(nodes.house.y)}
            speed={motion.flowSpeed * scale} />
        )}
        {isDischarging && (
          <FlowDot color={colors.discharge} scale={scale} delay={150} active={animated}
            x1={px(nodes.battery.x)} y1={px(WIRE.battY2)}
            x2={px(nodes.inverter.x)} y2={px(WIRE.battY1)}
            speed={motion.flowSpeed * scale} />
        )}
        {isCharging && (
          <FlowDot color={colors.charge} scale={scale} delay={150} active={animated}
            x1={px(nodes.inverter.x)} y1={px(WIRE.battY1)}
            x2={px(nodes.battery.x)} y2={px(WIRE.battY2)}
            speed={motion.flowSpeed * scale} />
        )}
      </View>
    </View>
  );
});

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
