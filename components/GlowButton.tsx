import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

type Variant = 'primary' | 'secondary';
type Size = 'small' | 'medium' | 'large';

type Props = {
  label: string;
  variant?: Variant;
  size?: Size;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

const SIZE_MAP: Record<
  Size,
  { paddingVertical: number; paddingHorizontal: number; fontSize: number }
> = {
  small: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, fontSize: FontSize.sm },
  medium: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, fontSize: FontSize.md },
  large: { paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xl, fontSize: FontSize.md },
};

export default function GlowButton({
  label,
  variant = 'primary',
  size = 'medium',
  onPress,
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
}: Props) {
  const palette =
    variant === 'primary'
      ? {
          background: Colors.electricBlue + '20',
          border: Colors.electricBlue + '50',
          text: Colors.textPrimary,
          spinner: Colors.textPrimary,
        }
      : {
          background: Colors.surfaceLight,
          border: Colors.border,
          text: Colors.textSecondary,
          spinner: Colors.textSecondary,
        };

  const sizeStyle = SIZE_MAP[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={[
        styles.button,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          paddingVertical: sizeStyle.paddingVertical,
          paddingHorizontal: sizeStyle.paddingHorizontal,
          opacity: isDisabled ? 0.65 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {icon && <View style={styles.icon}>{icon}</View>}
        {loading ? (
          <ActivityIndicator size="small" color={palette.spinner} />
        ) : (
          <Text style={[styles.label, { color: palette.text, fontSize: sizeStyle.fontSize }]}>
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  icon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontWeight: '800',
    letterSpacing: 1,
  },
});
