import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useImageTransform } from '@fastshot/ai';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import Card from '@/components/Card';

type ScaleMode = 'fit' | 'fill' | 'stretch';

export default function MediaConfig() {
  const insets = useSafeAreaInsets();
  const { lightImpact, mediumImpact, success } = useHaptics();

  const [selectedMedia] = useStorage<string | null>(STORAGE_KEYS.SELECTED_MEDIA, null);
  const [rotation, setRotation] = useStorage(STORAGE_KEYS.ROTATION, 0);
  const [mirrored, setMirrored] = useStorage(STORAGE_KEYS.MIRRORED, false);
  const [scaleMode, setScaleMode] = useStorage<ScaleMode>(STORAGE_KEYS.SCALE_MODE, 'fit');
  const [aiEnhancement, setAiEnhancement] = useStorage<string | null>(
    STORAGE_KEYS.AI_ENHANCEMENT,
    null
  );

  const [enhancedUri, setEnhancedUri] = useState<string | null>(null);
  const [activeAiMode, setActiveAiMode] = useState<string | null>(null);

  const { transformImage, data: transformData, isLoading: aiLoading, reset: resetAi } = useImageTransform();

  const handleRotate = useCallback(() => {
    mediumImpact();
    setRotation((prev: number) => (prev + 90) % 360);
  }, [mediumImpact, setRotation]);

  const handleMirror = useCallback(() => {
    lightImpact();
    setMirrored((prev: boolean) => !prev);
  }, [lightImpact, setMirrored]);

  const handleScaleMode = useCallback(
    (mode: ScaleMode) => {
      lightImpact();
      setScaleMode(mode);
    },
    [lightImpact, setScaleMode]
  );

  const handleAiEnhance = useCallback(
    async (mode: string) => {
      if (!selectedMedia) {
        Alert.alert('No Media', 'Please select media from the Library tab first.');
        return;
      }
      mediumImpact();
      setActiveAiMode(mode);

      let prompt = '';
      switch (mode) {
        case 'upscale':
          prompt = 'Upscale this image to higher resolution with enhanced detail and sharpness. Make it look crisp and professional quality.';
          break;
        case 'studio':
          prompt = 'Apply professional studio lighting to this image. Add soft, flattering light with subtle rim lighting, reduce harsh shadows, and make it look like a professionally lit studio photograph.';
          break;
        case 'enhance':
          prompt = 'Enhance this image by improving color balance, brightness, contrast, and overall quality. Make colors more vivid and details more crisp while keeping the natural look.';
          break;
        case 'cinematic':
          prompt = 'Apply a cinematic color grade to this image. Add a filmic look with rich shadows, warm highlights, slight vignetting, and a professional movie-like atmosphere.';
          break;
        default:
          prompt = 'Enhance this image with professional quality improvements.';
      }

      try {
        await transformImage({
          imageUrl: selectedMedia,
          prompt,
        });
      } catch {
        Alert.alert('AI Error', 'Failed to apply AI enhancement. Please try again.');
        setActiveAiMode(null);
      }
    },
    [selectedMedia, mediumImpact, transformImage]
  );

  React.useEffect(() => {
    if (transformData?.images?.[0] && activeAiMode) {
      setEnhancedUri(transformData.images[0]);
      setAiEnhancement(activeAiMode);
      setActiveAiMode(null);
      success();
    }
  }, [transformData, activeAiMode, setAiEnhancement, success]);

  const clearEnhancement = useCallback(() => {
    lightImpact();
    setEnhancedUri(null);
    setAiEnhancement(null);
    resetAi();
  }, [lightImpact, setAiEnhancement, resetAi]);

  const displayUri = enhancedUri || selectedMedia;

  const getContentFit = (): 'contain' | 'cover' | 'fill' => {
    switch (scaleMode) {
      case 'fit':
        return 'contain';
      case 'fill':
        return 'cover';
      case 'stretch':
        return 'fill';
      default:
        return 'contain';
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.lg },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.screenTitle}>Configuration</Text>
        <Text style={styles.screenSubtitle}>
          Transform and enhance your media source
        </Text>
      </Animated.View>

      {/* Live Transform Preview */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="image-edit" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Transform Preview</Text>
        </View>
        <Card style={styles.previewCard}>
          {displayUri ? (
            <View style={styles.previewContainer}>
              <Image
                source={{ uri: displayUri }}
                style={[
                  styles.previewImage,
                  {
                    transform: [
                      { rotate: `${rotation}deg` },
                      { scaleX: mirrored ? -1 : 1 },
                    ],
                  },
                ]}
                contentFit={getContentFit()}
                transition={300}
              />
              {aiLoading && (
                <View style={styles.aiOverlay}>
                  <ActivityIndicator color={Colors.accent} size="large" />
                  <Text style={styles.aiOverlayText}>
                    AI Processing... (10-30s)
                  </Text>
                </View>
              )}
              <View style={styles.previewInfoBar}>
                <Text style={styles.previewInfoText}>
                  {rotation}° • {mirrored ? 'Mirrored' : 'Normal'} • {scaleMode.toUpperCase()}
                </Text>
                {aiEnhancement && (
                  <View style={styles.aiAppliedBadge}>
                    <Ionicons name="sparkles" size={10} color={Colors.accent} />
                    <Text style={styles.aiAppliedText}>AI</Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.emptyPreview}>
              <View style={styles.emptyIconCircle}>
                <MaterialCommunityIcons
                  name="image-off-outline"
                  size={32}
                  color={Colors.textTertiary}
                />
              </View>
              <Text style={styles.emptyTitle}>No Media Loaded</Text>
              <Text style={styles.emptySubtitle}>
                Select media from the Library tab
              </Text>
            </View>
          )}
        </Card>
      </Animated.View>

      {/* Transformation Controls */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="rotate-3d-variant" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Transformation</Text>
        </View>
        <View style={styles.transformRow}>
          <TransformButton
            icon="rotate-right"
            label={`Rotate ${rotation}°`}
            onPress={handleRotate}
            active={rotation !== 0}
          />
          <TransformButton
            icon="flip-horizontal"
            label={mirrored ? 'Mirrored' : 'Mirror'}
            onPress={handleMirror}
            active={mirrored}
          />
          <TransformButton
            icon="restore"
            label="Reset"
            onPress={() => {
              lightImpact();
              setRotation(0);
              setMirrored(false);
            }}
            active={false}
          />
        </View>
      </Animated.View>

      {/* Scaling Modes */}
      <Animated.View entering={FadeInDown.delay(400).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="aspect-ratio" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Scaling Mode</Text>
        </View>
        <View style={styles.scaleModeRow}>
          <ScaleModeButton
            mode="fit"
            label="Fit"
            description="Letterbox"
            icon="fit-to-screen-outline"
            current={scaleMode}
            onPress={handleScaleMode}
          />
          <ScaleModeButton
            mode="fill"
            label="Fill"
            description="Crop edges"
            icon="arrow-expand-all"
            current={scaleMode}
            onPress={handleScaleMode}
          />
          <ScaleModeButton
            mode="stretch"
            label="Stretch"
            description="Distort"
            icon="stretch-to-page-outline"
            current={scaleMode}
            onPress={handleScaleMode}
          />
        </View>
      </Animated.View>

      {/* AI Enhancement */}
      <Animated.View entering={FadeInDown.delay(500).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="sparkles" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>AI Enhancement</Text>
          {aiEnhancement && (
            <Pressable onPress={clearEnhancement} style={styles.clearAiButton}>
              <Text style={styles.clearAiText}>Clear</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.aiDescription}>
          Powered by Newell AI • Transforms take 10-30 seconds
        </Text>
        <View style={styles.aiGrid}>
          <AiEnhanceCard
            icon="arrow-expand-all"
            label="Upscale"
            description="Boost resolution & detail"
            mode="upscale"
            onPress={handleAiEnhance}
            loading={aiLoading && activeAiMode === 'upscale'}
            disabled={aiLoading || !selectedMedia}
            active={aiEnhancement === 'upscale'}
          />
          <AiEnhanceCard
            icon="lightbulb-on-outline"
            label="Studio Light"
            description="Professional lighting"
            mode="studio"
            onPress={handleAiEnhance}
            loading={aiLoading && activeAiMode === 'studio'}
            disabled={aiLoading || !selectedMedia}
            active={aiEnhancement === 'studio'}
          />
          <AiEnhanceCard
            icon="auto-fix"
            label="Auto Enhance"
            description="Color & clarity boost"
            mode="enhance"
            onPress={handleAiEnhance}
            loading={aiLoading && activeAiMode === 'enhance'}
            disabled={aiLoading || !selectedMedia}
            active={aiEnhancement === 'enhance'}
          />
          <AiEnhanceCard
            icon="movie-filter-outline"
            label="Cinematic"
            description="Filmic color grade"
            mode="cinematic"
            onPress={handleAiEnhance}
            loading={aiLoading && activeAiMode === 'cinematic'}
            disabled={aiLoading || !selectedMedia}
            active={aiEnhancement === 'cinematic'}
          />
        </View>
      </Animated.View>

      {enhancedUri && (
        <Animated.View entering={FadeIn.delay(200).duration(400)}>
          <Card
            glow
            glowColor={Colors.successGlow}
            style={styles.enhancedBanner}
          >
            <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
            <View style={styles.enhancedBannerText}>
              <Text style={styles.enhancedTitle}>Enhancement Applied</Text>
              <Text style={styles.enhancedSubtitle}>
                AI {aiEnhancement} filter is active on your media
              </Text>
            </View>
          </Card>
        </Animated.View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function TransformButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  active: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.transformButtonWrapper, animStyle]}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.93);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        onPress={onPress}
        style={[
          styles.transformButton,
          active && styles.transformButtonActive,
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={active ? Colors.accent : Colors.textSecondary}
        />
        <Text
          style={[
            styles.transformLabel,
            active && { color: Colors.accent },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function ScaleModeButton({
  mode,
  label,
  description,
  icon,
  current,
  onPress,
}: {
  mode: ScaleMode;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  current: ScaleMode;
  onPress: (mode: ScaleMode) => void;
}) {
  const isActive = current === mode;
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.scaleModeWrapper, animStyle]}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.95);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        onPress={() => onPress(mode)}
        style={[
          styles.scaleModeButton,
          isActive && styles.scaleModeButtonActive,
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={isActive ? Colors.accent : Colors.textTertiary}
        />
        <Text
          style={[
            styles.scaleModeLabel,
            isActive && { color: Colors.accent },
          ]}
        >
          {label}
        </Text>
        <Text style={styles.scaleModeDesc}>{description}</Text>
      </Pressable>
    </Animated.View>
  );
}

function AiEnhanceCard({
  icon,
  label,
  description,
  mode,
  onPress,
  loading,
  disabled,
  active,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  description: string;
  mode: string;
  onPress: (mode: string) => void;
  loading: boolean;
  disabled: boolean;
  active: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.aiCardWrapper, animStyle]}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.95);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        onPress={() => onPress(mode)}
        disabled={disabled}
        style={[
          styles.aiCard,
          active && styles.aiCardActive,
          disabled && !loading && styles.aiCardDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={Colors.accent} size="small" />
        ) : (
          <MaterialCommunityIcons
            name={icon}
            size={22}
            color={active ? Colors.accent : disabled ? Colors.textTertiary : Colors.textSecondary}
          />
        )}
        <Text
          style={[
            styles.aiCardLabel,
            active && { color: Colors.accent },
            disabled && !loading && { color: Colors.textTertiary },
          ]}
        >
          {label}
        </Text>
        <Text style={styles.aiCardDesc}>{description}</Text>
        {active && (
          <View style={styles.aiActiveIndicator}>
            <Ionicons name="checkmark" size={12} color={Colors.accent} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  screenTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  screenSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    marginTop: 4,
    marginBottom: Spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  previewCard: {
    padding: 0,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  aiOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18, 18, 18, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  aiOverlayText: {
    color: Colors.accent,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  previewInfoBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.overlay,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  previewInfoText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  aiAppliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent + '30',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  aiAppliedText: {
    color: Colors.accent,
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  emptyPreview: {
    aspectRatio: 4 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
  },
  transformRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  transformButtonWrapper: {
    flex: 1,
  },
  transformButton: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  transformButtonActive: {
    borderColor: Colors.accent + '50',
    backgroundColor: Colors.accent + '10',
  },
  transformLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  scaleModeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  scaleModeWrapper: {
    flex: 1,
  },
  scaleModeButton: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scaleModeButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '10',
  },
  scaleModeLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },
  scaleModeDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
  },
  aiDescription: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
    marginTop: -Spacing.xs,
  },
  aiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  aiCardWrapper: {
    width: '48%',
    flexGrow: 1,
  },
  aiCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 100,
  },
  aiCardActive: {
    borderColor: Colors.accent + '60',
    backgroundColor: Colors.accent + '10',
  },
  aiCardDisabled: {
    opacity: 0.5,
  },
  aiCardLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  aiCardDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
  },
  aiActiveIndicator: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAiButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLighter,
  },
  clearAiText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  enhancedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  enhancedBannerText: {
    flex: 1,
  },
  enhancedTitle: {
    color: Colors.success,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  enhancedSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
});
