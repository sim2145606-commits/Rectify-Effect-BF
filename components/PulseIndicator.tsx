import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type Props = {
  active: boolean;
  color?: string;
  size?: number;
};

export default function PulseIndicator({ active, color = '#00D4FF', size = 10 }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      opacity.setValue(0.6);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.25, duration: 800, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );

    const fade = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );

    loop.start();
    fade.start();

    return () => {
      loop.stop();
      fade.stop();
    };
  }, [active, opacity, scale]);

  const dotStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
    transform: [{ scale }],
    opacity,
  };

  return (
    <View style={styles.container}>
      <Animated.View style={dotStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
