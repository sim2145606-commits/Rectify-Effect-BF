import { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@fastshot/auth';
import { Colors, STORAGE_KEYS } from '@/constants/theme';

export default function Index() {
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
      .then((value) => {
        setOnboardingComplete(value === 'true');
      })
      .catch(() => {
        setOnboardingComplete(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading || authLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.electricBlue} size="large" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
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
    backgroundColor: Colors.background,
  },
});
