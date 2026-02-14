import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Alert } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeInDown,
  FadeIn,
  SlideInRight,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';

type Props = {
  engineActive: boolean;
  onEngineToggle: (active: boolean) => void;
  rotation: number;
  scaleMode: string;
  selectedMedia: string | null;
  onQuickPreset?: (preset: string) => void;
};

export default function EngineOverlay({
  engineActive,
  onEngineToggle,
  rotation,
  scaleMode,
  selectedMedia,
  onQuickPreset,
}: Props) {
  const { mediumImpact, heavyImpact, success, warning } = useHaptics();
  const [floatingBubble, setFloatingBubble] = useStorage(STORAGE_KEYS.FLOATING_BUBBLE, false);
  const [showBubblePreview, setShowBubblePreview] = useState(false);

  // Engine pulse
  const enginePulse = useSharedValue(1);
  useEffect(() => {
    if (engineActive) {
      enginePulse.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        true
      );
    } else {
      enginePulse.value = 1;
    }
  }, [engineActive, enginePulse]);

  const enginePulseStyle = useAnimatedStyle(() => ({
    opacity: enginePulse.value,
  }));

  const handleEngineToggle = useCallback(() => {
    if (!selectedMedia && !engineActive) {
      Alert.alert(
        'No Media Selected',
        'Please select media from the Library tab before activating the engine.'
      );
      warning();
      return;
    }
    heavyImpact();
    onEngineToggle(!engineActive);
    if (!engineActive) {
      success();
    }
  }, [engineActive, selectedMedia, onEngineToggle, heavyImpact, success, warning]);

  const handleFloatingBubble = useCallback(() => {
    mediumImpact();
    if (Platform.OS === 'android') {
      setFloatingBubble(!floatingBubble);
      setShowBubblePreview(!floatingBubble);
    } else {
      Alert.alert(
        'Android Only',
        'The Floating Live Bubble overlay is available on Android devices only.'
      );
    }
  }, [floatingBubble, setFloatingBubble, mediumImpact]);

  return (
    <Animated.View entering={FadeInDown.delay(700).duration(500)} style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="cellphone-link" size={16} color={Colors.electricBlue} />
        <Text style={styles.headerTitle}>ANDROID INTEGRATION</Text>
      </View>

      {/* Engine Control */}
      <View style={styles.engineCard}>
        <LinearGradient
          colors={engineActive
            ? [Colors.electricBlue + '15', Colors.surface]
            : [Colors.surface, Colors.surface]
          }
          style={styles.engineGradient}
        >
          <View style={styles.engineHeader}>
            <Animated.View style={[styles.engineIndicator, enginePulseStyle]}>
              <View style={[
                styles.engineDot,
                { backgroundColor: engineActive ? Colors.success : Colors.inactive },
              ]} />
            </Animated.View>
            <View style={styles.engineInfo}>
              <Text style={styles.engineTitle}>
                Injection Engine
              </Text>
              <Text style={styles.engineStatus}>
                {engineActive ? 'Active — Feed is being injected' : 'Inactive — Tap to start'}
              </Text>
            </View>
            <Pressable
              style={[
                styles.engineToggleButton,
                engineActive && styles.engineToggleButtonActive,
              ]}
              onPress={handleEngineToggle}
            >
              <MaterialCommunityIcons
                name={engineActive ? 'stop-circle-outline' : 'play-circle-outline'}
                size={20}
                color={engineActive ? Colors.danger : Colors.electricBlue}
              />
              <Text style={[
                styles.engineToggleText,
                { color: engineActive ? Colors.danger : Colors.electricBlue },
              ]}>
                {engineActive ? 'STOP' : 'START'}
              </Text>
            </Pressable>
          </View>

          {/* Active Stats */}
          {engineActive && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.activeStats}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>STATUS</Text>
                <Text style={[styles.statValue, { color: Colors.success }]}>INJECTING</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>ROTATION</Text>
                <Text style={styles.statValue}>{rotation}{'°'}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>SCALE</Text>
                <Text style={styles.statValue}>{scaleMode.toUpperCase()}</Text>
              </View>
            </Animated.View>
          )}
        </LinearGradient>
      </View>

      {/* System Notification */}
      <View style={styles.notificationCard}>
        <View style={styles.notificationHeader}>
          <View style={styles.notificationIcon}>
            <Ionicons name="notifications" size={16} color={Colors.textSecondary} />
          </View>
          <View style={styles.notificationInfo}>
            <Text style={styles.notificationTitle}>Persistent Notification</Text>
            <Text style={styles.notificationDesc}>
              {engineActive
                ? 'System notification active with quick controls'
                : 'Appears when engine is active'}
            </Text>
          </View>
          <View style={[
            styles.notificationStatus,
            { backgroundColor: engineActive ? Colors.success + '20' : Colors.inactive + '20' },
          ]}>
            <View style={[
              styles.notificationStatusDot,
              { backgroundColor: engineActive ? Colors.success : Colors.inactive },
            ]} />
          </View>
        </View>

        {/* Notification Preview */}
        {engineActive && (
          <Animated.View entering={SlideInRight.duration(400)} style={styles.notificationPreview}>
            <View style={styles.notifPreviewHeader}>
              <Ionicons name="camera" size={12} color={Colors.electricBlue} />
              <Text style={styles.notifPreviewApp}>VirtuCam</Text>
              <Text style={styles.notifPreviewTime}>now</Text>
            </View>
            <Text style={styles.notifPreviewTitle}>Feed injection active</Text>
            <Text style={styles.notifPreviewBody}>
              {rotation}{'°'} rotation • {scaleMode} mode
            </Text>
            <View style={styles.notifPreviewActions}>
              <View style={styles.notifAction}>
                <Text style={styles.notifActionText}>STOP</Text>
              </View>
              <View style={styles.notifAction}>
                <Text style={styles.notifActionText}>SWITCH PRESET</Text>
              </View>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Floating Bubble */}
      <Pressable style={styles.bubbleCard} onPress={handleFloatingBubble}>
        <View style={styles.bubbleHeader}>
          <View style={styles.bubbleIconContainer}>
            <MaterialCommunityIcons
              name="picture-in-picture-top-right"
              size={20}
              color={floatingBubble ? Colors.electricBlue : Colors.textTertiary}
            />
          </View>
          <View style={styles.bubbleInfo}>
            <Text style={styles.bubbleTitle}>Floating Live Bubble</Text>
            <Text style={styles.bubbleDesc}>
              Stays on top of other apps{Platform.OS !== 'android' ? ' (Android only)' : ''}
            </Text>
          </View>
          <View style={[styles.featureToggle, floatingBubble && { backgroundColor: Colors.electricBlue }]}>
            <View style={[styles.featureToggleKnob, floatingBubble && styles.featureToggleKnobActive]} />
          </View>
        </View>

        {/* Bubble Preview */}
        {showBubblePreview && floatingBubble && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.bubblePreview}>
            <View style={styles.bubblePreviewWindow}>
              <View style={styles.bubblePreviewFrame}>
                <Ionicons name="videocam" size={16} color={Colors.electricBlue} />
                <Text style={styles.bubblePreviewLabel}>LIVE</Text>
              </View>
              <View style={styles.bubblePreviewControls}>
                <View style={styles.miniControlDot} />
                <View style={[styles.miniControlDot, { backgroundColor: Colors.electricBlue }]} />
                <View style={styles.miniControlDot} />
              </View>
            </View>
            <Text style={styles.bubblePreviewHint}>
              Quick-access to rotation & span controls
            </Text>
          </Animated.View>
        )}
      </Pressable>

      {/* Quick Presets */}
      {engineActive && (
        <Animated.View entering={FadeInDown.duration(300)} style={styles.quickPresetsRow}>
          <Text style={styles.quickPresetsLabel}>QUICK SWITCH</Text>
          <View style={styles.quickPresetButtons}>
            {['Default', 'Mirror', 'Portrait', 'Cinematic'].map((preset) => (
              <Pressable
                key={preset}
                style={styles.quickPresetButton}
                onPress={() => {
                  mediumImpact();
                  onQuickPreset?.(preset.toLowerCase());
                }}
              >
                <Text style={styles.quickPresetText}>{preset}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}
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
  // Engine
  engineCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  engineGradient: {
    padding: Spacing.lg,
  },
  engineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  engineIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  engineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  engineInfo: {
    flex: 1,
    gap: 2,
  },
  engineTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  engineStatus: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
  },
  engineToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.electricBlue + '15',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
  },
  engineToggleButtonActive: {
    backgroundColor: Colors.danger + '15',
    borderColor: Colors.danger + '30',
  },
  engineToggleText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeStats: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statValue: {
    color: Colors.electricBlue,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  // Notification
  notificationCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  notificationIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationInfo: {
    flex: 1,
    gap: 2,
  },
  notificationTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  notificationDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
  },
  notificationStatus: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notificationPreview: {
    marginTop: Spacing.md,
    backgroundColor: '#1a1a24',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notifPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  notifPreviewApp: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    flex: 1,
  },
  notifPreviewTime: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
  },
  notifPreviewTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  notifPreviewBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  notifPreviewActions: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  notifAction: {
    paddingVertical: 2,
  },
  notifActionText: {
    color: Colors.electricBlue,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // Floating Bubble
  bubbleCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  bubbleIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleInfo: {
    flex: 1,
    gap: 2,
  },
  bubbleTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  bubbleDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
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
  bubblePreview: {
    marginTop: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bubblePreviewWindow: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.electricBlue + '40',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  bubblePreviewFrame: {
    alignItems: 'center',
    gap: 2,
  },
  bubblePreviewLabel: {
    color: Colors.electricBlue,
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bubblePreviewControls: {
    position: 'absolute',
    bottom: -4,
    flexDirection: 'row',
    gap: 4,
  },
  miniControlDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceLighter,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubblePreviewHint: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
  // Quick Presets
  quickPresetsRow: {
    marginTop: Spacing.xs,
  },
  quickPresetsLabel: {
    color: Colors.textTertiary,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  quickPresetButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  quickPresetButton: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  quickPresetText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
