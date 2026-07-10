// SolarGuard Design System
// Deep space dark theme with solar amber accents

export const Colors = {
  // Backgrounds
  background: '#0A0E1A',
  surface: '#111827',
  surfaceElevated: '#1C2333',
  surfaceBorder: '#1F2D3D',

  // Accents
  amber: '#F59E0B',
  amberLight: '#FCD34D',
  amberDark: '#D97706',
  amberGlow: 'rgba(245, 158, 11, 0.15)',

  // Status
  success: '#10B981',
  successLight: '#34D399',
  successGlow: 'rgba(16, 185, 129, 0.15)',

  danger: '#EF4444',
  dangerLight: '#F87171',
  dangerGlow: 'rgba(239, 68, 68, 0.15)',

  warning: '#F59E0B',
  warningGlow: 'rgba(245, 158, 11, 0.2)',

  blue: '#3B82F6',
  blueLight: '#60A5FA',
  blueGlow: 'rgba(59, 130, 246, 0.15)',

  purple: '#8B5CF6',
  purpleGlow: 'rgba(139, 92, 246, 0.15)',

  // Text
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#475569',
  textInverse: '#0A0E1A',

  // Grid lines / dividers
  divider: 'rgba(255, 255, 255, 0.06)',

  // Transparent
  overlay: 'rgba(10, 14, 26, 0.85)',
  glassLight: 'rgba(255, 255, 255, 0.04)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
};

export const Gradients = {
  background: ['#0A0E1A', '#0D1626'],
  amber: ['#F59E0B', '#D97706'],
  success: ['#10B981', '#059669'],
  danger: ['#EF4444', '#DC2626'],
  card: ['rgba(28, 35, 51, 0.9)', 'rgba(17, 24, 39, 0.9)'],
  solar: ['#0A0E1A', '#0F1D2E', '#162032'],
};

export const Typography = {
  // Font families — using system fonts as fallback; expo-font loads Inter at runtime
  fontFamily: {
    regular: 'Inter-Regular',
    medium: 'Inter-Medium',
    semiBold: 'Inter-SemiBold',
    bold: 'Inter-Bold',
    mono: 'Courier New',
  },

  // Font sizes
  fontSize: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 28,
  full: 9999,
};

export const Shadows = {
  amber: {
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  success: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  danger: {
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
};
