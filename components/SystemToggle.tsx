import React from 'react';
import { View, Text, StyleSheet, Pressable, Switch, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';

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
  accentColor = Colors.accent,
  size = 'default',
}: Props) {
  const { mediumImpact } = useHaptics();
  const pressScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const handleToggle = () => {
    mediumImpact();
    onValueChange(!value);
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={() => {
          pressScale.value = withSpring(0.98);
        }}
        onPressOut={() => {
          pressScale.value = withSpring(1);
        }}
        onPress={handleToggle}
        style={[
          styles.container,
          size === 'large' && styles.containerLarge,
          value && {
            borderColor: accentColor + '60',
          },
        ]}
      >
        <View style={styles.leftContent}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <View style={styles.textContainer}>
            <Text style={[styles.label, size === 'large' && styles.labelLarge]}>{label}</Text>
            {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
          </View>
        </View>
        <Switch
          value={value}
          onValueChange={val => {
            mediumImpact();
            onValueChange(val);
          }}
          trackColor={{
            false: Colors.surfaceLighter,
            true: accentColor + '80',
          }}
          thumbColor={value ? accentColor : Colors.textTertiary}
          ios_backgroundColor={Colors.surfaceLighter}
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
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
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
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  label: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  labelLarge: {
    fontSize: FontSize.lg,
  },
  sublabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
});
