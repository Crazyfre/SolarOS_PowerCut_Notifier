// SolarGuard Design System — ThemeProvider
// Reads settings.amoledTheme from AppContext and exposes the resolved
// AppTheme through useTheme(). Screens never read `amoledTheme` directly
// or apply background overrides themselves.

import React, { createContext, useContext, useMemo } from 'react';
import { StatusBar } from 'react-native';
import { AppTheme } from './types';
import { darkTheme } from './dark';
import { amoledTheme } from './amoled';
import { useApp } from '../context/AppContext';

const ThemeContext = createContext<AppTheme>(darkTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useApp();
  const isAmoled = settings?.amoledTheme ?? false;

  const theme = useMemo(() => (isAmoled ? amoledTheme : darkTheme), [isAmoled]);

  return (
    <ThemeContext.Provider value={theme}>
      {/*
        One declarative StatusBar for the whole app — replaces the
        per-screen imperative ones (which only 2 of 6 screens set and none
        updated on AMOLED toggles).
      */}
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.background}
      />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}
