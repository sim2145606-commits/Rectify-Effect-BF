import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Spacing, FontSize } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

export default function NotFoundScreen() {
  const { colors } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Page Not Found</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          This screen doesn&apos;t exist in the app.
        </Text>
        <Link
          href="/(tabs)"
          replace
          style={[styles.link, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.linkText, { color: colors.textPrimary }]}>Go to Home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
  },
  title: {
    fontSize: FontSize.display,
    fontWeight: 'bold',
    marginBottom: Spacing.lg,
  },
  description: {
    fontSize: FontSize.lg,
    textAlign: 'center',
    marginBottom: Spacing.xxxl,
  },
  link: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: 12,
  },
  linkText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
});
