import { Stack } from 'expo-router';
import { AppState, NativeModules, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { StatusBar } from 'expo-status-bar';

const { VirtuCamSettings } = NativeModules;

function AppShell() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    const migrate = async () => {
      const migrated = await AsyncStorage.getItem('migration_v2_done');
      if (!migrated) {
        await AsyncStorage.multiRemove([
          STORAGE_KEYS.TARGET_APPS,
          STORAGE_KEYS.TARGET_MODE,
        ]);
        await AsyncStorage.setItem(STORAGE_KEYS.TARGET_MODE, 'all');
        await AsyncStorage.setItem(STORAGE_KEYS.TARGET_APPS, '[]');
        await AsyncStorage.setItem('migration_v2_done', 'true');
        return;
      }

      const [targetMode, targetApps] = await AsyncStorage.multiGet([
        STORAGE_KEYS.TARGET_MODE,
        STORAGE_KEYS.TARGET_APPS,
      ]);

      if (!targetMode[1]) {
        await AsyncStorage.setItem(STORAGE_KEYS.TARGET_MODE, 'all');
      }
      if (!targetApps[1]) {
        await AsyncStorage.setItem(STORAGE_KEYS.TARGET_APPS, '[]');
      }
    };
    void migrate();
  }, []);

  useEffect(() => {
    const syncOverlayWithAppState = async (nextState: AppStateStatus) => {
      if (!VirtuCamSettings) return;

      try {
        const hasPermission = await VirtuCamSettings.checkOverlayPermission();
        if (!hasPermission) {
          await VirtuCamSettings.stopFloatingOverlay();
          return;
        }

        const overlayEnabled = await VirtuCamSettings.isOverlayEnabled();
        const alreadyRunning = await VirtuCamSettings.isOverlayRunning();

        if (nextState === 'active') {
          if (alreadyRunning) {
            await VirtuCamSettings.stopFloatingOverlay();
          }
          return;
        }

        if (!overlayEnabled) {
          if (alreadyRunning) {
            await VirtuCamSettings.stopFloatingOverlay();
          }
          return;
        }

        if (!alreadyRunning) {
          await VirtuCamSettings.startFloatingOverlay();
        }
      } catch (e) {
        console.error('Overlay lifecycle sync failed:', e);
      }
    };

    void syncOverlayWithAppState(AppState.currentState);

    const sub = AppState.addEventListener('change', state => {
      void syncOverlayWithAppState(state);
    });

    return () => sub.remove();
  }, []);

  const screenOptions = {
    headerShown: false,
    contentStyle: { backgroundColor: colors.background },
    animation: 'fade' as const,
  };

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="logs" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
