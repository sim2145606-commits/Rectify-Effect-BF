import { Stack } from 'expo-router';
import { StatusBar, AppState, NativeModules } from 'react-native';
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
    const startOverlay = async () => {
      try {
        const hasPermission = await VirtuCamSettings.checkOverlayPermission();
        if (!hasPermission) return;
        const alreadyRunning = await VirtuCamSettings.isOverlayRunning();
        if (!alreadyRunning) await VirtuCamSettings.startFloatingOverlay();
      } catch (e) {}
    };
    void startOverlay();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void startOverlay();
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
