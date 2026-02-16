import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, BorderRadius } from '@/constants/theme';

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
  return (
    <View style={[styles.iconWrapper, focused && styles.iconWrapperActive]}>
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

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.electricBlue,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'web' ? 6 : insets.bottom,
          paddingTop: 6,
          height: Platform.OS === 'web' ? 62 : 56 + insets.bottom,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '700',
          letterSpacing: 0.3,
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
        name="presets"
        options={{
          title: 'Presets',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="layers" library="ionicons" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="settings" library="ionicons" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 32,
    height: 26,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    backgroundColor: Colors.electricBlue + '20',
  },
});
