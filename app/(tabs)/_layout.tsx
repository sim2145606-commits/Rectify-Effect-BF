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
    <View
      style={[
        styles.iconWrapper,
        focused && styles.iconWrapperActive,
      ]}
    >
      {library === 'ionicons' ? (
        <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={22} color={color} />
      ) : (
        <MaterialCommunityIcons
          name={name as keyof typeof MaterialCommunityIcons.glyphMap}
          size={22}
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
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'web' ? 8 : insets.bottom,
          paddingTop: 8,
          height: Platform.OS === 'web' ? 64 : 60 + insets.bottom,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.5,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Command',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="shield-checkmark"
              library="ionicons"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="media"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="images"
              library="ionicons"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="config"
        options={{
          title: 'Config',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="tune-variant"
              library="material"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Targets',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="crosshairs-gps"
              library="material"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 36,
    height: 28,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    backgroundColor: Colors.accent + '20',
  },
});
