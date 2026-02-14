import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Colors, FontSize, Spacing } from '@/constants/theme';

type Props = {
  label: string;
  detail: string;
  status: 'active' | 'warning' | 'inactive' | 'checking';
  icon: React.ReactNode;
  size?: number;
};

const STATUS_COLORS = {
  active: Colors.electricBlue,
  warning: Colors.warningAmber,
  inactive: Colors.danger,
  checking: Colors.textTertiary,
};

export default function StatusRing({
  label,
  detail,
  status,
  icon,
  size = 80,
}: Props) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.4);
  const ringRotation = useSharedValue(0);

  const color = STATUS_COLORS[status];

  useEffect(() => {
    if (status === 'active') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1200, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1200 }),
          withTiming(0.2, { duration: 1200 })
        ),
        -1,
        false
      );
    } else if (status === 'checking') {
      ringRotation.value = withRepeat(
        withTiming(360, { duration: 2000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(0, { duration: 300 });
      ringRotation.value = withTiming(0, { duration: 300 });
    }
  }, [status, pulseScale, pulseOpacity, ringRotation]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotation.value}deg` }],
  }));

  return (
    <View style={styles.container}>
      <View style={[styles.ringOuter, { width: size, height: size }]}>
        {/* Pulse glow */}
        {status === 'active' && (
          <Animated.View
            style={[
              styles.pulseGlow,
              pulseStyle,
              {
                width: size + 16,
                height: size + 16,
                borderRadius: (size + 16) / 2,
                backgroundColor: color + '15',
                borderColor: color + '30',
              },
            ]}
          />
        )}

        {/* Outer ring */}
        <Animated.View
          style={[
            styles.ring,
            ringStyle,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: status === 'checking' ? Colors.textTertiary + '40' : color + '50',
              borderTopColor: color,
              borderRightColor: status === 'active' ? color : color + '30',
            },
          ]}
        />

        {/* Inner circle */}
        <View
          style={[
            styles.innerCircle,
            {
              width: size - 16,
              height: size - 16,
              borderRadius: (size - 16) / 2,
              backgroundColor: color + '10',
              borderColor: color + '20',
            },
          ]}
        >
          {icon}
        </View>
      </View>

      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={[styles.detail, { color }]} numberOfLines={1}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    minWidth: 90,
  },
  ringOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  pulseGlow: {
    position: 'absolute',
    borderWidth: 1,
  },
  ring: {
    position: 'absolute',
    borderWidth: 2.5,
  },
  innerCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  detail: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
    textAlign: 'center',
  },
});
