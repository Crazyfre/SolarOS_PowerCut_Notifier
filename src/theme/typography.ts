// SolarGuard Design System — Typography
// Fonts are loaded at the App root via useFonts (see App.tsx).
// Space Grotesk: display/headlines/hero numerals (instrument identity)
// Inter: body, labels, controls (readability workhorse)
// IBM Plex Mono: telemetry values, timers, diagnostics (tabular data)

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from '@expo-google-fonts/ibm-plex-mono';

// Raw font modules to load with useFonts
export const FontResources = {
  'Inter-Regular': Inter_400Regular,
  'Inter-Medium': Inter_500Medium,
  'Inter-SemiBold': Inter_600SemiBold,
  'Inter-Bold': Inter_700Bold,
  'Grotesk-Medium': SpaceGrotesk_500Medium,
  'Grotesk-Bold': SpaceGrotesk_700Bold,
  'PlexMono-Regular': IBMPlexMono_400Regular,
  'PlexMono-Medium': IBMPlexMono_500Medium,
};

export const Typography = {
  fontFamily: {
    regular: 'Inter-Regular',
    medium: 'Inter-Medium',
    semiBold: 'Inter-SemiBold',
    bold: 'Inter-Bold',

    // Display face — wordmark, screen titles, hero numerals
    display: 'Grotesk-Medium',
    displayBold: 'Grotesk-Bold',

    // Data face — telemetry, timers, diagnostics
    mono: 'PlexMono-Regular',
    monoMedium: 'PlexMono-Medium',
  },

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

  // Multipliers — pair with fontSize: Math.round(size * x)
  lineHeight: {
    tight: 1.2,
    normal: 1.45,
    relaxed: 1.7,
  },

  // Letter tracking presets
  tracking: {
    tight: -0.5,
    normal: 0,
    label: 0.6, // for uppercase micro-labels
    wide: 1.2, // for badges / LIVE indicators
  },
};

// Shared text style presets — use these instead of hand-rolled styles.
export const TextStyles = {
  // Micro-label: section headers, card captions
  label: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    letterSpacing: Typography.tracking.label,
    textTransform: 'uppercase' as const,
  },
  // Live data numerals — keep tabular so values don't jitter
  numeric: {
    fontFamily: Typography.fontFamily.monoMedium,
    fontVariant: ['tabular-nums'] as const,
  },
};
