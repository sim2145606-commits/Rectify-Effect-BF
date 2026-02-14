import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useAuth } from '@fastshot/auth';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';

export default function SignUpScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signUpWithEmail, signInWithGoogle, signInWithApple, isLoading, error, clearError, pendingEmailVerification } = useAuth();

  const logoGlow = useSharedValue(0.4);
  const buttonScale = useSharedValue(1);

  useEffect(() => {
    logoGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [logoGlow]);

  const logoGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: logoGlow.value * 0.8,
    opacity: 0.7 + logoGlow.value * 0.3,
  }));

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Info', 'Please enter both email and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    clearError();
    const result = await signUpWithEmail(email.trim(), password);
    if (result?.emailConfirmationRequired) {
      Alert.alert('Verification Sent', `A verification link has been sent to ${result.email}. Please check your inbox.`);
    }
  };

  const handleGoogleSignUp = async () => {
    clearError();
    await signInWithGoogle();
  };

  const handleAppleSignUp = async () => {
    clearError();
    await signInWithApple();
  };

  // Email verification pending state
  if (pendingEmailVerification) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.verificationContainer}>
          <Animated.View entering={FadeIn.duration(500)}>
            <View style={styles.verificationCard}>
              <View style={styles.verificationIconCircle}>
                <Ionicons name="mail-unread" size={48} color={Colors.electricBlue} />
              </View>
              <Text style={styles.verificationTitle}>Verification Sent</Text>
              <Text style={styles.verificationText}>
                We&apos;ve sent a secure verification link to your email.
                Check your inbox to activate your operator account.
              </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable style={styles.verificationButton}>
                  <Ionicons name="arrow-back" size={16} color={Colors.electricBlue} />
                  <Text style={styles.verificationButtonText}>RETURN TO LOGIN</Text>
                </Pressable>
              </Link>
            </View>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Grid Lines */}
        <View style={styles.gridOverlay} pointerEvents="none">
          <View style={[styles.gridLine, { top: '20%' }]} />
          <View style={[styles.gridLine, { top: '40%' }]} />
          <View style={[styles.gridLine, { top: '60%' }]} />
          <View style={[styles.gridLine, { top: '80%' }]} />
          <View style={[styles.gridLineV, { left: '25%' }]} />
          <View style={[styles.gridLineV, { left: '75%' }]} />
        </View>

        {/* Logo Section */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.logoSection}>
          <Animated.View style={[styles.logoCircle, logoGlowStyle]}>
            <MaterialCommunityIcons name="shield-plus" size={44} color={Colors.electricBlue} />
          </Animated.View>
          <Text style={styles.appTitle}>VIRTUCAM</Text>
          <Text style={styles.appTagline}>Register New Operator</Text>
        </Animated.View>

        {/* Glass Card */}
        <Animated.View entering={FadeInDown.delay(200).duration(600)}>
          <View style={styles.glassCard}>
            <View style={styles.glassInner}>
              <Text style={styles.cardTitle}>Create Account</Text>
              <Text style={styles.cardSubtitle}>Initialize your operator credentials</Text>

              {/* Error Display */}
              {error && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                  <Text style={styles.errorText}>{error.message}</Text>
                  <Pressable onPress={clearError}>
                    <Ionicons name="close" size={16} color={Colors.danger} />
                  </Pressable>
                </Animated.View>
              )}

              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={18} color={Colors.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="operator@virtucam.io"
                    placeholderTextColor={Colors.textTertiary}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    editable={!isLoading}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PASSWORD</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Min. 6 characters"
                    placeholderTextColor={Colors.textTertiary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    editable={!isLoading}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={Colors.textTertiary}
                    />
                  </Pressable>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={Colors.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Repeat password"
                    placeholderTextColor={Colors.textTertiary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    editable={!isLoading}
                  />
                  {confirmPassword.length > 0 && (
                    <Ionicons
                      name={password === confirmPassword ? 'checkmark-circle' : 'close-circle'}
                      size={18}
                      color={password === confirmPassword ? Colors.success : Colors.danger}
                    />
                  )}
                </View>
              </View>

              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <Animated.View entering={FadeIn.duration(200)} style={styles.strengthContainer}>
                  <View style={styles.strengthBar}>
                    <View
                      style={[
                        styles.strengthFill,
                        {
                          width: `${Math.min(100, (password.length / 12) * 100)}%`,
                          backgroundColor:
                            password.length < 6
                              ? Colors.danger
                              : password.length < 10
                              ? Colors.warningAmber
                              : Colors.success,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthText, {
                    color: password.length < 6
                      ? Colors.danger
                      : password.length < 10
                      ? Colors.warningAmber
                      : Colors.success,
                  }]}>
                    {password.length < 6 ? 'WEAK' : password.length < 10 ? 'MODERATE' : 'STRONG'}
                  </Text>
                </Animated.View>
              )}

              {/* Sign Up Button */}
              <Animated.View style={buttonAnimStyle}>
                <Pressable
                  onPress={handleSignUp}
                  disabled={isLoading}
                  onPressIn={() => { buttonScale.value = withSpring(0.97); }}
                  onPressOut={() => { buttonScale.value = withSpring(1); }}
                  style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
                >
                  {isLoading ? (
                    <ActivityIndicator color={Colors.textPrimary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="rocket" size={18} color={Colors.background} />
                      <Text style={styles.primaryButtonText}>CREATE OPERATOR</Text>
                    </>
                  )}
                </Pressable>
              </Animated.View>

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR REGISTER VIA</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* OAuth */}
              <View style={styles.oauthRow}>
                <Pressable
                  onPress={handleGoogleSignUp}
                  disabled={isLoading}
                  style={styles.oauthButton}
                >
                  <Ionicons name="logo-google" size={20} color={Colors.textPrimary} />
                  <Text style={styles.oauthButtonText}>Google</Text>
                </Pressable>

                {Platform.OS === 'ios' && (
                  <Pressable
                    onPress={handleAppleSignUp}
                    disabled={isLoading}
                    style={styles.oauthButton}
                  >
                    <Ionicons name="logo-apple" size={20} color={Colors.textPrimary} />
                    <Text style={styles.oauthButtonText}>Apple</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Login Link */}
        <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.footer}>
          <Text style={styles.footerText}>Already registered? </Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text style={styles.footerLink}>Sign In</Text>
            </Pressable>
          </Link>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xxl,
    justifyContent: 'center',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.3,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: Colors.border,
    opacity: 0.3,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.electricBlue + '40',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    elevation: 12,
    marginBottom: Spacing.md,
  },
  appTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.electricBlue,
    letterSpacing: 6,
  },
  appTagline: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    letterSpacing: 2,
    marginTop: Spacing.xs,
    textTransform: 'uppercase',
  },
  glassCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '15',
    overflow: 'hidden',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  glassInner: {
    backgroundColor: Colors.surface + 'E6',
    padding: Spacing.xxl,
    borderRadius: BorderRadius.xl,
  },
  cardTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  cardSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xxl,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.danger + '15',
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: FontSize.sm,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Platform.OS === 'web' ? Spacing.md : Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    paddingVertical: Platform.OS === 'web' ? Spacing.sm : Spacing.sm,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    marginTop: -Spacing.sm,
  },
  strengthBar: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.surfaceLighter,
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.electricBlue,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.sm,
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: Colors.inactive,
    shadowOpacity: 0,
  },
  primaryButtonText: {
    color: Colors.background,
    fontSize: FontSize.md,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  oauthRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  oauthButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  oauthButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  footerText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  footerLink: {
    color: Colors.electricBlue,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  verificationContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  verificationCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.electricBlue + '20',
  },
  verificationIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.electricBlue + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxl,
  },
  verificationTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  verificationText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  verificationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.electricBlue + '15',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
  },
  verificationButtonText: {
    color: Colors.electricBlue,
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
