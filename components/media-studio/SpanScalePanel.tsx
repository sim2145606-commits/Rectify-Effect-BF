import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';

type ScaleMode = 'fit' | 'fill' | 'stretch';

type Props = {
  scaleMode: ScaleMode;
  mirrored: boolean;
  flippedVertical: boolean;
  onScaleModeChange: (mode: ScaleMode) => void;
  onMirrorToggle: () => void;
  onFlipToggle: () => void;
};

const SCALE_MODES: {
  mode: ScaleMode;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { mode: 'fit', label: 'FIT', description: 'Letterbox', icon: 'fit-to-screen-outline' },
  { mode: 'fill', label: 'FILL', description: 'Crop to frame', icon: 'arrow-expand-all' },
  {
    mode: 'stretch',
    label: 'STRETCH',
    description: 'Distort to fit',
    icon: 'stretch-to-page-outline',
  },
];

export default function SpanScalePanel({
  scaleMode,
  mirrored,
  flippedVertical,
  onScaleModeChange,
  onMirrorToggle,
  onFlipToggle,
}: Props) {
  const { lightImpact, mediumImpact } = useHaptics();

  return (
    <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="aspect-ratio" size={16} color={Colors.electricBlue} />
        <Text style={styles.headerTitle}>SPAN & SCALE</Text>
      </View>

      {/* Scale Mode Cards */}
      <View style={styles.scaleRow}>
        {SCALE_MODES.map(({ mode, label, description, icon }) => (
          <ScaleModeCard
            key={mode}
            mode={mode}
            label={label}
            description={description}
            icon={icon}
            isActive={scaleMode === mode}
            onPress={() => {
              lightImpact();
              onScaleModeChange(mode);
            }}
          />
        ))}
      </View>

      {/* Mirror / Flip Toggles */}
      <View style={styles.toggleRow}>
        <AxisToggle
          icon="flip-horizontal"
          label="MIRROR H"
          active={mirrored}
          onPress={() => {
            mediumImpact();
            onMirrorToggle();
          }}
        />
        <View style={styles.toggleDivider} />
        <AxisToggle
          icon="flip-vertical"
          label="FLIP V"
          active={flippedVertical}
          onPress={() => {
            mediumImpact();
            onFlipToggle();
          }}
        />
      </View>
    </Animated.View>
  );
}

function ScaleModeCard({
  mode,
  label,
  description,
  icon,
  isActive,
  onPress,
}: {
  mode: ScaleMode;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  isActive: boolean;
  onPress: () => void;
}) {
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
        onPress={onPress}
        style={[styles.scaleModeCard, isActive && styles.scaleModeCardActive]}
      >
        <View style={[styles.scaleModeIconCircle, isActive && styles.scaleModeIconCircleActive]}>
          <MaterialCommunityIcons
            name={icon}
            size={20}
            color={isActive ? Colors.electricBlue : Colors.textTertiary}
          />
        </View>
        <Text style={[styles.scaleModeLabel, isActive && styles.scaleModeLabelActive]}>
          {label}
        </Text>
        <Text style={styles.scaleModeDesc}>{description}</Text>
      </Pressable>
    </Animated.View>
  );
}

function AxisToggle({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.toggleWrapper, animStyle]}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.95);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        onPress={onPress}
        style={[styles.toggleButton, active && styles.toggleButtonActive]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={active ? Colors.electricBlue : Colors.textTertiary}
        />
        <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{label}</Text>
        <View style={[styles.toggleIndicator, active && styles.toggleIndicatorActive]} />
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
  scaleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  scaleModeWrapper: {
    flex: 1,
  },
  scaleModeCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  scaleModeCardActive: {
    borderColor: Colors.electricBlue + '60',
    backgroundColor: Colors.electricBlue + '08',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  scaleModeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  scaleModeIconCircleActive: {
    backgroundColor: Colors.electricBlue + '20',
  },
  scaleModeLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '800',
    letterSpacing: 1,
  },
  scaleModeLabelActive: {
    color: Colors.electricBlue,
  },
  scaleModeDesc: {
    color: Colors.textTertiary,
    fontSize: 9,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  toggleWrapper: {
    flex: 1,
  },
  toggleDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  toggleButton: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  toggleButtonActive: {
    borderColor: Colors.electricBlue + '50',
    backgroundColor: Colors.electricBlue + '08',
  },
  toggleLabel: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
    flex: 1,
  },
  toggleLabelActive: {
    color: Colors.electricBlue,
  },
  toggleIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.inactive,
  },
  toggleIndicatorActive: {
    backgroundColor: Colors.electricBlue,
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
});
