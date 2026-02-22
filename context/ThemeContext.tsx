import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors, type AppColors, STORAGE_KEYS } from '@/constants/theme';

export type ColorMode = 'dark' | 'system' | 'day';

type ThemeContextValue = {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  performanceMode: boolean;
  setPerformanceMode: (val: boolean) => void;
  colors: AppColors;
  isDark: boolean;
  isPerformance: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [colorMode, setColorModeState] = useState<ColorMode>('system');
  const [performanceMode, setPerformanceModeState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [storedMode, storedPerf] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.COLOR_MODE),
          AsyncStorage.getItem(STORAGE_KEYS.PERFORMANCE_MODE),
        ]);
        if (storedMode === 'dark' || storedMode === 'system' || storedMode === 'day') {
          setColorModeState(storedMode);
        }
        if (storedPerf !== null) {
          setPerformanceModeState(JSON.parse(storedPerf) as boolean);
        }
      } catch {
        // Use defaults
      } finally {
        setReady(true);
      }
    };
    void load();
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    AsyncStorage.setItem(STORAGE_KEYS.COLOR_MODE, mode).catch(() => {});
  }, []);

  const setPerformanceMode = useCallback((val: boolean) => {
    setPerformanceModeState(val);
    AsyncStorage.setItem(STORAGE_KEYS.PERFORMANCE_MODE, JSON.stringify(val)).catch(() => {});
  }, []);

  const isDark =
    colorMode === 'dark'
      ? true
      : colorMode === 'day'
        ? false
        : systemScheme === 'dark';

  const colors = getColors(isDark, performanceMode);

  if (!ready) {
    const defaultColors = getColors(systemScheme === 'dark', false);
    return (
      <ThemeContext.Provider
        value={{
          colorMode: 'system',
          setColorMode,
          performanceMode: false,
          setPerformanceMode,
          colors: defaultColors,
          isDark: systemScheme === 'dark',
          isPerformance: false,
        }}
      >
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider
      value={{
        colorMode,
        setColorMode,
        performanceMode,
        setPerformanceMode,
        colors,
        isDark,
        isPerformance: performanceMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
