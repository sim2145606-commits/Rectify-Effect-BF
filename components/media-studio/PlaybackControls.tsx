import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';

type Props = {
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  mediaDuration: number;
  onLoopEnabledChange: (enabled: boolean) => void;
  onLoopStartChange: (time: number) => void;
  onLoopEndChange: (time: number) => void;
};

export default function PlaybackControls({
  loopEnabled,
  loopStart,
  loopEnd,
  mediaDuration,
  onLoopEnabledChange,
  onLoopStartChange,
  onLoopEndChange,
}: Props) {
  const { lightImpact, mediumImpact, heavyImpact, selection } = useHaptics();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(loopStart);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback simulation
  const playbackProgress = useSharedValue(0);

  // Looping playback indicator pulse
  const loopPulse = useSharedValue(1);
  useEffect(() => {
    if (loopEnabled && isPlaying) {
      loopPulse.value = withRepeat(
        withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      loopPulse.value = 1;
    }
  }, [loopEnabled, isPlaying, loopPulse]);

  const loopPulseStyle = useAnimatedStyle(() => ({
    opacity: loopPulse.value,
  }));

  // Simulate playback
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const effectiveEnd = loopEnd > 0 ? loopEnd : mediaDuration;
          const effectiveStart = loopStart;
          const next = prev + 0.1;
          if (next >= effectiveEnd) {
            if (loopEnabled) {
              return effectiveStart;
            }
            setIsPlaying(false);
            return effectiveEnd;
          }
          return Math.round(next * 10) / 10;
        });
      }, 100);
    }
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, loopEnabled, loopStart, loopEnd, mediaDuration]);

  // Update progress bar
  useEffect(() => {
    const effectiveEnd = loopEnd > 0 ? loopEnd : mediaDuration;
    const duration = effectiveEnd - loopStart;
    if (duration > 0) {
      playbackProgress.value = (currentTime - loopStart) / duration;
    }
  }, [currentTime, loopStart, loopEnd, mediaDuration, playbackProgress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, playbackProgress.value * 100))}%` as `${number}%`,
  }));

  const handlePlayPause = useCallback(() => {
    mediumImpact();
    setIsPlaying((prev) => !prev);
  }, [mediumImpact]);

  const handleLoopToggle = useCallback(() => {
    heavyImpact();
    onLoopEnabledChange(!loopEnabled);
  }, [loopEnabled, onLoopEnabledChange, heavyImpact]);

  const handleSetLoopStart = useCallback(() => {
    selection();
    onLoopStartChange(Math.round(currentTime * 10) / 10);
  }, [currentTime, onLoopStartChange, selection]);

  const handleSetLoopEnd = useCallback(() => {
    selection();
    onLoopEndChange(Math.round(currentTime * 10) / 10);
  }, [currentTime, onLoopEndChange, selection]);

  const handleResetLoop = useCallback(() => {
    lightImpact();
    onLoopStartChange(0);
    onLoopEndChange(mediaDuration);
    setCurrentTime(0);
  }, [mediaDuration, onLoopStartChange, onLoopEndChange, lightImpact]);

  const handleScrub = useCallback((position: number) => {
    selection();
    const effectiveEnd = loopEnd > 0 ? loopEnd : mediaDuration;
    const newTime = loopStart + (effectiveEnd - loopStart) * position;
    setCurrentTime(Math.round(newTime * 10) / 10);
  }, [loopStart, loopEnd, mediaDuration, selection]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const effectiveEnd = loopEnd > 0 ? loopEnd : mediaDuration;

  return (
    <Animated.View entering={FadeInDown.delay(600).duration(500)} style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="play-circle-outline" size={16} color={Colors.electricBlue} />
        <Text style={styles.headerTitle}>PLAYBACK ENGINE</Text>
        {loopEnabled && (
          <Animated.View style={[styles.loopBadge, loopPulseStyle]}>
            <Ionicons name="repeat" size={10} color={Colors.electricBlue} />
            <Text style={styles.loopBadgeText}>LOOP</Text>
          </Animated.View>
        )}
      </View>

      <View style={styles.panel}>
        {/* Time Display */}
        <View style={styles.timeDisplay}>
          <Text style={styles.currentTime}>{formatTime(currentTime)}</Text>
          <Text style={styles.timeSeparator}>/</Text>
          <Text style={styles.totalTime}>{formatTime(effectiveEnd)}</Text>
        </View>

        {/* Progress Bar with Scrubber */}
        <Pressable
          style={styles.progressBarContainer}
          onPress={(e) => {
            const { locationX } = e.nativeEvent;
            const width = 280; // Approximate
            handleScrub(Math.max(0, Math.min(1, locationX / width)));
          }}
        >
          <View style={styles.progressBarBg}>
            {/* Loop region */}
            {loopEnabled && mediaDuration > 0 && (
              <View
                style={[
                  styles.loopRegion,
                  {
                    left: `${(loopStart / mediaDuration) * 100}%` as `${number}%`,
                    width: `${((effectiveEnd - loopStart) / mediaDuration) * 100}%` as `${number}%`,
                  },
                ]}
              />
            )}
            {/* Progress fill */}
            <Animated.View style={[styles.progressFill, progressStyle]} />
            {/* Scrubber handle */}
            <Animated.View style={[styles.scrubber, { left: progressStyle.width }]}>
              <View style={styles.scrubberHandle} />
            </Animated.View>
          </View>
        </Pressable>

        {/* Transport Controls */}
        <View style={styles.transportRow}>
          <Pressable style={styles.transportButton} onPress={handleResetLoop}>
            <MaterialCommunityIcons name="skip-backward" size={18} color={Colors.textSecondary} />
          </Pressable>

          <Pressable
            style={styles.transportButton}
            onPress={() => {
              selection();
              setCurrentTime(Math.max(loopStart, currentTime - 5));
            }}
          >
            <MaterialCommunityIcons name="rewind-5" size={18} color={Colors.textSecondary} />
          </Pressable>

          <Pressable style={styles.playButton} onPress={handlePlayPause}>
            <MaterialCommunityIcons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color={Colors.textPrimary}
            />
          </Pressable>

          <Pressable
            style={styles.transportButton}
            onPress={() => {
              selection();
              setCurrentTime(Math.min(effectiveEnd, currentTime + 5));
            }}
          >
            <MaterialCommunityIcons name="fast-forward-5" size={18} color={Colors.textSecondary} />
          </Pressable>

          <Pressable
            style={[styles.transportButton, loopEnabled && styles.transportButtonActive]}
            onPress={handleLoopToggle}
          >
            <Ionicons
              name="repeat"
              size={18}
              color={loopEnabled ? Colors.electricBlue : Colors.textSecondary}
            />
          </Pressable>
        </View>

        {/* Loop Point Controls */}
        {loopEnabled && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.loopPointsRow}>
            <Pressable style={styles.loopPointButton} onPress={handleSetLoopStart}>
              <MaterialCommunityIcons name="ray-start" size={14} color={Colors.success} />
              <View>
                <Text style={styles.loopPointLabel}>IN</Text>
                <Text style={styles.loopPointValue}>{formatTime(loopStart)}</Text>
              </View>
            </Pressable>

            <View style={styles.loopDuration}>
              <Text style={styles.loopDurationLabel}>LOOP</Text>
              <Text style={styles.loopDurationValue}>
                {formatTime(effectiveEnd - loopStart)}
              </Text>
            </View>

            <Pressable style={styles.loopPointButton} onPress={handleSetLoopEnd}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.loopPointLabel}>OUT</Text>
                <Text style={styles.loopPointValue}>{formatTime(effectiveEnd)}</Text>
              </View>
              <MaterialCommunityIcons name="ray-end" size={14} color={Colors.danger} />
            </Pressable>
          </Animated.View>
        )}
      </View>
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
    marginBottom: Spacing.md,
  },
  headerTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    flex: 1,
  },
  loopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.electricBlue + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
  },
  loopBadgeText: {
    color: Colors.electricBlue,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  panel: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  currentTime: {
    color: Colors.electricBlue,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  timeSeparator: {
    color: Colors.textTertiary,
    fontSize: FontSize.lg,
  },
  totalTime: {
    color: Colors.textTertiary,
    fontSize: FontSize.lg,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  progressBarContainer: {
    height: 32,
    justifyContent: 'center',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: Colors.surfaceLighter,
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  loopRegion: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    backgroundColor: Colors.electricBlue + '15',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '25',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.electricBlue,
    borderRadius: 2,
  },
  scrubber: {
    position: 'absolute',
    top: -6,
    marginLeft: -8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubberHandle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.electricBlue,
    borderWidth: 2,
    borderColor: Colors.textPrimary,
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  transportButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportButtonActive: {
    borderColor: Colors.electricBlue + '50',
    backgroundColor: Colors.electricBlue + '10',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.electricBlue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  loopPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  loopPointButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loopPointLabel: {
    color: Colors.textTertiary,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  loopPointValue: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  loopDuration: {
    alignItems: 'center',
    gap: 1,
  },
  loopDurationLabel: {
    color: Colors.textTertiary,
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  loopDurationValue: {
    color: Colors.electricBlue,
    fontSize: FontSize.sm,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
