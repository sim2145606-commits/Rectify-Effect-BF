import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, PanResponder } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';

type Props = {
  offsetX: number;
  offsetY: number;
  onOffsetChange: (x: number, y: number) => void;
};

const GRID_SIZE = 160;
const MAX_OFFSET = 100;

export default function PositionControl({ offsetX, offsetY, onOffsetChange }: Props) {
  const { selection, mediumImpact, heavyImpact } = useHaptics();

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        selection();
      },
      onPanResponderMove: (_, gestureState) => {
        // Normalize to -100..100 range based on grid drag distance
        const normX = Math.max(
          -MAX_OFFSET,
          Math.min(MAX_OFFSET, Math.round((gestureState.dx / GRID_SIZE) * MAX_OFFSET * 2))
        );
        const normY = Math.max(
          -MAX_OFFSET,
          Math.min(MAX_OFFSET, Math.round((gestureState.dy / GRID_SIZE) * MAX_OFFSET * 2))
        );
        onOffsetChange(normX, normY);
      },
      onPanResponderRelease: () => {
        mediumImpact();
      },
    })
  ).current;

  const handleNudge = useCallback(
    (dx: number, dy: number) => {
      selection();
      const newX = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, offsetX + dx));
      const newY = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, offsetY + dy));
      onOffsetChange(newX, newY);
    },
    [offsetX, offsetY, onOffsetChange, selection]
  );

  const handleReset = useCallback(() => {
    heavyImpact();
    onOffsetChange(0, 0);
  }, [onOffsetChange, heavyImpact]);

  // Indicator position on grid
  const indicatorX = ((offsetX + MAX_OFFSET) / (MAX_OFFSET * 2)) * GRID_SIZE;
  const indicatorY = ((offsetY + MAX_OFFSET) / (MAX_OFFSET * 2)) * GRID_SIZE;

  return (
    <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="cursor-move" size={16} color={Colors.electricBlue} />
        <Text style={styles.headerTitle}>POSITION OFFSET</Text>
        <Text style={styles.headerValue}>
          X:{offsetX} Y:{offsetY}
        </Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.contentRow}>
          {/* Drag-to-offset Grid */}
          <View style={styles.gridContainer}>
            <View style={styles.grid} {...panResponder.panHandlers}>
              {/* Grid lines */}
              <View style={[styles.gridLine, styles.gridLineH, { top: '25%' }]} />
              <View style={[styles.gridLine, styles.gridLineH, { top: '50%' }]} />
              <View style={[styles.gridLine, styles.gridLineH, { top: '75%' }]} />
              <View style={[styles.gridLine, styles.gridLineV, { left: '25%' }]} />
              <View style={[styles.gridLine, styles.gridLineV, { left: '50%' }]} />
              <View style={[styles.gridLine, styles.gridLineV, { left: '75%' }]} />

              {/* Center crosshair */}
              <View style={styles.crosshairH} />
              <View style={styles.crosshairV} />

              {/* Position indicator */}
              <View
                style={[
                  styles.indicator,
                  {
                    left: indicatorX - 8,
                    top: indicatorY - 8,
                  },
                ]}
              >
                <View style={styles.indicatorInner} />
              </View>
            </View>
            <Text style={styles.gridHint}>Drag to position</Text>
          </View>

          {/* Nudge buttons */}
          <View style={styles.nudgeControls}>
            <View style={styles.nudgeRow}>
              <NudgeButton icon="chevron-up" onPress={() => handleNudge(0, -10)} />
            </View>
            <View style={styles.nudgeRow}>
              <NudgeButton icon="chevron-left" onPress={() => handleNudge(-10, 0)} />
              <Pressable style={styles.nudgeCenter} onPress={handleReset}>
                <MaterialCommunityIcons name="crosshairs" size={16} color={Colors.electricBlue} />
              </Pressable>
              <NudgeButton icon="chevron-right" onPress={() => handleNudge(10, 0)} />
            </View>
            <View style={styles.nudgeRow}>
              <NudgeButton icon="chevron-down" onPress={() => handleNudge(0, 10)} />
            </View>
            <Text style={styles.nudgeHint}>
              {offsetX === 0 && offsetY === 0 ? 'Centered' : `${offsetX}, ${offsetY}`}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function NudgeButton({
  icon,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.85);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        onPress={onPress}
        style={styles.nudgeButton}
      >
        <MaterialCommunityIcons name={icon} size={18} color={Colors.textSecondary} />
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
    fontSize: FontSize.xs,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  panel: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  contentRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    alignItems: 'center',
  },
  gridContainer: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  grid: {
    width: GRID_SIZE,
    height: GRID_SIZE,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '20',
    overflow: 'hidden',
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: Colors.electricBlue + '08',
  },
  gridLineH: {
    left: 0,
    right: 0,
    height: 0.5,
  },
  gridLineV: {
    top: 0,
    bottom: 0,
    width: 0.5,
  },
  crosshairH: {
    position: 'absolute',
    top: '50%',
    left: '25%',
    right: '25%',
    height: 1,
    backgroundColor: Colors.electricBlue + '25',
  },
  crosshairV: {
    position: 'absolute',
    left: '50%',
    top: '25%',
    bottom: '25%',
    width: 1,
    backgroundColor: Colors.electricBlue + '25',
  },
  indicator: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.electricBlue + '30',
    borderWidth: 2,
    borderColor: Colors.electricBlue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  indicatorInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.electricBlue,
  },
  gridHint: {
    color: Colors.textTertiary,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  nudgeControls: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  nudgeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeCenter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.electricBlue + '15',
    borderWidth: 1,
    borderColor: Colors.electricBlue + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeHint: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
});
