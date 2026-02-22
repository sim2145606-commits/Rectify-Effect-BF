import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FontSize, Spacing, BorderRadius, platformShadow } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

type ScaleMode = 'fit' | 'fill' | 'stretch';

type Props = {
  mediaUri: string | null;
  rotation: number;
  mirrored: boolean;
  flippedVertical: boolean;
  scaleMode: ScaleMode;
  offsetX: number;
  offsetY: number;
  aiOptimize: boolean;
  aiSubjectLock: boolean;
  aiLoading: boolean;
  engineActive: boolean;
};

export default function HUDViewfinder({
  mediaUri,
  rotation,
  mirrored,
  flippedVertical,
  scaleMode,
  offsetX,
  offsetY,
  aiOptimize,
  aiSubjectLock,
  aiLoading,
  engineActive,
}: Props) {
  const { colors } = useTheme();

  const scanLineY = useSharedValue(0);
  const scanPulse = useSharedValue(0.3);
  const cornerPulse = useSharedValue(1);

  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );
    scanPulse.value = withRepeat(
      withSequence(withTiming(0.8, { duration: 1500 }), withTiming(0.3, { duration: 1500 })),
      -1,
      true
    );
    cornerPulse.value = withRepeat(
      withSequence(withTiming(0.6, { duration: 2000 }), withTiming(1, { duration: 2000 })),
      -1,
      true
    );
  }, [scanLineY, scanPulse, cornerPulse]);

  const scanLineStyle = useAnimatedStyle(() => ({
    top: `${scanLineY.value * 100}%` as `${number}%`,
    opacity: scanPulse.value,
  }));

  const cornerStyle = useAnimatedStyle(() => ({
    opacity: cornerPulse.value,
  }));

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
    <Animated.View entering={FadeIn.duration(600)} style={styles.container}>
      {/* Outer glow border */}
      <View
        style={[
          styles.glowBorder,
          {
            borderColor: colors.electricBlue + '40',
            ...platformShadow(colors.electricBlue, 0, 16, 0.3, 10),
          },
        ]}
      >
        <View style={styles.viewfinder}>
          {mediaUri ? (
            <View style={styles.mediaContainer}>
              {mediaUri.match(/\.(mp4|mov|mkv|avi|webm)$/i) ? (
                <Video
                  source={{ uri: mediaUri }}
                  style={[
                    styles.mediaImage,
                    {
                      transform: [
                        { translateX: offsetX },
                        { translateY: offsetY },
                        { rotate: `${rotation}deg` },
                        { scaleX: mirrored ? -1 : 1 },
                        { scaleY: flippedVertical ? -1 : 1 },
                      ],
                    },
                  ]}
                  resizeMode={ResizeMode.COVER}
                  shouldPlay
                  isLooping
                  isMuted
                />
              ) : (
                <Image
                  source={{ uri: mediaUri }}
                  style={[
                    styles.mediaImage,
                    {
                      transform: [
                        { translateX: offsetX },
                        { translateY: offsetY },
                        { rotate: `${rotation}deg` },
                        { scaleX: mirrored ? -1 : 1 },
                        { scaleY: flippedVertical ? -1 : 1 },
                      ],
                    },
                  ]}
                  contentFit={getContentFit()}
                  transition={200}
                />
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View
                style={[styles.emptyIconRing, { borderColor: colors.electricBlue + '40' }]}
              >
                <Ionicons name="videocam-off-outline" size={28} color={colors.electricBlue} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.electricBlue }]}>NO SIGNAL</Text>
              <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>
                Load media from Library
              </Text>
            </View>
          )}

          {/* Scanning Line */}
          <Animated.View style={[styles.scanLine, scanLineStyle]}>
            <LinearGradient
              colors={['transparent', colors.electricBlue + '40', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.scanLineGradient}
            />
          </Animated.View>

          {/* Corner Brackets */}
          <Animated.View style={[styles.cornerTL, cornerStyle]}>
            <View style={[styles.cornerH, styles.cornerHTop, { backgroundColor: colors.electricBlue }]} />
            <View style={[styles.cornerV, styles.cornerVLeft, { backgroundColor: colors.electricBlue }]} />
          </Animated.View>
          <Animated.View style={[styles.cornerTR, cornerStyle]}>
            <View style={[styles.cornerH, styles.cornerHTop, { alignSelf: 'flex-end', backgroundColor: colors.electricBlue }]} />
            <View style={[styles.cornerV, styles.cornerVRight, { backgroundColor: colors.electricBlue }]} />
          </Animated.View>
          <Animated.View style={[styles.cornerBL, cornerStyle]}>
            <View style={[styles.cornerH, styles.cornerHBottom, { backgroundColor: colors.electricBlue }]} />
            <View style={[styles.cornerV, styles.cornerVLeft, { alignSelf: 'flex-end', backgroundColor: colors.electricBlue }]} />
          </Animated.View>
          <Animated.View style={[styles.cornerBR, cornerStyle]}>
            <View style={[styles.cornerH, styles.cornerHBottom, { alignSelf: 'flex-end', backgroundColor: colors.electricBlue }]} />
            <View style={[styles.cornerV, styles.cornerVRight, { alignSelf: 'flex-end', backgroundColor: colors.electricBlue }]} />
          </Animated.View>

          {/* HUD Info Overlay - Top */}
          <View style={styles.hudTop}>
            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'transparent']}
              style={styles.hudTopGradient}
            >
              <View style={styles.hudTopRow}>
                <View
                  style={[styles.hudBadge, { borderColor: colors.border }]}
                >
                  <View
                    style={[
                      styles.hudDot,
                      { backgroundColor: engineActive ? colors.success : colors.danger },
                    ]}
                  />
                  <Text style={[styles.hudBadgeText, { color: colors.textSecondary }]}>
                    {engineActive ? 'LIVE' : 'IDLE'}
                  </Text>
                </View>
                <Text style={[styles.hudLabel, { color: colors.electricBlue + '80' }]}>
                  VIRTUCAM STUDIO
                </Text>
                <Text style={[styles.hudTimecode, { color: colors.textTertiary }]}>
                  {rotation}
                  {'°'} {scaleMode.toUpperCase()}
                </Text>
              </View>
            </LinearGradient>
          </View>

          {/* HUD Info Overlay - Bottom */}
          <View style={styles.hudBottom}>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)']}
              style={styles.hudBottomGradient}
            >
              <View style={styles.hudBottomRow}>
                <View style={styles.hudMetrics}>
                  <Text style={[styles.hudMetricLabel, { color: colors.textTertiary }]}>ROT</Text>
                  <Text style={[styles.hudMetricValue, { color: colors.electricBlue }]}>
                    {rotation}
                    {'°'}
                  </Text>
                </View>
                <View style={styles.hudMetrics}>
                  <Text style={[styles.hudMetricLabel, { color: colors.textTertiary }]}>SCALE</Text>
                  <Text style={[styles.hudMetricValue, { color: colors.electricBlue }]}>
                    {scaleMode.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.hudMetrics}>
                  <Text style={[styles.hudMetricLabel, { color: colors.textTertiary }]}>MIRROR</Text>
                  <Text style={[styles.hudMetricValue, { color: colors.electricBlue }]}>
                    {mirrored ? 'H' : '-'}
                    {flippedVertical ? 'V' : '-'}
                  </Text>
                </View>
                <View style={styles.hudMetrics}>
                  <Text style={[styles.hudMetricLabel, { color: colors.textTertiary }]}>OFFSET</Text>
                  <Text style={[styles.hudMetricValue, { color: colors.electricBlue }]}>
                    {offsetX},{offsetY}
                  </Text>
                </View>
                {aiOptimize && (
                  <View
                    style={[
                      styles.hudBadge,
                      {
                        borderColor: colors.electricBlue + '40',
                        backgroundColor: colors.electricBlue + '15',
                      },
                    ]}
                  >
                    <Ionicons name="sparkles" size={10} color={colors.electricBlue} />
                    <Text style={[styles.hudBadgeText, { color: colors.electricBlue }]}>AI</Text>
                  </View>
                )}
                {aiSubjectLock && (
                  <View
                    style={[
                      styles.hudBadge,
                      {
                        borderColor: colors.warning + '40',
                        backgroundColor: colors.warning + '15',
                      },
                    ]}
                  >
                    <Ionicons name="scan" size={10} color={colors.warning} />
                    <Text style={[styles.hudBadgeText, { color: colors.warning }]}>LOCK</Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </View>

          {/* AI Processing Overlay */}
          {aiLoading && (
            <View style={styles.aiProcessingOverlay}>
              <Animated.View style={styles.aiProcessingContent}>
                <View
                  style={[
                    styles.aiSpinner,
                    {
                      borderColor: colors.electricBlue + '40',
                      borderTopColor: colors.electricBlue,
                    },
                  ]}
                >
                  <Ionicons name="sparkles" size={24} color={colors.electricBlue} />
                </View>
                <Text style={[styles.aiProcessingText, { color: colors.electricBlue }]}>
                  AI PROCESSING
                </Text>
                <Text style={[styles.aiProcessingSubtext, { color: colors.textTertiary }]}>
                  Optimizing feed... 10-30s
                </Text>
              </Animated.View>
            </View>
          )}

          {/* Grid Overlay (subtle) */}
          <View style={styles.gridOverlay}>
            <View
              style={[
                styles.gridLineH,
                { top: '33.33%', backgroundColor: colors.electricBlue + '12' },
              ]}
            />
            <View
              style={[
                styles.gridLineH,
                { top: '66.66%', backgroundColor: colors.electricBlue + '12' },
              ]}
            />
            <View
              style={[
                styles.gridLineV,
                { left: '33.33%', backgroundColor: colors.electricBlue + '12' },
              ]}
            />
            <View
              style={[
                styles.gridLineV,
                { left: '66.66%', backgroundColor: colors.electricBlue + '12' },
              ]}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  glowBorder: {
    borderRadius: BorderRadius.lg + 2,
    borderWidth: 1,
    padding: 2,
  },
  viewfinder: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: '#050508',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  emptyIconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    letterSpacing: 3,
  },
  emptySubtext: {
    fontSize: FontSize.xs,
    letterSpacing: 1,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    zIndex: 10,
  },
  scanLineGradient: {
    flex: 1,
  },
  cornerTL: { position: 'absolute', top: 8, left: 8, width: 20, height: 20 },
  cornerTR: { position: 'absolute', top: 8, right: 8, width: 20, height: 20 },
  cornerBL: { position: 'absolute', bottom: 8, left: 8, width: 20, height: 20 },
  cornerBR: { position: 'absolute', bottom: 8, right: 8, width: 20, height: 20 },
  cornerH: { width: 20, height: 1.5 },
  cornerHTop: { position: 'absolute', top: 0 },
  cornerHBottom: { position: 'absolute', bottom: 0 },
  cornerV: { width: 1.5, height: 20 },
  cornerVLeft: { position: 'absolute', left: 0 },
  cornerVRight: { position: 'absolute', right: 0 },
  hudTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  hudTopGradient: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  hudTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  hudDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  hudBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hudLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  hudTimecode: {
    fontSize: 9,
    fontWeight: '600',
  },
  hudBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  hudBottomGradient: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.xl,
  },
  hudBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  hudMetrics: {
    alignItems: 'center',
    gap: 1,
  },
  hudMetricLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  hudMetricValue: {
    fontSize: 9,
    fontWeight: '800',
  },
  aiProcessingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,5,8,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  aiProcessingContent: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  aiSpinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiProcessingText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    letterSpacing: 2,
  },
  aiProcessingSubtext: {
    fontSize: FontSize.xs,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0.5,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0.5,
  },
});
