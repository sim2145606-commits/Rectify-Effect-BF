import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  glow?: boolean;
  glowColor?: string;
};

export default function Card({ children, style, glow, glowColor }: Props) {
  const glowStyle = useMemo(
    () =>
      glow
        ? {
            borderColor: glowColor || Colors.accentGlow,
            borderWidth: 1,
            shadowColor: glowColor || Colors.accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 8,
          }
        : null,
    [glow, glowColor]
  );

  return (
    <View style={[styles.card, glowStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
