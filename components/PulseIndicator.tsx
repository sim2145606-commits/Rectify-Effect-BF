import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  active: boolean;
  color?: string;
  size?: number;
};

export default function PulseIndicator({ active, color = '#00D4FF', size = 10 }: Props) {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 10;
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);

  useEffect(() => {
    if (!active) {
      scale.value = withTiming(1, { duration: 200 });
      opacity.value = withTiming(0.6, { duration: 200 });
      return;
    }

    scale.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      true
    );

    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.4, { duration: 800 })
      ),
      -1,
      true
    );
  }, [active]);

  const animStyle = useAnimatedStyle(() => ({
    width: safeSize,
    height: safeSize,
    borderRadius: safeSize / 2,
    backgroundColor: color,
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={animStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
