import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  FadeInDown,
  FadeInUp,
  Easing,
  SlideInRight,
  SlideOutLeft,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';
import {
  type SystemCheckStatus,
  getStatusColor,
  runFullSystemCheck,
  type SystemVerificationState,
  INITIAL_SYSTEM_STATE,
} from '@/services/SystemVerification';
import {
  requestCameraPermission,
  requestMediaLibraryPermission,
  requestAllFilesAccess,
  requestOverlayPermission,
} from '@/services/PermissionManager';
import { syncAllSettings } from '@/services/ConfigBridge';

// Screen dimensions available if needed for responsive layout

type StepKey = 'root' | 'xposed' | 'module' | 'permissions';

type Step = {
  key: StepKey;
  title: string;
  subtitle: string;
  icon: string;
  iconLib: 'ionicons' | 'material';
  description: string;
  actionLabel: string;
  tipTitle: string;
  tipBody: string;
};

const STEPS: Step[] = [
  {
    key: 'root',
    title: 'Root Access',
    subtitle: 'Superuser Verification',
    icon: 'shield-checkmark',
    iconLib: 'ionicons',
    description:
      'VirtuCam requires root access to intercept camera frames at the system level. Grant Superuser (SU) permissions to proceed.',
    actionLabel: 'Verify Root Access',
    tipTitle: 'Need Root?',
    tipBody:
      'Use Magisk or KernelSU to root your device. VirtuCam works best with Magisk v26+ or KernelSU on Android 10-16.',
  },
  {
    key: 'xposed',
    title: 'Xposed Framework',
    subtitle: 'Hook Engine Detection',
    icon: 'code-slash',
    iconLib: 'ionicons',
    description:
      'An Xposed-compatible framework (LSPosed recommended) is required to hook into camera APIs. The framework enables VirtuCam to intercept Camera2 API calls.',
    actionLabel: 'Detect Framework',
    tipTitle: 'Recommended Setup',
    tipBody:
      'Install LSPosed via Magisk Module → Reboot → Open LSPosed Manager to verify activation. Zygisk mode is preferred for stability.',
  },
  {
    key: 'module',
    title: 'Module Activation',
    subtitle: 'VirtuCam Hook Module',
    icon: 'extension-puzzle',
    iconLib: 'ionicons',
    description:
      'The VirtuCam Xposed module must be enabled in your framework manager. Enable it for all target applications in the module scope.',
    actionLabel: 'Check Module Status',
    tipTitle: 'Activation Steps',
    tipBody:
      'Open LSPosed Manager → Modules → Enable VirtuCam → Select target apps in module scope → Force stop target apps to activate hooks.',
  },
  {
    key: 'permissions',
    title: 'System Permissions',
    subtitle: 'Required Access Rights',
    icon: 'key',
    iconLib: 'ionicons',
    description:
      'Grant camera, storage, file access, and overlay permissions. These are essential for media injection and live status overlays.',
    actionLabel: 'Grant All Permissions',
    tipTitle: 'Permission Details',
    tipBody:
      'Camera: For camera feed interception. All Files: For reading media at system level. Overlay: For showing injection status in target apps.',
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { heavyImpact, success, warning, mediumImpact, lightImpact } = useHaptics();

  const [currentStep, setCurrentStep] = useState(0);
  const [, setSystemState] = useState<SystemVerificationState>(INITIAL_SYSTEM_STATE);
  const [isVerifying, setIsVerifying] = useState(false);
  const [stepStatuses, setStepStatuses] = useState<Record<StepKey, SystemCheckStatus>>({
    root: 'checking',
    xposed: 'checking',
    module: 'checking',
    permissions: 'checking',
  });

  const progressWidth = useSharedValue(0);
  const cardScale = useSharedValue(1);

  useEffect(() => {
    progressWidth.value = withTiming(((currentStep + 1) / STEPS.length) * 100, {
      duration: 500,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [currentStep, progressWidth]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const handleVerify = useCallback(async () => {
    const step = STEPS[currentStep];
    setIsVerifying(true);
    mediumImpact();

    try {
      const result = await runFullSystemCheck();
      setSystemState(result);

      let status: SystemCheckStatus;
      switch (step.key) {
        case 'root':
          status = result.rootAccess.status;
          break;
        case 'xposed':
          status = result.xposedFramework.status;
          break;
        case 'module':
          status = result.moduleActive.status;
          break;
        case 'permissions':
          // Request permissions during this step
          await requestCameraPermission();
          await requestMediaLibraryPermission();
          status = result.storagePermission.status;
          break;
        default:
          status = 'warning';
      }

      setStepStatuses((prev) => ({ ...prev, [step.key]: status }));

      if (status === 'passed') {
        success();
      } else {
        warning();
      }
    } catch {
      setStepStatuses((prev) => ({ ...prev, [step.key]: 'warning' }));
      warning();
    } finally {
      setIsVerifying(false);
    }
  }, [currentStep, mediumImpact, success, warning]);

  const handleAdvancedAction = useCallback(async () => {
    const step = STEPS[currentStep];
    lightImpact();

    if (step.key === 'permissions') {
      if (Platform.OS === 'android') {
        try {
          await requestAllFilesAccess();
        } catch {
          // Handled
        }
        try {
          await requestOverlayPermission();
        } catch {
          // Handled
        }
      }
    }
  }, [currentStep, lightImpact]);

  const handleNext = useCallback(async () => {
    heavyImpact();
    if (currentStep < STEPS.length - 1) {
      cardScale.value = withSequence(
        withTiming(0.95, { duration: 100 }),
        withSpring(1, { damping: 15 })
      );
      setCurrentStep((prev) => prev + 1);
    } else {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
        await syncAllSettings();
        success();
        router.replace('/(tabs)');
      } catch {
        router.replace('/(tabs)');
      }
    }
  }, [currentStep, cardScale, heavyImpact, success]);

  const handleBack = useCallback(() => {
    lightImpact();
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep, lightImpact]);

  const handleSkip = useCallback(async () => {
    warning();
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
      await syncAllSettings();
      router.replace('/(tabs)');
    } catch {
      router.replace('/(tabs)');
    }
  }, [warning]);

  const step = STEPS[currentStep];
  const stepStatus = stepStatuses[step.key];

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.logoText}>VIRTUCAM</Text>
            <Text style={styles.logoSubtext}>System Setup Wizard</Text>
          </View>
          <Pressable onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.textTertiary} />
          </Pressable>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, progressStyle]} />
          </View>
          <Text style={styles.progressText}>
            Step {currentStep + 1} of {STEPS.length}
          </Text>
        </View>

        {/* Step Indicators */}
        <View style={styles.stepIndicators}>
          {STEPS.map((s, index) => {
            const sStatus = stepStatuses[s.key];
            const isActive = index === currentStep;
            const isComplete = sStatus === 'passed';
            const isPast = index < currentStep;

            return (
              <Pressable
                key={s.key}
                onPress={() => {
                  lightImpact();
                  setCurrentStep(index);
                }}
                style={[
                  styles.stepDot,
                  isActive && styles.stepDotActive,
                  isComplete && styles.stepDotComplete,
                  isPast && !isComplete && styles.stepDotPast,
                ]}
              >
                {isComplete ? (
                  <Ionicons name="checkmark" size={10} color={Colors.background} />
                ) : (
                  <Text
                    style={[
                      styles.stepDotText,
                      isActive && styles.stepDotTextActive,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* Main Card */}
      <Animated.View style={[styles.mainCardContainer, cardAnimStyle]}>
        <Animated.View
          key={step.key}
          entering={SlideInRight.duration(300).springify()}
          exiting={SlideOutLeft.duration(200)}
          style={styles.mainCard}
        >
          {/* Step Icon */}
          <View style={[styles.iconContainer, { borderColor: getStatusColor(stepStatus) + '40' }]}>
            <View
              style={[styles.iconInner, { backgroundColor: getStatusColor(stepStatus) + '15' }]}
            >
              {step.iconLib === 'ionicons' ? (
                <Ionicons
                  name={step.icon as keyof typeof Ionicons.glyphMap}
                  size={36}
                  color={getStatusColor(stepStatus)}
                />
              ) : (
                <MaterialCommunityIcons
                  name={step.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={36}
                  color={getStatusColor(stepStatus)}
                />
              )}
            </View>

            {/* Status Indicator */}
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(stepStatus) + '20' },
              ]}
            >
              <View
                style={[
                  styles.statusDotSmall,
                  { backgroundColor: getStatusColor(stepStatus) },
                ]}
              />
              <Text style={[styles.statusBadgeText, { color: getStatusColor(stepStatus) }]}>
                {stepStatus === 'passed'
                  ? 'VERIFIED'
                  : stepStatus === 'warning'
                  ? 'ACTION NEEDED'
                  : stepStatus === 'failed'
                  ? 'FAILED'
                  : 'PENDING'}
              </Text>
            </View>
          </View>

          {/* Step Content */}
          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.stepSubtitle}>{step.subtitle}</Text>
          <Text style={styles.stepDescription}>{step.description}</Text>

          {/* Action Button */}
          <Pressable
            onPress={handleVerify}
            disabled={isVerifying}
            style={[
              styles.actionButton,
              stepStatus === 'passed' && styles.actionButtonSuccess,
              isVerifying && styles.actionButtonLoading,
            ]}
          >
            {isVerifying ? (
              <>
                <ActivityIndicator
                  color={Colors.textPrimary}
                  size="small"
                />
                <Text style={styles.actionButtonText}>Verifying...</Text>
              </>
            ) : stepStatus === 'passed' ? (
              <>
                <Ionicons name="checkmark-circle" size={20} color={Colors.textPrimary} />
                <Text style={styles.actionButtonText}>Verified ✓</Text>
              </>
            ) : (
              <>
                <Ionicons name="scan" size={20} color={Colors.textPrimary} />
                <Text style={styles.actionButtonText}>{step.actionLabel}</Text>
              </>
            )}
          </Pressable>

          {/* Advanced Action for permissions step */}
          {step.key === 'permissions' && (
            <Pressable onPress={handleAdvancedAction} style={styles.advancedButton}>
              <MaterialCommunityIcons name="shield-lock-outline" size={16} color={Colors.accent} />
              <Text style={styles.advancedButtonText}>Open System Permission Settings</Text>
            </Pressable>
          )}

          {/* Tip Card */}
          <View style={styles.tipCard}>
            <View style={styles.tipHeader}>
              <Ionicons name="bulb-outline" size={14} color={Colors.warningAmber} />
              <Text style={styles.tipTitle}>{step.tipTitle}</Text>
            </View>
            <Text style={styles.tipBody}>{step.tipBody}</Text>
          </View>
        </Animated.View>
      </Animated.View>

      {/* Navigation */}
      <Animated.View
        entering={FadeInUp.delay(400).duration(500)}
        style={[styles.navigation, { paddingBottom: insets.bottom + Spacing.lg }]}
      >
        <Pressable
          onPress={handleBack}
          disabled={currentStep === 0}
          style={[styles.navButton, currentStep === 0 && styles.navButtonDisabled]}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={currentStep === 0 ? Colors.textTertiary : Colors.textPrimary}
          />
          <Text
            style={[
              styles.navButtonText,
              currentStep === 0 && styles.navButtonTextDisabled,
            ]}
          >
            Back
          </Text>
        </Pressable>

        <View style={styles.navCenter}>
          <Text style={styles.navStepLabel}>{step.title}</Text>
        </View>

        <Pressable onPress={handleNext} style={styles.navButtonPrimary}>
          <Text style={styles.navButtonPrimaryText}>
            {currentStep === STEPS.length - 1 ? 'Finish' : 'Next'}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xl,
  },
  logoText: {
    color: Colors.electricBlue,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: 3,
  },
  logoSubtext: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    letterSpacing: 1,
    marginTop: 2,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
  },
  skipText: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  progressContainer: {
    marginBottom: Spacing.lg,
  },
  progressTrack: {
    height: 3,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.electricBlue,
    borderRadius: 2,
  },
  progressText: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  stepIndicators: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  stepDotActive: {
    borderColor: Colors.electricBlue,
    backgroundColor: Colors.electricBlue + '20',
  },
  stepDotComplete: {
    backgroundColor: Colors.electricBlue,
    borderColor: Colors.electricBlue,
  },
  stepDotPast: {
    borderColor: Colors.textTertiary,
  },
  stepDotText: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  stepDotTextActive: {
    color: Colors.electricBlue,
  },
  mainCardContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  mainCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignSelf: 'center',
  },
  iconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stepTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  stepSubtitle: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: Spacing.lg,
  },
  stepDescription: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  actionButtonSuccess: {
    backgroundColor: Colors.electricBlue,
    shadowColor: Colors.electricBlue,
  },
  actionButtonLoading: {
    opacity: 0.8,
  },
  actionButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  advancedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.accent + '40',
    backgroundColor: Colors.accent + '10',
    marginBottom: Spacing.md,
  },
  advancedButtonText: {
    color: Colors.accent,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  tipCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.warningAmber + '20',
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tipTitle: {
    color: Colors.warningAmber,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  tipBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceLight,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  navButtonTextDisabled: {
    color: Colors.textTertiary,
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
  },
  navStepLabel: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  navButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  navButtonPrimaryText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
