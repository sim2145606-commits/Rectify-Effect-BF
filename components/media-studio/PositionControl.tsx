import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, PanResponder } from 'react-native';
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

type Props = {
  offsetX: number;
  offsetY: number;
  onOffsetChange: (x: number, y: number) => void;
  onOffsetCommit?: (x: number, y: number) => void;
};

const GRID_SIZE = 160;
const MAX_OFFSET = 100;

export default function PositionControl({ offsetX, offsetY, onOffsetChange, onOffsetCommit }: Props) {
  const { colors } = useTheme();
  const { selection, mediumImpact, heavyImpact } = useHaptics();
  const lastOffsetRef = useRef({ x: offsetX, y: offsetY });

  useEffect(() => {
    lastOffsetRef.current = { x: offsetX, y: offsetY };
  }, [offsetX, offsetY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        selection();
      },
      onPanResponderMove: (_, gestureState) => {
        const normX = Math.max(
          -MAX_OFFSET,
          Math.min(MAX_OFFSET, Math.round((gestureState.dx / GRID_SIZE) * MAX_OFFSET * 2))
        );
        const normY = Math.max(
          -MAX_OFFSET,
          Math.min(MAX_OFFSET, Math.round((gestureState.dy / GRID_SIZE) * MAX_OFFSET * 2))
        );
        onOffsetChange(normX, normY);
        lastOffsetRef.current = { x: normX, y: normY };
      },
      onPanResponderRelease: () => {
        mediumImpact();
        onOffsetCommit?.(lastOffsetRef.current.x, lastOffsetRef.current.y);
      },
    })
  ).current;

  const handleNudge = useCallback(
    (dx: number, dy: number) => {
      selection();
      const newX = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, offsetX + dx));
      const newY = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, offsetY + dy));
      onOffsetChange(newX, newY);
      onOffsetCommit?.(newX, newY);
    },
    [offsetX, offsetY, onOffsetChange, onOffsetCommit, selection]
  );

  const handleReset = useCallback(() => {
    heavyImpact();
    onOffsetChange(0, 0);
    onOffsetCommit?.(0, 0);
  }, [onOffsetChange, onOffsetCommit, heavyImpact]);

  const indicatorX = useMemo(
    () => ((offsetX + MAX_OFFSET) / (MAX_OFFSET * 2)) * GRID_SIZE,
    [offsetX]
  );
  const indicatorY = useMemo(
    () => ((offsetY + MAX_OFFSET) / (MAX_OFFSET * 2)) * GRID_SIZE,
    [offsetY]
  );

  return (
    <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="cursor-move" size={16} color={colors.electricBlue} />
        <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>POSITION OFFSET</Text>
        <Text style={[styles.headerValue, { color: colors.electricBlue }]}>
          X:{offsetX} Y:{offsetY}
        </Text>
      </View>

      <View
        style={[
          styles.panel,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.contentRow}>
          {/* Drag-to-offset Grid */}
          <View style={styles.gridContainer}>
            <View
              style={[
                styles.grid,
                {
                  backgroundColor: colors.surfaceLight,
                  borderColor: colors.electricBlue + '20',
                },
              ]}
              {...panResponder.panHandlers}
            >
              {/* Grid lines */}
              <View style={[styles.gridLine, styles.gridLineH, { top: '25%', backgroundColor: colors.electricBlue + '08' }]} />
              <View style={[styles.gridLine, styles.gridLineH, { top: '50%', backgroundColor: colors.electricBlue + '08' }]} />
              <View style={[styles.gridLine, styles.gridLineH, { top: '75%', backgroundColor: colors.electricBlue + '08' }]} />
              <View style={[styles.gridLine, styles.gridLineV, { left: '25%', backgroundColor: colors.electricBlue + '08' }]} />
              <View style={[styles.gridLine, styles.gridLineV, { left: '50%', backgroundColor: colors.electricBlue + '08' }]} />
              <View style={[styles.gridLine, styles.gridLineV, { left: '75%', backgroundColor: colors.electricBlue + '08' }]} />

              {/* Center crosshair */}
              <View style={[styles.crosshairH, { backgroundColor: colors.electricBlue + '25' }]} />
              <View style={[styles.crosshairV, { backgroundColor: colors.electricBlue + '25' }]} />

              {/* Position indicator */}
              <View
                style={[
                  styles.indicator,
                  {
                    left: indicatorX - 8,
                    top: indicatorY - 8,
                    backgroundColor: colors.electricBlue + '30',
                    borderColor: colors.electricBlue,
                    ...platformShadow(colors.electricBlue, 0, 6, 0.6, 4),
                  },
                ]}
              >
                <View style={[styles.indicatorInner, { backgroundColor: colors.electricBlue }]} />
              </View>
            </View>
            <Text style={[styles.gridHint, { color: colors.textTertiary }]}>Drag to position</Text>
          </View>

          {/* Nudge buttons */}
          <View style={styles.nudgeControls}>
            <View style={styles.nudgeRow}>
              <NudgeButton icon="chevron-up" onPress={() => handleNudge(0, -10)} />
            </View>
            <View style={styles.nudgeRow}>
              <NudgeButton icon="chevron-left" onPress={() => handleNudge(-10, 0)} />
              <Pressable
                style={[
                  styles.nudgeCenter,
                  {
                    backgroundColor: colors.electricBlue + '15',
                    borderColor: colors.electricBlue + '40',
                  },
                ]}
                onPress={handleReset}
              >
                <MaterialCommunityIcons name="crosshairs" size={16} color={colors.electricBlue} />
              </Pressable>
              <NudgeButton icon="chevron-right" onPress={() => handleNudge(10, 0)} />
            </View>
            <View style={styles.nudgeRow}>
              <NudgeButton icon="chevron-down" onPress={() => handleNudge(0, 10)} />
            </View>
            <Text style={[styles.nudgeHint, { color: colors.textTertiary }]}>
              {offsetX === 0 && offsetY === 0 ? 'Centered' : `${offsetX}, ${offsetY}`}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const NudgeButton = React.memo(function NudgeButton({
  icon,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) {
  const { colors } = useTheme();
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
        style={[
          styles.nudgeButton,
          { backgroundColor: colors.surfaceLight, borderColor: colors.border },
        ]}
      >
        <MaterialCommunityIcons name={icon} size={18} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
});

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
  headerValue: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  panel: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
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
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
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
  },
  crosshairV: {
    position: 'absolute',
    left: '50%',
    top: '25%',
    bottom: '25%',
    width: 1,
  },
  indicator: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  gridHint: {
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeCenter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeHint: {
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
});
