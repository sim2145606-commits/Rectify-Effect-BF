import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  Layout,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import Card from '@/components/Card';
import GlowButton from '@/components/GlowButton';

type TargetApp = {
  id: string;
  name: string;
  packageName: string;
  enabled: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

type TargetMode = 'whitelist' | 'blacklist';

const DEFAULT_APPS: TargetApp[] = [
  { id: '1', name: 'WhatsApp', packageName: 'com.whatsapp', enabled: true, icon: 'whatsapp' },
  { id: '2', name: 'Telegram', packageName: 'org.telegram.messenger', enabled: true, icon: 'send' },
  { id: '3', name: 'Instagram', packageName: 'com.instagram.android', enabled: false, icon: 'instagram' },
  { id: '4', name: 'Snapchat', packageName: 'com.snapchat.android', enabled: false, icon: 'snapchat' },
  { id: '5', name: 'Google Meet', packageName: 'com.google.android.apps.meetings', enabled: true, icon: 'google' },
  { id: '6', name: 'Zoom', packageName: 'us.zoom.videomeetings', enabled: true, icon: 'video' },
  { id: '7', name: 'Skype', packageName: 'com.skype.raider', enabled: false, icon: 'skype' },
  { id: '8', name: 'Discord', packageName: 'com.discord', enabled: false, icon: 'message-text' },
  { id: '9', name: 'Signal', packageName: 'org.thoughtcrime.securesms', enabled: false, icon: 'chat' },
  { id: '10', name: 'Facebook', packageName: 'com.facebook.katana', enabled: false, icon: 'facebook' },
  { id: '11', name: 'TikTok', packageName: 'com.zhiliaoapp.musically', enabled: false, icon: 'music-note' },
  { id: '12', name: 'Teams', packageName: 'com.microsoft.teams', enabled: true, icon: 'microsoft-teams' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { lightImpact, mediumImpact, success } = useHaptics();

  const [targetMode, setTargetMode] = useStorage<TargetMode>(
    STORAGE_KEYS.TARGET_MODE,
    'whitelist'
  );
  const [targetApps, setTargetApps] = useStorage<TargetApp[]>(
    STORAGE_KEYS.TARGET_APPS,
    DEFAULT_APPS
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddApp, setShowAddApp] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newAppPackage, setNewAppPackage] = useState('');

  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return targetApps;
    const query = searchQuery.toLowerCase();
    return targetApps.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        app.packageName.toLowerCase().includes(query)
    );
  }, [targetApps, searchQuery]);

  const enabledCount = useMemo(
    () => targetApps.filter((a) => a.enabled).length,
    [targetApps]
  );

  const toggleApp = useCallback(
    (id: string) => {
      lightImpact();
      setTargetApps((prev: TargetApp[]) =>
        prev.map((app) =>
          app.id === id ? { ...app, enabled: !app.enabled } : app
        )
      );
    },
    [lightImpact, setTargetApps]
  );

  const toggleAllApps = useCallback(
    (enabled: boolean) => {
      mediumImpact();
      setTargetApps((prev: TargetApp[]) =>
        prev.map((app) => ({ ...app, enabled }))
      );
    },
    [mediumImpact, setTargetApps]
  );

  const addCustomApp = useCallback(() => {
    if (!newAppName.trim() || !newAppPackage.trim()) {
      Alert.alert('Missing Info', 'Please enter both app name and package name.');
      return;
    }
    mediumImpact();
    const newApp: TargetApp = {
      id: Date.now().toString(),
      name: newAppName.trim(),
      packageName: newAppPackage.trim(),
      enabled: true,
      icon: 'application',
    };
    setTargetApps((prev: TargetApp[]) => [...prev, newApp]);
    setNewAppName('');
    setNewAppPackage('');
    setShowAddApp(false);
    success();
  }, [newAppName, newAppPackage, mediumImpact, setTargetApps, success]);

  const removeApp = useCallback(
    (id: string) => {
      lightImpact();
      Alert.alert('Remove App', 'Remove this app from the target list?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setTargetApps((prev: TargetApp[]) =>
              prev.filter((app) => app.id !== id)
            );
          },
        },
      ]);
    },
    [lightImpact, setTargetApps]
  );

  const switchTargetMode = useCallback(
    (mode: TargetMode) => {
      mediumImpact();
      setTargetMode(mode);
    },
    [mediumImpact, setTargetMode]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.lg },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.screenTitle}>Target Manager</Text>
        <Text style={styles.screenSubtitle}>
          Control which apps receive the virtual camera feed
        </Text>
      </Animated.View>

      {/* Target Mode Selector */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="target" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Targeting Mode</Text>
        </View>
        <View style={styles.modeSelector}>
          <Pressable
            onPress={() => switchTargetMode('whitelist')}
            style={[
              styles.modeButton,
              targetMode === 'whitelist' && styles.modeButtonActive,
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={targetMode === 'whitelist' ? Colors.accent : Colors.textTertiary}
            />
            <View style={styles.modeTextContent}>
              <Text
                style={[
                  styles.modeLabel,
                  targetMode === 'whitelist' && styles.modeLabelActive,
                ]}
              >
                Whitelist
              </Text>
              <Text style={styles.modeDesc}>
                Only enabled apps get virtual feed
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => switchTargetMode('blacklist')}
            style={[
              styles.modeButton,
              targetMode === 'blacklist' && styles.modeButtonActive,
            ]}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={targetMode === 'blacklist' ? Colors.danger : Colors.textTertiary}
            />
            <View style={styles.modeTextContent}>
              <Text
                style={[
                  styles.modeLabel,
                  targetMode === 'blacklist' && { color: Colors.danger },
                ]}
              >
                Blacklist
              </Text>
              <Text style={styles.modeDesc}>
                Enabled apps are excluded from feed
              </Text>
            </View>
          </Pressable>
        </View>
      </Animated.View>

      {/* Stats Bar */}
      <Animated.View entering={FadeInDown.delay(250).duration(500)}>
        <Card style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{targetApps.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: Colors.success }]}>
                {enabledCount}
              </Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: Colors.textTertiary }]}>
                {targetApps.length - enabledCount}
              </Text>
              <Text style={styles.statLabel}>Inactive</Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      {/* Search & Actions */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="apps" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Application List</Text>
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={16} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search apps..."
              placeholderTextColor={Colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Bulk Actions */}
        <View style={styles.bulkActions}>
          <Pressable
            onPress={() => toggleAllApps(true)}
            style={styles.bulkButton}
          >
            <Ionicons name="checkmark-done" size={14} color={Colors.accent} />
            <Text style={styles.bulkButtonText}>Enable All</Text>
          </Pressable>
          <Pressable
            onPress={() => toggleAllApps(false)}
            style={styles.bulkButton}
          >
            <Ionicons name="remove-circle-outline" size={14} color={Colors.textTertiary} />
            <Text style={styles.bulkButtonText}>Disable All</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowAddApp(!showAddApp)}
            style={[styles.bulkButton, styles.addButton]}
          >
            <Ionicons name="add" size={14} color={Colors.accent} />
            <Text style={[styles.bulkButtonText, { color: Colors.accent }]}>
              Add App
            </Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Add Custom App */}
      {showAddApp && (
        <Animated.View entering={FadeIn.duration(300)}>
          <Card glow glowColor={Colors.accentGlow} style={styles.addAppCard}>
            <Text style={styles.addAppTitle}>Add Custom Application</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>App Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. My Camera App"
                placeholderTextColor={Colors.textTertiary}
                value={newAppName}
                onChangeText={setNewAppName}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Package Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. com.example.camera"
                placeholderTextColor={Colors.textTertiary}
                value={newAppPackage}
                onChangeText={setNewAppPackage}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.addAppActions}>
              <GlowButton
                label="Cancel"
                variant="secondary"
                size="small"
                onPress={() => {
                  setShowAddApp(false);
                  setNewAppName('');
                  setNewAppPackage('');
                }}
              />
              <GlowButton
                label="Add to List"
                variant="primary"
                size="small"
                onPress={addCustomApp}
                icon={<Ionicons name="add" size={16} color={Colors.textPrimary} />}
              />
            </View>
          </Card>
        </Animated.View>
      )}

      {/* App List */}
      <Animated.View entering={FadeInDown.delay(400).duration(500)}>
        {filteredApps.map((app, index) => (
          <Animated.View key={app.id} layout={Layout.springify()}>
            <AppTargetRow
              app={app}
              targetMode={targetMode}
              onToggle={() => toggleApp(app.id)}
              onRemove={() => removeApp(app.id)}
            />
          </Animated.View>
        ))}

        {filteredApps.length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="search-outline" size={24} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>
              No apps match your search
            </Text>
          </Card>
        )}
      </Animated.View>

      {/* Permissions Section */}
      <Animated.View entering={FadeInDown.delay(500).duration(500)}>
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>System Permissions</Text>
        </View>
        <Card>
          <PermissionRow
            icon="camera-outline"
            label="Camera Access"
            description="Required to intercept camera feed"
            granted={true}
          />
          <PermissionRow
            icon="folder-outline"
            label="Storage Access"
            description="Required to read media files"
            granted={true}
          />
          <PermissionRow
            icon="key-outline"
            label="Root / Xposed Access"
            description="Required for camera hook injection"
            granted={true}
          />
          <PermissionRow
            icon="notifications-outline"
            label="Overlay Permission"
            description="Optional: show status in other apps"
            granted={false}
            last
          />
        </Card>
      </Animated.View>

      {/* App Info */}
      <Animated.View entering={FadeInDown.delay(600).duration(500)}>
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>About VirtuCam</Text>
        </View>
        <Card>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Hook Engine</Text>
            <Text style={styles.aboutValue}>Camera2 API Interceptor</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Target SDK</Text>
            <Text style={styles.aboutValue}>Android 10 – 16</Text>
          </View>
          <View style={[styles.aboutRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.aboutLabel}>AI Engine</Text>
            <Text style={styles.aboutValue}>Newell AI v1.0</Text>
          </View>
        </Card>
      </Animated.View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function AppTargetRow({
  app,
  targetMode,
  onToggle,
  onRemove,
}: {
  app: TargetApp;
  targetMode: TargetMode;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const statusColor =
    targetMode === 'whitelist'
      ? app.enabled
        ? Colors.success
        : Colors.textTertiary
      : app.enabled
      ? Colors.danger
      : Colors.success;

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onLongPress={onRemove}
        onPressIn={() => {
          scale.value = withSpring(0.98);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        style={[
          styles.appRow,
          app.enabled && {
            borderColor:
              targetMode === 'whitelist' ? Colors.accent + '30' : Colors.danger + '30',
          },
        ]}
      >
        <View style={styles.appIconContainer}>
          <MaterialCommunityIcons
            name={app.icon}
            size={20}
            color={app.enabled ? Colors.accent : Colors.textTertiary}
          />
        </View>
        <View style={styles.appInfo}>
          <Text style={styles.appName}>{app.name}</Text>
          <Text style={styles.appPackage} numberOfLines={1}>
            {app.packageName}
          </Text>
        </View>
        <View style={styles.appStatus}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: statusColor },
            ]}
          />
          <Switch
            value={app.enabled}
            onValueChange={onToggle}
            trackColor={{
              false: Colors.surfaceLighter,
              true:
                targetMode === 'whitelist'
                  ? Colors.accent + '80'
                  : Colors.danger + '80',
            }}
            thumbColor={
              app.enabled
                ? targetMode === 'whitelist'
                  ? Colors.accent
                  : Colors.danger
                : Colors.textTertiary
            }
            ios_backgroundColor={Colors.surfaceLighter}
            style={
              Platform.OS === 'web'
                ? { height: 22, width: 40 }
                : { transform: [{ scale: 0.85 }] }
            }
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function PermissionRow({
  icon,
  label,
  description,
  granted,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  granted: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.permissionRow,
        !last && { borderBottomWidth: 1, borderBottomColor: Colors.border },
      ]}
    >
      <View
        style={[
          styles.permissionIcon,
          { backgroundColor: granted ? Colors.success + '20' : Colors.warning + '20' },
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={granted ? Colors.success : Colors.warning}
        />
      </View>
      <View style={styles.permissionInfo}>
        <Text style={styles.permissionLabel}>{label}</Text>
        <Text style={styles.permissionDesc}>{description}</Text>
      </View>
      <View
        style={[
          styles.permissionBadge,
          {
            backgroundColor: granted ? Colors.success + '20' : Colors.warning + '20',
          },
        ]}
      >
        <Ionicons
          name={granted ? 'checkmark' : 'alert'}
          size={12}
          color={granted ? Colors.success : Colors.warning}
        />
        <Text
          style={[
            styles.permissionBadgeText,
            { color: granted ? Colors.success : Colors.warning },
          ]}
        >
          {granted ? 'OK' : 'REQ'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  screenTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  screenSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    marginTop: 4,
    marginBottom: Spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeButtonActive: {
    borderColor: Colors.accent + '60',
    backgroundColor: Colors.accent + '10',
  },
  modeTextContent: {
    flex: 1,
  },
  modeLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  modeLabelActive: {
    color: Colors.accent,
  },
  modeDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  statsCard: {
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
  searchRow: {
    marginBottom: Spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    padding: 0,
  },
  bulkActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bulkButtonText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  addButton: {
    borderColor: Colors.accent + '40',
    backgroundColor: Colors.accent + '10',
    marginLeft: 'auto',
  },
  addAppCard: {
    marginBottom: Spacing.lg,
  },
  addAppTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addAppActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  appIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  appPackage: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  appStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  permissionIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionInfo: {
    flex: 1,
  },
  permissionLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  permissionDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  permissionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  permissionBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  aboutLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  aboutValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
