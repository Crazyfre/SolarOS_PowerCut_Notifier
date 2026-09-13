// SolarGuard Design System — semantic token contract.
// Every palette (dark, amoled, and any future light mode) implements this
// interface, so components never reference a palette directly.

export interface ThemeColors {
  // Base surfaces (elevation ramp: background < surface1 < surface2 < surface3)
  background: string;
  surface1: string;
  surface2: string;
  surface3: string;

  // Hairlines & separators
  border: string;
  borderStrong: string;
  divider: string;

  // Content
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  textInverse: string; // text on solid brand/status fills

  // Brand / solar — interactive identity. Never a status color.
  brand: string;
  brandBright: string;
  brandDim: string;

  // Status — one job each
  success: string; // fill/icon
  successText: string; // small text on dark
  successFill: string; // tinted surface fill
  successBorder: string; // tinted border

  warning: string;
  warningText: string;
  warningFill: string;
  warningBorder: string;

  danger: string;
  dangerText: string;
  dangerFill: string;
  dangerBorder: string;

  info: string;
  infoText: string;
  infoFill: string;
  infoBorder: string;

  // Energy flow semantics
  charge: string; // battery charging / import (blue family)
  chargeText: string;
  discharge: string; // battery discharging (rose family)
  dischargeText: string;

  // Glass & overlays
  glassFill: string;
  overlay: string;
}

export interface ThemeMotion {
  // Durations (ms)
  durationFast: number; // taps, small feedback
  durationBase: number; // content transitions
  durationSlow: number; // banner emphasis
  // Breathing/alive cadence
  breatheDuration: number; // live indicators
  breatheScale: number;
  // Flow dot speed (px/s) — constant, represents real energy transfer
  flowSpeed: number;
}

export interface ThemeShadows {
  card: object; // surface1 resting elevation
  raised: object; // surface2/3 elevation
  sheet: object; // modal elevation
  glow: (color: string) => object; // reserved: energized states only
}

export interface AppTheme {
  name: 'dark' | 'amoled' | 'light';
  dark: boolean;
  colors: ThemeColors;
  motion: ThemeMotion;
  shadows: ThemeShadows;
}
