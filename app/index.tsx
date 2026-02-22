import { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, NativeModules } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { diagnoseNativeModule } from '@/services/NativeModuleDiagnostics';

export default function Index() {
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    if (__DEV__) {
      const diag = diagnoseNativeModule();
      console.log('🔍 Native Module Diagnostic:', diag);
      console.log('🔍 Available Modules:', Object.keys(NativeModules));
      console.log('🔍 Total Modules:', Object.keys(NativeModules).length);
      if (!diag.nativeModuleExists) {
        console.error('⚠️ CRITICAL: Native module not loaded! App will not function correctly.');
      }
    }

    AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
      .then(value => {
        setOnboardingComplete(value === 'true');
      })
      .catch(() => {
        setOnboardingComplete(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.electricBlue} size="large" />
      </View>
    );
  }

  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
