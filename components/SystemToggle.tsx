import React from 'react';
import { View, Text, StyleSheet, Pressable, Switch, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  label: string;
  sublabel?: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
  icon?: React.ReactNode;
  accentColor?: string;
  size?: 'default' | 'large';
};

export default function SystemToggle({
  label,
  sublabel,
  value,
  onValueChange,
  icon,
  accentColor,
  size = 'default',
}: Props) {
  const { mediumImpact } = useHaptics();
  const { colors, isPerformance } = useTheme();
  const pressScale = useSharedValue(1);
  const resolvedAccent = accentColor ?? colors.accent;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const handleToggle = () => {
    mediumImpact();
    onValueChange(!value);
  };

  return (
    <Animated.View style={isPerformance ? undefined : animatedStyle}>
      <Pressable
        onPressIn={() => {
          if (!isPerformance) pressScale.value = withSpring(0.98);
        }}
        onPressOut={() => {
          if (!isPerformance) pressScale.value = withSpring(1);
        }}
        onPress={handleToggle}
        style={[
          styles.container,
          size === 'large' && styles.containerLarge,
          {
            backgroundColor: colors.surface,
            borderColor: value ? resolvedAccent + '50' : colors.border,
          },
        ]}
      >
        <View style={styles.leftContent}>
          {icon && (
            <View style={[styles.iconContainer, { backgroundColor: colors.surfaceLight }]}>
              {icon}
            </View>
          )}
          <View style={styles.textContainer}>
            <Text style={[styles.label, size === 'large' && styles.labelLarge, { color: colors.textPrimary }]}>
              {label}
            </Text>
            {sublabel && (
              <Text style={[styles.sublabel, { color: colors.textSecondary }]}>{sublabel}</Text>
            )}
          </View>
        </View>
        <Switch
          value={value}
          onValueChange={val => {
            mediumImpact();
            onValueChange(val);
          }}
          trackColor={{
            false: colors.surfaceLighter,
            true: resolvedAccent,
          }}
          thumbColor={Platform.OS === 'android' ? (value ? '#FFFFFF' : colors.textTertiary) : undefined}
          ios_backgroundColor={colors.surfaceLighter}
          style={Platform.OS === 'web' ? { height: 24, width: 44 } : undefined}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: BorderRadius.card,
    padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  containerLarge: {
    padding: Spacing.xl,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.md,
  },
  iconContainer: {
    marginRight: Spacing.md,
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  labelLarge: {
    fontSize: FontSize.lg,
  },
  sublabel: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
});
