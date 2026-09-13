// SolarGuard Design System — AMOLED palette
// Pure black base for OLED panels. Shadows die on pure black, so elevation
// is carried by border strength and slightly-tinted near-black surfaces.

import type { ThemeColors, ThemeMotion, ThemeShadows } from './types';
import { motion } from './dark';

const colors: ThemeColors = {
  background: '#000000',
  surface1: '#0C1017', // barely-tinted, never pure white lift
  surface2: '#131926',
  surface3: '#1B2334',

  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  divider: 'rgba(255, 255, 255, 0.07)',

  textPrimary: '#F2F5FA',
  textSecondary: '#98A4BA',
  textDisabled: '#59657E',
  textInverse: '#0A0A0A',

  brand: '#F5A623',
  brandBright: '#FCC24D',
  brandDim: '#B27A1D',

  success: '#24C77F',
  successText: '#4AD79B',
  successFill: 'rgba(36, 199, 127, 0.10)',
  successBorder: 'rgba(36, 199, 127, 0.35)',

  warning: '#F08A3C',
  warningText: '#F5A564',
  warningFill: 'rgba(240, 138, 60, 0.10)',
  warningBorder: 'rgba(240, 138, 60, 0.38)',

  danger: '#E5484D',
  dangerText: '#F26D70',
  dangerFill: 'rgba(229, 72, 77, 0.11)',
  dangerBorder: 'rgba(229, 72, 77, 0.42)',

  info: '#4C8DFF',
  infoText: '#77A9FF',
  infoFill: 'rgba(76, 141, 255, 0.10)',
  infoBorder: 'rgba(76, 141, 255, 0.35)',

  charge: '#4C8DFF',
  chargeText: '#77A9FF',
  discharge: '#E5588D',
  dischargeText: '#EF7CA5',

  glassFill: 'rgba(255, 255, 255, 0.06)',
  overlay: 'rgba(0, 0, 0, 0.78)',
};

const shadows: ThemeShadows = {
  card: { elevation: 0 }, // borders carry elevation on true black
  raised: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  sheet: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  }),
};

export const amoledTheme = {
  name: 'amoled' as const,
  dark: true,
  colors,
  motion,
  shadows,
};
