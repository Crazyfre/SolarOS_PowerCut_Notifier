// SolarGuard Design System — Dark palette ("The Monitoring Instrument")
//
// Color roles (strict):
//   brand/amber — interactive identity + solar production. Never a status.
//   success     — grid connected, export, healthy, confirmations
//   warning     — degraded states (running on battery, low sun)
//   danger      — alarm-grade only: power cut, battery critical, auth required
//   info/blue   — charging/data/informational
//   discharge/rose — battery discharging
//
// Status hues come in four variants: base (fills/icons), Text (small text on
// dark — one step lighter), Fill (12% tinted surface), Border (tinted hairline).
// This replaces the old `color + '44'` string-concat pattern.

import type { ThemeColors, ThemeMotion, ThemeShadows } from './types';

const colors: ThemeColors = {
  // Elevation ramp — deep desaturated navy, cool and low-glare
  background: '#0B0F1A',
  surface1: '#121829',
  surface2: '#1A2337',
  surface3: '#232E48',

  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  divider: 'rgba(255, 255, 255, 0.06)',

  textPrimary: '#F2F5FA',
  textSecondary: '#9AA7BD',
  textDisabled: '#5D6B84',
  textInverse: '#10141F',

  // Brand / solar
  brand: '#F5A623',
  brandBright: '#FCC24D',
  brandDim: '#B27A1D',

  // Success — grid OK
  success: '#22C07E',
  successText: '#4AD79B',
  successFill: 'rgba(34, 192, 126, 0.12)',
  successBorder: 'rgba(34, 192, 126, 0.35)',

  // Warning — degraded, not alarming (deliberately split from brand amber)
  warning: '#F08A3C',
  warningText: '#F5A564',
  warningFill: 'rgba(240, 138, 60, 0.12)',
  warningBorder: 'rgba(240, 138, 60, 0.35)',

  // Danger — alarm grade
  danger: '#E5484D',
  dangerText: '#F26D70',
  dangerFill: 'rgba(229, 72, 77, 0.13)',
  dangerBorder: 'rgba(229, 72, 77, 0.40)',

  // Info — charging / data
  info: '#4C8DFF',
  infoText: '#77A9FF',
  infoFill: 'rgba(76, 141, 255, 0.12)',
  infoBorder: 'rgba(76, 141, 255, 0.35)',

  // Energy flow
  charge: '#4C8DFF',
  chargeText: '#77A9FF',
  discharge: '#E5588D',
  dischargeText: '#EF7CA5',

  glassFill: 'rgba(255, 255, 255, 0.05)',
  overlay: 'rgba(5, 8, 15, 0.72)',
};

export const motion: ThemeMotion = {
  durationFast: 150,
  durationBase: 250,
  durationSlow: 400,
  breatheDuration: 2000,
  breatheScale: 1.06,
  flowSpeed: 45,
};

export const shadows: ThemeShadows = {
  // Barely-there resting elevation for surface1 cards
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  raised: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  sheet: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 16,
  },
  // Glow is reserved for energized states only: active flow wires,
  // LIVE indicators, alarm banners. Never static decoration.
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  }),
};

export const darkTheme = {
  name: 'dark' as const,
  dark: true,
  colors,
  motion,
  shadows,
};
