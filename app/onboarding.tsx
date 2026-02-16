import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, BorderRadius, FontSize, STORAGE_KEYS } from '@/constants/theme';

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to VirtuCam',
      description: 'Transform your camera experience with virtual camera feeds for any app.',
    },
    {
      title: 'Xposed Framework Required',
      description: 'VirtuCam requires Xposed Framework (LSPosed recommended) to hook into camera APIs.',
    },
    {
      title: 'Grant Permissions',
      description: 'Allow camera, storage, and overlay permissions for full functionality.',
    },
  ];

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
      router.replace('/(tabs)');
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.stepContainer}>
          <Text style={styles.stepIndicator}>
            {currentStep + 1} / {steps.length}
          </Text>
          <Text style={styles.title}>{steps[currentStep].title}</Text>
          <Text style={styles.description}>{steps[currentStep].description}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
          <Text style={styles.nextText}>
            {currentStep < steps.length - 1 ? 'Next' : 'Get Started'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
  },
  stepContainer: {
    alignItems: 'center',
  },
  stepIndicator: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: FontSize.display,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  description: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxxl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  skipButton: {
    flex: 1,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  skipText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  nextText: {
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
});
