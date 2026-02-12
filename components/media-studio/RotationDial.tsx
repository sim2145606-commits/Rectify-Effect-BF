import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';

const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const MAJOR_ANGLES = [0, 90, 180, 270];

type Props = {
  rotation: number;
  onRotationChange: (angle: number) => void;
};

export default function RotationDial({ rotation, onRotationChange }: Props) {
  const { mediumImpact, heavyImpact, selection } = useHaptics();

  const handleSnapAngle = useCallback((angle: number) => {
    if (MAJOR_ANGLES.includes(angle)) {
      heavyImpact();
    } else {
      mediumImpact();
    }
    onRotationChange(angle);
  }, [onRotationChange, heavyImpact, mediumImpact]);

  const handleIncrement = useCallback((amount: number) => {
    selection();
    const newAngle = ((rotation + amount) % 360 + 360) % 360;
    // Snap to nearest angle if close
    const nearest = SNAP_ANGLES.reduce((prev, curr) =>
      Math.abs(curr - newAngle) < Math.abs(prev - newAngle) ? curr : prev
    );
    if (Math.abs(nearest - newAngle) <= 5) {
      if (MAJOR_ANGLES.includes(nearest)) heavyImpact();
      onRotationChange(nearest);
    } else {
      onRotationChange(newAngle);
    }
  }, [rotation, onRotationChange, selection, heavyImpact]);

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="rotate-3d-variant" size={16} color={Colors.electricBlue} />
        <Text style={styles.headerTitle}>THE TRANSFORMER</Text>
        <Text style={styles.headerValue}>{rotation}{'°'}</Text>
      </View>

      <View style={styles.dialContainer}>
        {/* Central display */}
        <View style={styles.dialCenter}>
          <LinearGradient
            colors={[Colors.electricBlue + '10', 'transparent']}
            style={styles.dialCenterGradient}
          >
            <Text style={styles.dialDegree}>{rotation}{'°'}</Text>
            <Text style={styles.dialSubtext}>ROTATION</Text>
          </LinearGradient>
        </View>

        {/* Snap angle buttons in a ring */}
        <View style={styles.angleRing}>
          {SNAP_ANGLES.map((angle) => {
            const isActive = rotation === angle;
            const isMajor = MAJOR_ANGLES.includes(angle);
            // Calculate position on circle
            const radians = ((angle - 90) * Math.PI) / 180;
            const radius = 88;
            const x = Math.cos(radians) * radius;
            const y = Math.sin(radians) * radius;

            return (
              <AngleButton
                key={angle}
                angle={angle}
                isActive={isActive}
                isMajor={isMajor}
                x={x}
                y={y}
                onPress={handleSnapAngle}
              />
            );
          })}
        </View>

        {/* Fine-tune buttons */}
        <View style={styles.fineTuneRow}>
          <Pressable
            style={styles.fineTuneButton}
            onPress={() => handleIncrement(-1)}
          >
            <MaterialCommunityIcons name="minus" size={16} color={Colors.electricBlue} />
            <Text style={styles.fineTuneLabel}>-1{'°'}</Text>
          </Pressable>
          <Pressable
            style={styles.fineTuneButton}
            onPress={() => handleIncrement(-15)}
          >
            <MaterialCommunityIcons name="chevron-double-left" size={16} color={Colors.textSecondary} />
            <Text style={styles.fineTuneLabel}>-15{'°'}</Text>
          </Pressable>
          <Pressable
            style={[styles.fineTuneButton, styles.resetButton]}
            onPress={() => {
              heavyImpact();
              onRotationChange(0);
            }}
          >
            <MaterialCommunityIcons name="restore" size={16} color={Colors.textPrimary} />
            <Text style={[styles.fineTuneLabel, { color: Colors.textPrimary }]}>0{'°'}</Text>
          </Pressable>
          <Pressable
            style={styles.fineTuneButton}
            onPress={() => handleIncrement(15)}
          >
            <Text style={styles.fineTuneLabel}>+15{'°'}</Text>
            <MaterialCommunityIcons name="chevron-double-right" size={16} color={Colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.fineTuneButton}
            onPress={() => handleIncrement(1)}
          >
            <Text style={styles.fineTuneLabel}>+1{'°'}</Text>
            <MaterialCommunityIcons name="plus" size={16} color={Colors.electricBlue} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

function AngleButton({
  angle,
  isActive,
  isMajor,
  x,
  y,
  onPress,
}: {
  angle: number;
  isActive: boolean;
  isMajor: boolean;
  x: number;
  y: number;
  onPress: (angle: number) => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const size = isMajor ? 36 : 28;

  return (
    <Animated.View
      style={[
        styles.angleButtonPos,
        animStyle,
        {
          left: 88 + x - size / 2,
          top: 88 + y - size / 2,
          width: size,
          height: size,
        },
      ]}
    >
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.85); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={() => onPress(angle)}
        style={[
          styles.angleButton,
          isMajor && styles.angleButtonMajor,
          isActive && styles.angleButtonActive,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Text
          style={[
            styles.angleButtonText,
            isMajor && styles.angleButtonTextMajor,
            isActive && styles.angleButtonTextActive,
          ]}
        >
          {angle}
        </Text>
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
  headerValue: {
    color: Colors.electricBlue,
    fontSize: FontSize.sm,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  dialContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: 'center',
    overflow: 'hidden',
  },
  dialCenter: {
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '20',
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  dialCenterGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialDegree: {
    color: Colors.electricBlue,
    fontSize: FontSize.display,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  dialSubtext: {
    color: Colors.textTertiary,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 2,
  },
  angleRing: {
    position: 'absolute',
    top: Spacing.lg,
    left: '50%',
    marginLeft: -88,
    width: 176,
    height: 176,
  },
  angleButtonPos: {
    position: 'absolute',
  },
  angleButton: {
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  angleButtonMajor: {
    backgroundColor: Colors.surfaceLighter,
    borderColor: Colors.electricBlue + '30',
  },
  angleButtonActive: {
    backgroundColor: Colors.electricBlue + '25',
    borderColor: Colors.electricBlue,
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  angleButtonText: {
    color: Colors.textTertiary,
    fontSize: 8,
    fontWeight: '700',
  },
  angleButtonTextMajor: {
    color: Colors.textSecondary,
    fontSize: 9,
  },
  angleButtonTextActive: {
    color: Colors.electricBlue,
  },
  fineTuneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  fineTuneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resetButton: {
    backgroundColor: Colors.electricBlue + '20',
    borderColor: Colors.electricBlue + '40',
  },
  fineTuneLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
