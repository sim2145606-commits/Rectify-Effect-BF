import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { FontSize, Spacing, BorderRadius, platformShadow } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
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
  const { colors } = useTheme();
  const { lightImpact, mediumImpact } = useHaptics();

  return (
    <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="aspect-ratio" size={16} color={colors.electricBlue} />
        <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>SPAN & SCALE</Text>
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
        <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />
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
  const { colors } = useTheme();
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
        style={[
          styles.scaleModeCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
          isActive && {
            borderColor: colors.electricBlue + '60',
            backgroundColor: colors.electricBlue + '08',
            ...platformShadow(colors.electricBlue, 0, 8, 0.2, 4),
          },
        ]}
      >
        <View
          style={[
            styles.scaleModeIconCircle,
            { backgroundColor: colors.surfaceLight },
            isActive && { backgroundColor: colors.electricBlue + '20' },
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={20}
            color={isActive ? colors.electricBlue : colors.textTertiary}
          />
        </View>
        <Text
          style={[
            styles.scaleModeLabel,
            { color: colors.textSecondary },
            isActive && { color: colors.electricBlue },
          ]}
        >
          {label}
        </Text>
        <Text style={[styles.scaleModeDesc, { color: colors.textTertiary }]}>{description}</Text>
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
  const { colors } = useTheme();
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
        style={[
          styles.toggleButton,
          { backgroundColor: colors.surface, borderColor: colors.border },
          active && {
            borderColor: colors.electricBlue + '50',
            backgroundColor: colors.electricBlue + '08',
          },
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={active ? colors.electricBlue : colors.textTertiary}
        />
        <Text
          style={[
            styles.toggleLabel,
            { color: colors.textTertiary },
            active && { color: colors.electricBlue },
          ]}
        >
          {label}
        </Text>
        <View
          style={[
            styles.toggleIndicator,
            { backgroundColor: colors.inactive },
            active && {
              backgroundColor: colors.electricBlue,
              ...platformShadow(colors.electricBlue, 0, 4, 0.8, 3),
            },
          ]}
        />
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
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  scaleModeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  scaleModeLabel: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    letterSpacing: 1,
  },
  scaleModeDesc: {
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
  },
  toggleButton: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  toggleLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
    flex: 1,
  },
  toggleIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
