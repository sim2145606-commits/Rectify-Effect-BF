import React from 'react';
import { Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';

type Props = {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
};

const VARIANT_COLORS = {
  primary: Colors.accent,
  secondary: Colors.surfaceLighter,
  danger: Colors.danger,
  success: Colors.success,
};

export default function GlowButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
}: Props) {
  const { lightImpact } = useHaptics();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bgColor = VARIANT_COLORS[variant];
  const isSecondary = variant === 'secondary';

  return (
    <Animated.View
      style={[animatedStyle, fullWidth && { width: '100%' }]}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.96);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        onPress={() => {
          if (!disabled && !loading) {
            lightImpact();
            onPress();
          }
        }}
        disabled={disabled || loading}
        style={[
          styles.button,
          size === 'small' && styles.small,
          size === 'large' && styles.large,
          {
            backgroundColor: disabled ? Colors.inactive : bgColor,
            shadowColor: disabled ? 'transparent' : bgColor,
          },
          !isSecondary && !disabled && styles.glowShadow,
          fullWidth && { width: '100%' },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={Colors.textPrimary} size="small" />
        ) : (
          <>
            {icon}
            <Text
              style={[
                styles.label,
                size === 'small' && styles.labelSmall,
                size === 'large' && styles.labelLarge,
                icon ? { marginLeft: Spacing.sm } : undefined,
                disabled && { color: Colors.textTertiary },
              ]}
            >
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  small: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  large: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  glowShadow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  label: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  labelSmall: {
    fontSize: FontSize.sm,
  },
  labelLarge: {
    fontSize: FontSize.lg,
  },
});
