import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { BorderRadius, Spacing, platformShadow } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  glow?: boolean;
  glowColor?: string;
};

export default function Card({ children, style, glow, glowColor }: Props) {
  const { colors, isDark, isPerformance } = useTheme();

  const glowStyle = useMemo(
    () =>
      glow && !isPerformance
        ? {
            borderColor: glowColor || colors.accentGlow,
            borderWidth: 1,
            ...platformShadow(glowColor || colors.accent, 4, 16, 0.2, 8),
          }
        : null,
    [glow, glowColor, isPerformance, colors]
  );

  const softShadow = useMemo(
    () =>
      !isPerformance
        ? platformShadow(colors.cardShadow, 2, 8, 0.5, 4)
        : null,
    [isPerformance, colors]
  );

  if (!isPerformance && Platform.OS !== 'web') {
    return (
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={40}
        style={[styles.card, softShadow, glowStyle, { borderColor: colors.border }, style]}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.surfaceCard, borderRadius: BorderRadius.card },
          ]}
        />
        <View
          style={[
            styles.innerHighlight,
            { borderColor: colors.innerHighlight },
          ]}
        />
        {children}
      </BlurView>
    );
  }

  return (
    <View
      style={[
        styles.card,
        softShadow,
        glowStyle,
        {
          backgroundColor: colors.surfaceCardSolid,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.card,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    borderRadius: BorderRadius.card,
  },
});
