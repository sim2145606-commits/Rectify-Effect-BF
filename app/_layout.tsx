import { Stack } from 'expo-router';
import { StatusBar, AppState, NativeModules, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, STORAGE_KEYS } from '@/constants/theme';

const { VirtuCamSettings } = NativeModules;

export default function RootLayout() {
  useEffect(() => {
    const migrate = async () => {
      const migrated = await AsyncStorage.getItem('migration_v2_done');
      if (!migrated) {
        await AsyncStorage.multiRemove([
          STORAGE_KEYS.TARGET_APPS,
          STORAGE_KEYS.TARGET_MODE,
        ]);
        await AsyncStorage.setItem('migration_v2_done', 'true');
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
    contentStyle: { backgroundColor: Colors.background },
    animation: 'fade' as const,
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <Stack screenOptions={screenOptions}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="logs" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
