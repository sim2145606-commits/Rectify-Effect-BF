import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useImageTransform, useImageAnalysis } from '@/hooks/useAI';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import { saveEnhancedMedia, cleanEnhancedCache } from '@/services/PathResolver';
import { writeBridgeConfig } from '@/services/ConfigBridge';

type Props = {
  selectedMedia: string | null;
  aiOptimize: boolean;
  aiSubjectLock: boolean;
  onAiOptimizeChange: (value: boolean) => void;
  onAiSubjectLockChange: (value: boolean) => void;
  onEnhancedUriChange: (uri: string | null) => void;
};

export default function AIEnhancementSuite({
  selectedMedia,
  aiOptimize,
  aiSubjectLock,
  onAiOptimizeChange,
  onAiSubjectLockChange,
  onEnhancedUriChange,
}: Props) {
  const { mediumImpact, heavyImpact, success } = useHaptics();
  const [, setAiEnhancement] = useStorage<string | null>(STORAGE_KEYS.AI_ENHANCEMENT, null);
  const [activeMode, setActiveMode] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  const { transformImage, data: transformData, isLoading: transformLoading, reset: resetTransform } = useImageTransform();
  const { analyzeImage, data: analysisData, isLoading: analysisLoading, reset: resetAnalysis } = useImageAnalysis();

  // Pulse animation for active AI
  const aiPulse = useSharedValue(1);
  useEffect(() => {
    if (aiOptimize || aiSubjectLock) {
      aiPulse.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        true
      );
    } else {
      aiPulse.value = 1;
    }
  }, [aiOptimize, aiSubjectLock, aiPulse]);

  const aiGlowStyle = useAnimatedStyle(() => ({
    opacity: aiPulse.value,
  }));

  // Handle AI Optimize toggle
  const handleAiOptimize = useCallback(async () => {
    if (!selectedMedia) {
      Alert.alert('No Media', 'Select media from the Library tab first.');
      return;
    }

    if (aiOptimize) {
      // Turn off
      mediumImpact();
      onAiOptimizeChange(false);
      onEnhancedUriChange(null);
      setAiEnhancement(null);
      resetTransform();
      try {
        await cleanEnhancedCache();
        await writeBridgeConfig({
          enhancedMediaPath: null,
          aiFilterApplied: null,
        });
      } catch {
        // Non-critical
      }
      return;
    }

    // Turn on - process image
    heavyImpact();
    setActiveMode('optimize');
    setProcessingStatus('Reducing noise & sharpening...');

    try {
      await transformImage({
        imageUrl: selectedMedia,
        prompt: 'Professionally enhance this image for a video call: reduce noise, sharpen clarity, improve lighting balance, correct color temperature for natural skin tones, and optimize brightness. Make it look like a professional studio webcam feed.',
      });
    } catch {
      Alert.alert('AI Error', 'Failed to apply AI optimization. Please try again.');
      setActiveMode(null);
      setProcessingStatus('');
    }
  }, [selectedMedia, aiOptimize, mediumImpact, heavyImpact, onAiOptimizeChange, onEnhancedUriChange, setAiEnhancement, transformImage, resetTransform]);

  // Handle AI Subject Lock toggle
  const handleAiSubjectLock = useCallback(async () => {
    if (!selectedMedia) {
      Alert.alert('No Media', 'Select media from the Library tab first.');
      return;
    }

    if (aiSubjectLock) {
      mediumImpact();
      onAiSubjectLockChange(false);
      resetAnalysis();
      return;
    }

    // Turn on - analyze image for subject detection
    heavyImpact();
    setActiveMode('subjectlock');
    setProcessingStatus('Detecting primary subject...');

    try {
      await analyzeImage({
        imageUrl: selectedMedia,
        prompt: 'Analyze this image and identify the primary subject (person/face). Describe the subject position in the frame (center, left, right, top, bottom) and suggest optimal crop coordinates to keep the subject centered in a 16:9 aspect ratio. Provide the suggested pan/scale adjustments as percentages.',
      });
    } catch {
      Alert.alert('AI Error', 'Failed to analyze subject. Please try again.');
      setActiveMode(null);
      setProcessingStatus('');
    }
  }, [selectedMedia, aiSubjectLock, mediumImpact, heavyImpact, onAiSubjectLockChange, analyzeImage, resetAnalysis]);

  // Process transform result
  useEffect(() => {
    if (transformData?.images?.[0] && activeMode === 'optimize') {
      const processResult = async () => {
        const remoteUri = transformData.images![0];
        onEnhancedUriChange(remoteUri);
        onAiOptimizeChange(true);
        setAiEnhancement('optimize');

        try {
          const savedPath = await saveEnhancedMedia(remoteUri, 'ai_optimize');
          if (savedPath) {
            await writeBridgeConfig({
              enhancedMediaPath: savedPath,
              aiFilterApplied: 'ai_optimize',
            });
          }
        } catch {
          // Non-critical
        }

        setActiveMode(null);
        setProcessingStatus('');
        success();
      };
      processResult();
    }
  }, [transformData, activeMode, onEnhancedUriChange, onAiOptimizeChange, setAiEnhancement, success]);

  // Process analysis result
  useEffect(() => {
    if (analysisData && activeMode === 'subjectlock') {
      onAiSubjectLockChange(true);
      setActiveMode(null);
      setProcessingStatus('');
      success();
    }
  }, [analysisData, activeMode, onAiSubjectLockChange, success]);

  const isLoading = transformLoading || analysisLoading;

  return (
    <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={16} color={Colors.electricBlue} />
        <Text style={styles.headerTitle}>AI ENHANCEMENT SUITE</Text>
        {(aiOptimize || aiSubjectLock) && (
          <Animated.View style={[styles.aiActiveBadge, aiGlowStyle]}>
            <Text style={styles.aiActiveText}>ACTIVE</Text>
          </Animated.View>
        )}
      </View>
      <Text style={styles.subtitle}>AI-powered image enhancement (placeholder implementation)</Text>

      {/* AI Optimize Card */}
      <AIFeatureCard
        icon="auto-fix"
        title="AI Optimize"
        description="Noise reduction, sharpening, and lighting correction for professional-quality feed"
        active={aiOptimize}
        loading={isLoading && activeMode === 'optimize'}
        processingText={activeMode === 'optimize' ? processingStatus : ''}
        disabled={isLoading}
        onPress={handleAiOptimize}
        accentColor={Colors.electricBlue}
      />

      {/* AI Subject Lock Card */}
      <AIFeatureCard
        icon="scan-helper"
        title="AI Subject Lock"
        description="Intelligently pans and scales video to keep the subject centered across any aspect ratio"
        active={aiSubjectLock}
        loading={isLoading && activeMode === 'subjectlock'}
        processingText={activeMode === 'subjectlock' ? processingStatus : ''}
        disabled={isLoading}
        onPress={handleAiSubjectLock}
        accentColor={Colors.warning}
      />

      {/* Enhancement Status */}
      {(aiOptimize || aiSubjectLock) && !isLoading && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.statusBanner}>
          <LinearGradient
            colors={[Colors.electricBlue + '10', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.statusGradient}
          >
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <View style={styles.statusTextContainer}>
              <Text style={styles.statusTitle}>Enhancements Active</Text>
              <Text style={styles.statusSubtext}>
                {[
                  aiOptimize ? 'AI Optimize' : '',
                  aiSubjectLock ? 'Subject Lock' : '',
                ].filter(Boolean).join(' + ')}
                {' applied to feed'}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function AIFeatureCard({
  icon,
  title,
  description,
  active,
  loading,
  processingText,
  disabled,
  onPress,
  accentColor,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description: string;
  active: boolean;
  loading: boolean;
  processingText: string;
  disabled: boolean;
  onPress: () => void;
  accentColor: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.featureCardWrapper, animStyle]}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={onPress}
        disabled={disabled && !active}
        style={[
          styles.featureCard,
          active && { borderColor: accentColor + '50', backgroundColor: accentColor + '08' },
          disabled && !active && styles.featureCardDisabled,
        ]}
      >
        <View style={styles.featureCardHeader}>
          <View style={[styles.featureIconCircle, active && { backgroundColor: accentColor + '20', borderColor: accentColor + '40' }]}>
            {loading ? (
              <ActivityIndicator size="small" color={accentColor} />
            ) : (
              <MaterialCommunityIcons
                name={icon}
                size={22}
                color={active ? accentColor : Colors.textTertiary}
              />
            )}
          </View>
          <View style={styles.featureTextContent}>
            <Text style={[styles.featureTitle, active && { color: accentColor }]}>
              {title}
            </Text>
            <Text style={styles.featureDesc}>{description}</Text>
          </View>
          <View style={[styles.featureToggle, active && { backgroundColor: accentColor }]}>
            <View style={[styles.featureToggleKnob, active && styles.featureToggleKnobActive]} />
          </View>
        </View>
        {loading && processingText ? (
          <View style={styles.processingBar}>
            <View style={[styles.processingIndicator, { backgroundColor: accentColor }]} />
            <Text style={[styles.processingText, { color: accentColor }]}>
              {processingText} (10-30s)
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  headerTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    flex: 1,
  },
  aiActiveBadge: {
    backgroundColor: Colors.electricBlue + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '40',
  },
  aiActiveText: {
    color: Colors.electricBlue,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subtitle: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginBottom: Spacing.md,
  },
  featureCardWrapper: {
    marginBottom: Spacing.sm,
  },
  featureCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  featureCardDisabled: {
    opacity: 0.5,
  },
  featureCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  featureIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextContent: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  featureDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  featureToggle: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.inactive,
    padding: 2,
    justifyContent: 'center',
  },
  featureToggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.textTertiary,
  },
  featureToggleKnobActive: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.textPrimary,
  },
  processingBar: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  processingIndicator: {
    height: 2,
    borderRadius: 1,
    width: '60%',
  },
  processingText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  statusBanner: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.success + '30',
    marginTop: Spacing.xs,
  },
  statusGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    color: Colors.success,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  statusSubtext: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 1,
  },
});
