import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

type Props = {
  visible: boolean;
  size?: number;
  color?: string;
  glowColor?: string;
  onAnimationComplete?: () => void;
};

export default function SuccessAnimation({
  visible,
  size = 120,
  color = Colors.verifiedGreen,
  glowColor = Colors.verifiedGreenGlow,
  onAnimationComplete,
}: Props) {
  const circleScale = useSharedValue(0);
  const circleOpacity = useSharedValue(0);
  const checkProgress = useSharedValue(0);
  const glowScale = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const ring1Scale = useSharedValue(0);
  const ring1Opacity = useSharedValue(0);
  const ring2Scale = useSharedValue(0);
  const ring2Opacity = useSharedValue(0);
  const sparkle1 = useSharedValue(0);
  const sparkle2 = useSharedValue(0);
  const sparkle3 = useSharedValue(0);
  const sparkle4 = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Main circle pop
      circleScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      circleOpacity.value = withTiming(1, { duration: 200 });

      // Checkmark draw
      checkProgress.value = withDelay(200, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));

      // Glow burst
      glowScale.value = withDelay(100, withSequence(
        withTiming(1.8, { duration: 400, easing: Easing.out(Easing.ease) }),
        withTiming(1.2, { duration: 300 })
      ));
      glowOpacity.value = withDelay(100, withSequence(
        withTiming(0.8, { duration: 200 }),
        withTiming(0.3, { duration: 500 })
      ));

      // Ring 1 explosion
      ring1Scale.value = withDelay(150, withTiming(2.5, { duration: 600, easing: Easing.out(Easing.ease) }));
      ring1Opacity.value = withDelay(150, withSequence(
        withTiming(0.7, { duration: 150 }),
        withTiming(0, { duration: 450 })
      ));

      // Ring 2 explosion
      ring2Scale.value = withDelay(300, withTiming(3, { duration: 700, easing: Easing.out(Easing.ease) }));
      ring2Opacity.value = withDelay(300, withSequence(
        withTiming(0.5, { duration: 150 }),
        withTiming(0, { duration: 550 })
      ));

      // Sparkle particles
      sparkle1.value = withDelay(250, withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 400 })
      ));
      sparkle2.value = withDelay(350, withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 400 })
      ));
      sparkle3.value = withDelay(450, withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 400 })
      ));
      sparkle4.value = withDelay(550, withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      ));

      if (onAnimationComplete) {
        setTimeout(() => {
          runOnJS(onAnimationComplete)();
        }, 1200);
      }
    } else {
      circleScale.value = withTiming(0, { duration: 200 });
      circleOpacity.value = withTiming(0, { duration: 200 });
      checkProgress.value = 0;
      glowScale.value = 0;
      glowOpacity.value = 0;
      ring1Scale.value = 0;
      ring1Opacity.value = 0;
      ring2Scale.value = 0;
      ring2Opacity.value = 0;
      sparkle1.value = 0;
      sparkle2.value = 0;
      sparkle3.value = 0;
      sparkle4.value = 0;
    }
  }, [visible, circleScale, circleOpacity, checkProgress, glowScale, glowOpacity, ring1Scale, ring1Opacity, ring2Scale, ring2Opacity, sparkle1, sparkle2, sparkle3, sparkle4, onAnimationComplete]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: circleScale.value }],
    opacity: circleOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value }],
    opacity: ring1Opacity.value,
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));

  const sparkle1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(0.5) * size * 0.7 * sparkle1.value },
      { translateY: Math.sin(0.5) * size * 0.7 * sparkle1.value },
      { scale: sparkle1.value },
    ],
    opacity: sparkle1.value,
  }));

  const sparkle2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(2.1) * size * 0.7 * sparkle2.value },
      { translateY: Math.sin(2.1) * size * 0.7 * sparkle2.value },
      { scale: sparkle2.value },
    ],
    opacity: sparkle2.value,
  }));

  const sparkle3Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(3.7) * size * 0.7 * sparkle3.value },
      { translateY: Math.sin(3.7) * size * 0.7 * sparkle3.value },
      { scale: sparkle3.value },
    ],
    opacity: sparkle3.value,
  }));

  const sparkle4Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(5.3) * size * 0.7 * sparkle4.value },
      { translateY: Math.sin(5.3) * size * 0.7 * sparkle4.value },
      { scale: sparkle4.value },
    ],
    opacity: sparkle4.value,
  }));

  if (!visible) return null;

  const halfSize = size / 2;

  return (
    <View style={[styles.container, { width: size * 3, height: size * 3 }]}>
      {/* Glow background */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: size,
            height: size,
            borderRadius: halfSize,
            backgroundColor: glowColor,
          },
          glowStyle,
        ]}
      />

      {/* Ring explosions */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: halfSize,
            borderColor: color,
          },
          ring1Style,
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: halfSize,
            borderColor: Colors.gold,
          },
          ring2Style,
        ]}
      />

      {/* Main circle */}
      <Animated.View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: halfSize,
            backgroundColor: color,
            shadowColor: color,
          },
          circleStyle,
        ]}
      >
        {/* Checkmark SVG approximation using Views */}
        <View style={[styles.checkContainer, { width: size * 0.45, height: size * 0.35 }]}>
          <View
            style={[
              styles.checkShort,
              {
                width: size * 0.15,
                height: 3,
                backgroundColor: '#FFFFFF',
                transform: [{ rotate: '45deg' }],
              },
            ]}
          />
          <View
            style={[
              styles.checkLong,
              {
                width: size * 0.3,
                height: 3,
                backgroundColor: '#FFFFFF',
                transform: [{ rotate: '-45deg' }],
              },
            ]}
          />
        </View>
      </Animated.View>

      {/* Sparkle particles */}
      <Animated.View style={[styles.sparkle, { backgroundColor: Colors.gold }, sparkle1Style]} />
      <Animated.View style={[styles.sparkle, { backgroundColor: color }, sparkle2Style]} />
      <Animated.View style={[styles.sparkle, { backgroundColor: Colors.gold }, sparkle3Style]} />
      <Animated.View style={[styles.sparkle, { backgroundColor: color }, sparkle4Style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  checkContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkShort: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    borderRadius: 2,
  },
  checkLong: {
    position: 'absolute',
    right: 0,
    bottom: 3,
    borderRadius: 2,
  },
  sparkle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
