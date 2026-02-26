import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { BorderRadius } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

function TabIcon({
  name,
  library,
  color,
  focused,
}: {
  name: string;
  library: 'ionicons' | 'material';
  color: string;
  focused: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.iconWrapper, focused && { backgroundColor: color + '22' }]}>
      {library === 'ionicons' ? (
        <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={20} color={color} />
      ) : (
        <MaterialCommunityIcons
          name={name as keyof typeof MaterialCommunityIcons.glyphMap}
          size={20}
          color={color}
        />
      )}
    </View>
  );
}

function TabBarBackground({ isDark, isPerformance }: { isDark: boolean; isPerformance: boolean }) {
  const { colors } = useTheme();

  if (isPerformance || Platform.OS === 'web') {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.tabBar,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          },
        ]}
      />
    );
  }

  return (
    <BlurView
      tint={isDark ? 'dark' : 'light'}
      intensity={85}
      style={[
        StyleSheet.absoluteFill,
        {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.borderLight,
        },
      ]}
    />
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, isPerformance } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: isPerformance ? colors.tabBar : 'transparent',
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          paddingBottom: Platform.OS === 'web' ? 6 : insets.bottom,
          paddingTop: 6,
          height: Platform.OS === 'web' ? 62 : 56 + insets.bottom,
          elevation: 0,
          ...(Platform.OS === 'web' ? { boxShadow: 'none' } : { shadowOpacity: 0 }),
          position: 'absolute',
        },
        tabBarBackground: () => (
          <TabBarBackground isDark={isDark} isPerformance={isPerformance} />
        ),
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '600',
          letterSpacing: 0.2,
          marginTop: 1,
        },
        tabBarItemStyle: {
          paddingVertical: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Command',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="shield-checkmark" library="ionicons" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="config"
        options={{
          title: 'Studio',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="monitor-cellphone" library="material" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="settings-outline" library="ionicons" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 34,
    height: 26,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
