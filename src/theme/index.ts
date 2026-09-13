// SolarGuard Design System — public entry
//
// Import surface for the rest of the app:
//   import { useTheme, AppTheme, Typography, Spacing, BorderRadius, PAGE_GUTTER } from '../theme';
//
// Components must resolve colors via useTheme() — never import a palette
// module directly. Only service layers that run outside React (e.g.
// notifications) may import `serviceColors` from here.

export { ThemeProvider, useTheme } from './ThemeProvider';
export type { AppTheme, ThemeColors, ThemeMotion, ThemeShadows } from './types';
export { darkTheme } from './dark';
export { amoledTheme } from './amoled';

export { Typography, TextStyles, FontResources } from './typography';
export { Spacing, BorderRadius, PAGE_GUTTER } from './scales';

// withAlpha — converts a #RRGGBB hex + 0–100 opacity into an rgba string.
// Replaces the old `color + '44'` string-concat pattern (which silently
// breaks if a token ever becomes an rgba()).
export function withAlpha(hex: string, opacityPercent: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex; // pass through non-hex tokens
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, opacityPercent / 100));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Static palette for non-React services (notification colors must match
// the app's status hues; single source of truth).
import { darkTheme } from './dark';
export const serviceColors = {
  brand: darkTheme.colors.brand,
  success: darkTheme.colors.success,
  danger: darkTheme.colors.danger,
};
