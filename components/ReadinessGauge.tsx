import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';

type Props = {
  score: number; // 0-100
  label?: string;
  sublabel?: string;
};

function getScoreColor(score: number): string {
  if (score >= 80) return Colors.electricBlue;
  if (score >= 50) return Colors.warningAmber;
  return Colors.danger;
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'OPTIMAL';
  if (score >= 70) return 'READY';
  if (score >= 50) return 'PARTIAL';
  if (score >= 25) return 'LIMITED';
  return 'CRITICAL';
}

export default function ReadinessGauge({ score, label, sublabel }: Props) {
  const animatedScore = useSharedValue(0);
  const scanPulse = useSharedValue(0);
  const ringPulse = useSharedValue(1);

  const color = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);

  useEffect(() => {
    animatedScore.value = withTiming(score, {
      duration: 1500,
      easing: Easing.out(Easing.cubic),
    });

    if (score >= 80) {
      ringPulse.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }

    scanPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [score, animatedScore, scanPulse, ringPulse]);

  const ringPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringPulse.value }],
  }));

  const scanStyle = useAnimatedStyle(() => ({
    opacity: scanPulse.value * 0.5,
  }));

  // Create arc segments for the gauge
  const segments = 24;
  const filledSegments = Math.round((score / 100) * segments);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.gaugeOuter, ringPulseStyle]}>
        {/* Background ring segments */}
        <View style={styles.segmentContainer}>
          {Array.from({ length: segments }).map((_, i) => {
            const angle = (i / segments) * 360 - 90;
            const isFilled = i < filledSegments;
            const segColor = isFilled ? color : Colors.surfaceLighter;
            const segOpacity = isFilled ? 0.8 + (i / segments) * 0.2 : 0.4;

            return (
              <View
                key={i}
                style={[
                  styles.segment,
                  {
                    transform: [
                      { rotate: `${angle}deg` },
                      { translateY: -68 },
                    ],
                    backgroundColor: segColor,
                    opacity: segOpacity,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Outer glow ring */}
        <View
          style={[
            styles.outerGlowRing,
            {
              borderColor: color + '20',
              shadowColor: color,
            },
          ]}
        />

        {/* Inner content circle */}
        <View
          style={[
            styles.innerCircle,
            {
              borderColor: color + '30',
            },
          ]}
        >
          {/* Scan pulse */}
          <Animated.View
            style={[
              styles.scanPulse,
              scanStyle,
              { backgroundColor: color + '08' },
            ]}
          />

          <Text style={[styles.scoreValue, { color }]}>{score}</Text>
          <Text style={styles.scorePercent}>%</Text>
          <View
            style={[
              styles.scoreLabelBadge,
              { backgroundColor: color + '15', borderColor: color + '30' },
            ]}
          >
            <Text style={[styles.scoreLabelText, { color }]}>{scoreLabel}</Text>
          </View>
        </View>
      </Animated.View>

      {label && <Text style={styles.label}>{label}</Text>}
      {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  gaugeOuter: {
    width: 168,
    height: 168,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentContainer: {
    position: 'absolute',
    width: 168,
    height: 168,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: {
    position: 'absolute',
    width: 3,
    height: 10,
    borderRadius: 1.5,
  },
  outerGlowRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  innerCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  scanPulse: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 64,
  },
  scoreValue: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
  },
  scorePercent: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginTop: -4,
  },
  scoreLabelBadge: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  scoreLabelText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  label: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginTop: Spacing.lg,
    letterSpacing: 0.5,
  },
  sublabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
});
