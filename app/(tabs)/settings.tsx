import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  ActivityIndicator,
  Modal,
  Linking,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  Layout,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { launchTargetApp } from '@/services/AppLauncher';
import { writeBridgeConfig } from '@/services/ConfigBridge';
import {
  requestCameraPermission,
  requestAllFilesAccess,
  requestOverlayPermission,
} from '@/services/PermissionManager';
import { getStatusColor } from '@/services/SystemVerification';
import { resetToDefaults } from '@/services/ResetService';
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

// Compatibility data for cloud-verified apps
const APP_COMPATIBILITY: Record<string, { compatibility: number; notes: string[] }> = {
  'com.whatsapp': {
    compatibility: 98,
    notes: [
      'Mirror for selfie consistency',
      'Camera2 API fully supported',
      'Video calls + status stories compatible',
      'Tested on Android 10–14',
    ],
  },
  'org.telegram.messenger': {
    compatibility: 97,
    notes: [
      'Both photo & video modes supported',
      'Group video calls tested',
      'Secret chat camera compatible',
      'Round video messages work correctly',
    ],
  },
  'com.instagram.android': {
    compatibility: 95,
    notes: [
      'Stories, Reels, Live all supported',
      'Some filters may conflict with AI enhance',
      'DM video calls compatible',
      'Feed posting uses gallery path',
    ],
  },
  'com.snapchat.android': {
    compatibility: 88,
    notes: [
      'Snap camera intercept works',
      'AR filters may have z-ordering issues',
      'Video snaps fully functional',
      'Spotlight camera compatible',
    ],
  },
  'com.google.android.apps.meetings': {
    compatibility: 99,
    notes: [
      'Full Camera2 API compliance',
      'Screen sharing unaffected',
      'Background effects compatible',
      'Enterprise-grade reliability verified',
    ],
  },
  'us.zoom.videomeetings': {
    compatibility: 98,
    notes: [
      'Mirror for selfie consistency',
      'Virtual background compatible',
      'Touch up my appearance works alongside',
      'Breakout rooms maintain feed',
    ],
  },
  'com.skype.raider': {
    compatibility: 94,
    notes: [
      'HD video calls supported',
      'Background blur compatible',
      'Group calls tested up to 50 participants',
      'Legacy camera path also hooked',
    ],
  },
  'com.discord': {
    compatibility: 93,
    notes: [
      'Voice channel video supported',
      'Go Live streaming compatible',
      'Server video calls work',
      'Mobile-specific optimizations applied',
    ],
  },
  'org.thoughtcrime.securesms': {
    compatibility: 96,
    notes: [
      'End-to-end encrypted calls compatible',
      'Camera intercept at hardware level',
      'Photo messages use gallery path',
      'Group video calls supported',
    ],
  },
  'com.facebook.katana': {
    compatibility: 91,
    notes: [
      'Messenger video calls supported',
      'Stories camera intercepted',
      'Reels compatible with limitations',
      'Live broadcasting tested',
    ],
  },
  'com.zhiliaoapp.musically': {
    compatibility: 89,
    notes: [
      'Preview and recording supported',
      'Livestreaming compatible',
      'Duets may need mirror adjustment',
      'Effects overlay compatible',
    ],
  },
  'com.microsoft.teams': {
    compatibility: 99,
    notes: [
      'Enterprise Camera2 API compliance',
      'Together mode compatible',
      'Background effects work alongside',
      'Meeting recordings unaffected',
    ],
  },
};

const DEFAULT_APPS: TargetApp[] = [
  { id: '1', name: 'WhatsApp', packageName: 'com.whatsapp', enabled: true, icon: 'whatsapp' },
  { id: '2', name: 'Telegram', packageName: 'org.telegram.messenger', enabled: true, icon: 'send' },
  {
    id: '3',
    name: 'Instagram',
    packageName: 'com.instagram.android',
    enabled: false,
    icon: 'instagram',
  },
  {
    id: '4',
    name: 'Snapchat',
    packageName: 'com.snapchat.android',
    enabled: false,
    icon: 'snapchat',
  },
  {
    id: '5',
    name: 'Google Meet',
    packageName: 'com.google.android.apps.meetings',
    enabled: true,
    icon: 'google',
  },
  { id: '6', name: 'Zoom', packageName: 'us.zoom.videomeetings', enabled: true, icon: 'video' },
  { id: '7', name: 'Skype', packageName: 'com.skype.raider', enabled: false, icon: 'skype' },
  { id: '8', name: 'Discord', packageName: 'com.discord', enabled: false, icon: 'message-text' },
  {
    id: '9',
    name: 'Signal',
    packageName: 'org.thoughtcrime.securesms',
    enabled: false,
    icon: 'chat',
  },
  {
    id: '10',
    name: 'Facebook',
    packageName: 'com.facebook.katana',
    enabled: false,
    icon: 'facebook',
  },
  {
    id: '11',
    name: 'TikTok',
    packageName: 'com.zhiliaoapp.musically',
    enabled: false,
    icon: 'music-note',
  },
  {
    id: '12',
    name: 'Teams',
    packageName: 'com.microsoft.teams',
    enabled: true,
    icon: 'microsoft-teams',
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lightImpact, mediumImpact, success, warning, heavyImpact } = useHaptics();

  const [targetMode, setTargetMode] = useStorage<TargetMode>(STORAGE_KEYS.TARGET_MODE, 'whitelist');
  const [targetApps, setTargetApps] = useStorage<TargetApp[]>(
    STORAGE_KEYS.TARGET_APPS,
    DEFAULT_APPS
  );

  const { status: systemStatus } = useSystemStatus();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddApp, setShowAddApp] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newAppPackage, setNewAppPackage] = useState('');
  const [launchingApp, setLaunchingApp] = useState<string | null>(null);
  const [cloudVerifiedApps, setCloudVerifiedApps] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState<TargetApp | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // State for installed apps
  const [installedPackages, setInstalledPackages] = useState<string[]>([]);

  // Check which apps are installed on device
  useEffect(() => {
    const checkInstalledApps = async () => {
      try {
        const { VirtuCamSettings } = require('react-native').NativeModules;
        if (VirtuCamSettings && VirtuCamSettings.getInstalledPackages) {
          const packageNames = targetApps.map(app => app.packageName);
          const installed = await VirtuCamSettings.getInstalledPackages(packageNames);
          setInstalledPackages(installed || []);
        }
      } catch {
        // If check fails, show all apps
        setInstalledPackages(targetApps.map(app => app.packageName));
      }
    };
    checkInstalledApps();
  }, [targetApps]);

  // Load cloud verified apps - removed as we're using local presets now
  useEffect(() => {
    // No cloud sync needed for local presets
    setCloudVerifiedApps([]);
  }, []);

  // Filter apps: only show installed apps, then apply search filter
  const filteredApps = useMemo(() => {
    // First filter to only installed apps (if we have the list)
    let apps =
      installedPackages.length > 0
        ? targetApps.filter(app => installedPackages.includes(app.packageName))
        : targetApps;

    // Then apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      apps = apps.filter(
        app =>
          app.name.toLowerCase().includes(query) || app.packageName.toLowerCase().includes(query)
      );
    }
    return apps;
  }, [targetApps, searchQuery, installedPackages]);

  // Count only installed and enabled apps
  const installedApps = useMemo(
    () =>
      installedPackages.length > 0
        ? targetApps.filter(app => installedPackages.includes(app.packageName))
        : targetApps,
    [targetApps, installedPackages]
  );

  const enabledCount = useMemo(() => installedApps.filter(a => a.enabled).length, [installedApps]);

  const cloudVerifiedCount = useMemo(
    () => targetApps.filter(a => cloudVerifiedApps.includes(a.packageName)).length,
    [targetApps, cloudVerifiedApps]
  );

  const toggleApp = useCallback(
    (id: string) => {
      lightImpact();
      setTargetApps((prev: TargetApp[]) => {
        const updated = prev.map(app => (app.id === id ? { ...app, enabled: !app.enabled } : app));
        // Write updated packages to bridge
        const enabledPackages = updated
          .filter((app: TargetApp) => app.enabled)
          .map((app: TargetApp) => app.packageName);
        writeBridgeConfig({
          targetMode,
          targetPackages: enabledPackages,
        }).catch(() => {});
        return updated;
      });
    },
    [lightImpact, setTargetApps, targetMode]
  );

  const toggleAllApps = useCallback(
    (enabled: boolean) => {
      mediumImpact();
      setTargetApps((prev: TargetApp[]) => {
        const updated = prev.map(app => ({ ...app, enabled }));
        // Write updated packages to bridge
        const enabledPackages = updated
          .filter((app: TargetApp) => app.enabled)
          .map((app: TargetApp) => app.packageName);
        writeBridgeConfig({
          targetMode,
          targetPackages: enabledPackages,
        }).catch(() => {});
        return updated;
      });
    },
    [mediumImpact, setTargetApps, targetMode]
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
    setTargetApps((prev: TargetApp[]) => {
      const updated = [...prev, newApp];
      // Sync to bridge
      const enabledPackages = updated.filter(app => app.enabled).map(app => app.packageName);
      writeBridgeConfig({
        targetMode,
        targetPackages: enabledPackages,
      }).catch(() => {});
      return updated;
    });
    setNewAppName('');
    setNewAppPackage('');
    setShowAddApp(false);
    success();
  }, [newAppName, newAppPackage, mediumImpact, setTargetApps, targetMode, success]);

  const removeApp = useCallback(
    (id: string) => {
      lightImpact();
      Alert.alert('Remove App', 'Remove this app from the target list?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setTargetApps((prev: TargetApp[]) => {
              const updated = prev.filter(app => app.id !== id);
              // Sync to bridge after removal
              const enabledPackages = updated
                .filter(app => app.enabled)
                .map(app => app.packageName);
              writeBridgeConfig({
                targetMode,
                targetPackages: enabledPackages,
              }).catch(() => {});
              return updated;
            });
          },
        },
      ]);
    },
    [lightImpact, setTargetApps, targetMode]
  );

  const handleLaunchApp = useCallback(
    async (app: TargetApp) => {
      setLaunchingApp(app.id);
      mediumImpact();

      try {
        // Write target list to bridge config
        const enabledPackages = targetApps.filter(a => a.enabled).map(a => a.packageName);
        await writeBridgeConfig({
          targetMode,
          targetPackages: enabledPackages,
        });

        const result = await launchTargetApp(app.packageName, app.name);
        if (result.success) {
          success();
        } else {
          warning();
          Alert.alert('Launch Info', result.message);
        }
      } catch {
        Alert.alert('Launch Error', `Failed to launch ${app.name}`);
      } finally {
        setLaunchingApp(null);
      }
    },
    [targetMode, targetApps, mediumImpact, success, warning]
  );

  const handleRequestPermission = useCallback(
    async (type: string) => {
      lightImpact();
      try {
        switch (type) {
          case 'camera':
            await requestCameraPermission();
            break;
          case 'storage':
            await requestAllFilesAccess();
            break;
          case 'root':
            Alert.alert(
              'Root Access',
              'Root must be granted via Magisk or KernelSU. Check the system setup wizard for guidance.'
            );
            break;
          case 'overlay':
            await requestOverlayPermission();
            break;
          case 'allfiles':
            await requestAllFilesAccess();
            break;
        }
        success();
      } catch {
        warning();
      }
    },
    [lightImpact, success, warning]
  );

  const switchTargetMode = useCallback(
    (mode: TargetMode) => {
      mediumImpact();
      setTargetMode(mode);
      // Write to bridge config
      const enabledPackages = targetApps.filter(a => a.enabled).map(a => a.packageName);
      writeBridgeConfig({
        targetMode: mode,
        targetPackages: enabledPackages,
      }).catch(() => {});
    },
    [mediumImpact, setTargetMode, targetApps]
  );

  const handleAppTap = useCallback(
    (app: TargetApp) => {
      lightImpact();
      setSelectedApp(app);
    },
    [lightImpact]
  );

  const handleResetToDefaults = useCallback(() => {
    Alert.alert(
      'Reset to Defaults',
      'This will reset ALL settings to their default values. Your permissions and onboarding status will be preserved. This action cannot be undone.\n\nAre you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true);
            heavyImpact();

            try {
              const result = await resetToDefaults();

              if (result.success && result.verification) {
                if (result.verification.valuesVerified) {
                  success();
                  Alert.alert(
                    'Reset Complete',
                    'All settings have been reset to defaults and verified successfully. Please restart the app for changes to take full effect.',
                    [
                      {
                        text: 'OK',
                        onPress: () => {
                          // Reload the target apps from storage
                          setTargetApps(DEFAULT_APPS);
                          setTargetMode('whitelist');
                        },
                      },
                    ]
                  );
                } else {
                  warning();
                  Alert.alert(
                    'Reset Completed with Warnings',
                    'Settings were reset but verification detected some inconsistencies. Please check your settings and restart the app.'
                  );
                }
              } else {
                warning();
                Alert.alert(
                  'Reset Failed',
                  result.error || 'Failed to reset settings. Please try again.'
                );
              }
            } catch (error: any) {
              warning();
              Alert.alert('Reset Error', error.message || 'An unexpected error occurred.');
            } finally {
              setIsResetting(false);
            }
          },
        },
      ]
    );
  }, [heavyImpact, success, warning, setTargetApps, setTargetMode]);

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
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
              style={[styles.modeButton, targetMode === 'whitelist' && styles.modeButtonActive]}
            >
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={targetMode === 'whitelist' ? Colors.accent : Colors.textTertiary}
              />
              <View style={styles.modeTextContent}>
                <Text
                  style={[styles.modeLabel, targetMode === 'whitelist' && styles.modeLabelActive]}
                >
                  Whitelist
                </Text>
                <Text style={styles.modeDesc}>Only enabled apps get virtual feed</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => switchTargetMode('blacklist')}
              style={[styles.modeButton, targetMode === 'blacklist' && styles.modeButtonActive]}
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={targetMode === 'blacklist' ? Colors.danger : Colors.textTertiary}
              />
              <View style={styles.modeTextContent}>
                <Text
                  style={[styles.modeLabel, targetMode === 'blacklist' && { color: Colors.danger }]}
                >
                  Blacklist
                </Text>
                <Text style={styles.modeDesc}>Enabled apps are excluded from feed</Text>
              </View>
            </Pressable>
          </View>
        </Animated.View>

        {/* Enhanced Stats Bar */}
        <Animated.View entering={FadeInDown.delay(250).duration(500)}>
          <Card style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{targetApps.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: Colors.success }]}>{enabledCount}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: Colors.electricBlue }]}>
                  {cloudVerifiedCount}
                </Text>
                <Text style={styles.statLabel}>Verified</Text>
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
            <Pressable onPress={() => toggleAllApps(true)} style={styles.bulkButton}>
              <Ionicons name="checkmark-done" size={14} color={Colors.accent} />
              <Text style={styles.bulkButtonText}>Enable All</Text>
            </Pressable>
            <Pressable onPress={() => toggleAllApps(false)} style={styles.bulkButton}>
              <Ionicons name="remove-circle-outline" size={14} color={Colors.textTertiary} />
              <Text style={styles.bulkButtonText}>Disable All</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowAddApp(!showAddApp)}
              style={[styles.bulkButton, styles.addButton]}
            >
              <Ionicons name="add" size={14} color={Colors.accent} />
              <Text style={[styles.bulkButtonText, { color: Colors.accent }]}>Add App</Text>
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
          {filteredApps.map(app => (
            <Animated.View key={app.id} layout={Layout.springify()}>
              <AppTargetRow
                app={app}
                targetMode={targetMode}
                onToggle={() => toggleApp(app.id)}
                onRemove={() => removeApp(app.id)}
                onLaunch={() => handleLaunchApp(app)}
                onTap={() => handleAppTap(app)}
                isLaunching={launchingApp === app.id}
                isCloudVerified={cloudVerifiedApps.includes(app.packageName)}
                hasCompatData={!!APP_COMPATIBILITY[app.packageName]}
              />
            </Animated.View>
          ))}

          {filteredApps.length === 0 && (
            <Card style={styles.emptyCard}>
              <Ionicons name="search-outline" size={24} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No apps match your search</Text>
            </Card>
          )}
        </Animated.View>

        {/* Permissions Section */}
        <Animated.View entering={FadeInDown.delay(500).duration(500)}>
          <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
            <Ionicons name="shield-checkmark" size={18} color={Colors.electricBlue} />
            <Text style={styles.sectionTitle}>System Permissions</Text>
          </View>
          <Card>
            <PermissionRow
              icon="camera-outline"
              label="Camera Access"
              description="Required to intercept camera feed"
              granted={systemStatus.storagePermission.status === 'ok'}
              onRequest={() => handleRequestPermission('camera')}
            />
            <PermissionRow
              icon="folder-outline"
              label="Storage Access"
              description="Required to read media files"
              granted={systemStatus.storagePermission.status === 'ok'}
              onRequest={() => handleRequestPermission('storage')}
            />
            <PermissionRow
              icon="document-outline"
              label="All Files Access"
              description="MANAGE_EXTERNAL_STORAGE for injection"
              granted={systemStatus.allFilesAccess.status === 'ok'}
              onRequest={() => handleRequestPermission('allfiles')}
            />
            <PermissionRow
              icon="key-outline"
              label="Root / Xposed Access"
              description="Required for camera hook injection"
              granted={systemStatus.rootAccess.status === 'ok'}
              onRequest={() => handleRequestPermission('root')}
            />
            <PermissionRow
              icon="layers-outline"
              label="Overlay Permission"
              description="Display over other apps for status"
              granted={systemStatus.moduleActive.status === 'ok'}
              onRequest={() => handleRequestPermission('overlay')}
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
            {/* App Logo & Name */}
            <View style={styles.aboutHeader}>
              <View style={styles.aboutLogoContainer}>
                <MaterialCommunityIcons name="camera-iris" size={36} color={Colors.electricBlue} />
              </View>
              <View style={styles.aboutHeaderInfo}>
                <Text style={styles.aboutAppName}>VirtuCam</Text>
                <Text style={styles.aboutAppTagline}>Virtual Camera Engine for Android</Text>
              </View>
            </View>

            <View style={styles.aboutDivider} />

            {/* Info Grid */}
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Version</Text>
              <Text style={styles.aboutValue}>1.0.0</Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Build</Text>
              <Text style={styles.aboutValue}>
                {Platform.OS} {Platform.Version}
              </Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Hook Engine</Text>
              <Text style={styles.aboutValue}>Camera2 API Interceptor</Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Framework</Text>
              <Text
                style={[
                  styles.aboutValue,
                  { color: getStatusColor(systemStatus.xposedFramework.status) },
                ]}
              >
                {systemStatus.xposedFramework.detail}
              </Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Target SDK</Text>
              <Text style={styles.aboutValue}>Android 10 – 16</Text>
            </View>
            <View style={[styles.aboutRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.aboutLabel}>Developer</Text>
              <Text style={styles.aboutValue}>ggSetRanges</Text>
            </View>

            {/* Links */}
            <View style={styles.aboutLinks}>
              <Pressable
                style={styles.aboutLinkButton}
                onPress={() => Linking.openURL('https://github.com/ggsetRanges/virtucam')}
              >
                <Ionicons name="logo-github" size={16} color={Colors.textSecondary} />
                <Text style={styles.aboutLinkText}>Source Code</Text>
              </Pressable>
              <Pressable
                style={styles.aboutLinkButton}
                onPress={() => Linking.openURL('https://github.com/ggsetRanges/virtucam/issues')}
              >
                <Ionicons name="bug-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.aboutLinkText}>Report Issue</Text>
              </Pressable>
            </View>
          </Card>
        </Animated.View>

        {/* Diagnostic Logs Section */}
        <Animated.View entering={FadeInDown.delay(650).duration(500)}>
          <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
            <Ionicons name="document-text-outline" size={18} color={Colors.electricBlue} />
            <Text style={styles.sectionTitle}>Diagnostics</Text>
          </View>
          <Card>
            <Pressable
              onPress={() => router.push('/logs' as Href)}
              style={[styles.aboutRow, { borderBottomWidth: 0 }]}
            >
              <View style={styles.logsButtonContent}>
                <Ionicons name="document-text" size={16} color={Colors.electricBlue} />
                <Text style={[styles.aboutLabel, { color: Colors.electricBlue }]}>
                  View Diagnostic Logs
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.electricBlue} />
            </Pressable>
          </Card>
        </Animated.View>

        {/* Reset to Defaults */}
        <Animated.View entering={FadeInDown.delay(700).duration(500)}>
          <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
            <Ionicons name="refresh" size={18} color={Colors.danger} />
            <Text style={styles.sectionTitle}>Reset Settings</Text>
          </View>
          <Card>
            <View style={styles.resetSection}>
              <View style={styles.resetInfo}>
                <Text style={styles.resetTitle}>Reset to Default Settings</Text>
                <Text style={styles.resetDesc}>
                  Restore all settings to their default values. Your permissions, onboarding status,
                  and system logs will be preserved.
                </Text>
              </View>
              <GlowButton
                label={isResetting ? 'Resetting...' : 'Reset All'}
                variant="secondary"
                size="medium"
                onPress={handleResetToDefaults}
                disabled={isResetting}
                icon={
                  isResetting ? (
                    <ActivityIndicator size="small" color={Colors.textPrimary} />
                  ) : (
                    <Ionicons name="refresh" size={16} color={Colors.textPrimary} />
                  )
                }
              />
            </View>
          </Card>
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* App Detail Modal */}
      <AppDetailModal
        app={selectedApp}
        isCloudVerified={selectedApp ? cloudVerifiedApps.includes(selectedApp.packageName) : false}
        compatData={selectedApp ? APP_COMPATIBILITY[selectedApp.packageName] : undefined}
        onClose={() => setSelectedApp(null)}
        onLaunch={selectedApp ? () => handleLaunchApp(selectedApp) : () => {}}
        targetMode={targetMode}
      />
    </>
  );
}

function AppDetailModal({
  app,
  isCloudVerified,
  compatData,
  onClose,
  onLaunch,
  targetMode,
}: {
  app: TargetApp | null;
  isCloudVerified: boolean;
  compatData?: { compatibility: number; notes: string[] };
  onClose: () => void;
  onLaunch: () => void;
  targetMode: TargetMode;
}) {
  const compatPct = compatData?.compatibility ?? 85;
  const compatColor =
    compatPct >= 95
      ? Colors.success
      : compatPct >= 90
        ? Colors.electricBlue
        : compatPct >= 80
          ? Colors.warning
          : Colors.danger;

  // Animated compatibility ring
  const ringProgress = useSharedValue(0);

  useEffect(() => {
    if (app) {
      ringProgress.value = 0;
      ringProgress.value = withTiming(compatPct / 100, {
        duration: 1200,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [app, compatPct, ringProgress]);

  if (!app) return null;

  return (
    <Modal visible={!!app} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={modalStyles.sheet}>
          {/* Handle */}
          <View style={modalStyles.handle} />

          {/* Header */}
          <View style={modalStyles.header}>
            <View style={modalStyles.appIconLarge}>
              <MaterialCommunityIcons name={app.icon} size={32} color={Colors.accent} />
            </View>
            <View style={modalStyles.headerText}>
              <View style={modalStyles.nameRow}>
                <Text style={modalStyles.appName}>{app.name}</Text>
                {isCloudVerified && (
                  <View style={modalStyles.cloudBadgeLarge}>
                    <Ionicons name="cloud-done" size={12} color={Colors.electricBlue} />
                    <Text style={modalStyles.cloudBadgeLargeText}>VERIFIED</Text>
                  </View>
                )}
              </View>
              <Text style={modalStyles.packageName}>{app.packageName}</Text>
            </View>
            <Pressable onPress={onClose} style={modalStyles.closeButton}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* Compatibility Score */}
          <View style={modalStyles.compatSection}>
            <View style={modalStyles.compatRing}>
              <View style={[modalStyles.compatCircle, { borderColor: compatColor + '30' }]}>
                <Text style={[modalStyles.compatPct, { color: compatColor }]}>{compatPct}%</Text>
                <Text style={modalStyles.compatLabel}>Compatible</Text>
              </View>
            </View>
            <View style={modalStyles.compatInfo}>
              <View style={modalStyles.compatRow}>
                <Text style={modalStyles.compatInfoLabel}>Hook Method</Text>
                <Text style={modalStyles.compatInfoValue}>Camera2 API</Text>
              </View>
              <View style={modalStyles.compatRow}>
                <Text style={modalStyles.compatInfoLabel}>Target Mode</Text>
                <Text style={modalStyles.compatInfoValue}>{targetMode}</Text>
              </View>
              <View style={modalStyles.compatRow}>
                <Text style={modalStyles.compatInfoLabel}>Status</Text>
                <Text
                  style={[
                    modalStyles.compatInfoValue,
                    { color: app.enabled ? Colors.success : Colors.textTertiary },
                  ]}
                >
                  {app.enabled ? 'Active' : 'Inactive'}
                </Text>
              </View>
              <View style={[modalStyles.compatRow, { borderBottomWidth: 0 }]}>
                <Text style={modalStyles.compatInfoLabel}>Cloud Status</Text>
                <Text
                  style={[
                    modalStyles.compatInfoValue,
                    { color: isCloudVerified ? Colors.electricBlue : Colors.textTertiary },
                  ]}
                >
                  {isCloudVerified ? 'Verified' : 'Unverified'}
                </Text>
              </View>
            </View>
          </View>

          {/* Technical Notes */}
          {compatData && (
            <View style={modalStyles.notesSection}>
              <Text style={modalStyles.notesTitle}>Technical Notes</Text>
              {compatData.notes.map((note, i) => (
                <View key={i} style={modalStyles.noteRow}>
                  <View style={[modalStyles.noteBullet, { backgroundColor: compatColor }]} />
                  <Text style={modalStyles.noteText}>{note}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action */}
          {app.enabled && (
            <View style={modalStyles.actionRow}>
              <GlowButton
                label="INJECT & LAUNCH"
                variant="primary"
                size="large"
                fullWidth
                onPress={() => {
                  onClose();
                  setTimeout(onLaunch, 300);
                }}
                icon={<Ionicons name="rocket" size={18} color={Colors.textPrimary} />}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function AppTargetRow({
  app,
  targetMode,
  onToggle,
  onRemove,
  onLaunch,
  onTap,
  isLaunching,
  isCloudVerified,
  hasCompatData,
}: {
  app: TargetApp;
  targetMode: TargetMode;
  onToggle: () => void;
  onRemove: () => void;
  onLaunch: () => void;
  onTap: () => void;
  isLaunching: boolean;
  isCloudVerified: boolean;
  hasCompatData: boolean;
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
        onPress={onTap}
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
            borderColor: targetMode === 'whitelist' ? Colors.accent + '30' : Colors.danger + '30',
          },
        ]}
      >
        <View style={styles.appIconContainer}>
          <MaterialCommunityIcons
            name={app.icon}
            size={20}
            color={app.enabled ? Colors.accent : Colors.textTertiary}
          />
          {/* Cloud Verified Badge */}
          {(isCloudVerified || hasCompatData) && (
            <View style={styles.cloudVerifiedDot}>
              <Ionicons name="cloud-done" size={8} color={Colors.electricBlue} />
            </View>
          )}
        </View>
        <View style={styles.appInfo}>
          <View style={styles.appNameRow}>
            <Text style={styles.appName}>{app.name}</Text>
            {(isCloudVerified || hasCompatData) && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={10} color={Colors.electricBlue} />
                <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
              </View>
            )}
            {app.enabled && (
              <Pressable onPress={onLaunch} disabled={isLaunching} style={styles.launchButton}>
                {isLaunching ? (
                  <ActivityIndicator size={10} color={Colors.electricBlue} />
                ) : (
                  <Ionicons name="rocket" size={10} color={Colors.electricBlue} />
                )}
                <Text style={styles.launchButtonText}>INJECT</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.appMetaRow}>
            <Text style={styles.appPackage} numberOfLines={1}>
              {app.packageName}
            </Text>
            {hasCompatData && (
              <Text style={styles.compatBadgeSmall}>
                {APP_COMPATIBILITY[app.packageName]?.compatibility}%
              </Text>
            )}
          </View>
        </View>
        <View style={styles.appStatus}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Switch
            value={app.enabled}
            onValueChange={onToggle}
            trackColor={{
              false: Colors.surfaceLighter,
              true: targetMode === 'whitelist' ? Colors.accent + '80' : Colors.danger + '80',
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
              Platform.OS === 'web' ? { height: 22, width: 40 } : { transform: [{ scale: 0.85 }] }
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
  onRequest,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  granted: boolean;
  last?: boolean;
  onRequest?: () => void;
}) {
  const statusColor = granted ? Colors.electricBlue : Colors.warningAmber;

  return (
    <Pressable
      onPress={!granted ? onRequest : undefined}
      style={[
        styles.permissionRow,
        !last && { borderBottomWidth: 1, borderBottomColor: Colors.border },
      ]}
    >
      <View style={[styles.permissionIcon, { backgroundColor: statusColor + '20' }]}>
        <Ionicons name={icon} size={18} color={statusColor} />
      </View>
      <View style={styles.permissionInfo}>
        <Text style={styles.permissionLabel}>{label}</Text>
        <Text style={styles.permissionDesc}>{description}</Text>
      </View>
      <View style={[styles.permissionBadge, { backgroundColor: statusColor + '20' }]}>
        <Ionicons name={granted ? 'checkmark' : 'alert'} size={12} color={statusColor} />
        <Text style={[styles.permissionBadgeText, { color: statusColor }]}>
          {granted ? 'OK' : 'GRANT'}
        </Text>
      </View>
    </Pressable>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceLighter,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  appIconLarge: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  appName: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  cloudBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.electricBlue + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
  },
  cloudBadgeLargeText: {
    color: Colors.electricBlue,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  packageName: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compatSection: {
    flexDirection: 'row',
    gap: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  compatRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  compatCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
  },
  compatPct: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  compatLabel: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  compatInfo: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  compatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  compatInfoLabel: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
  },
  compatInfoValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  notesSection: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notesTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  noteBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
  },
  noteText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    flex: 1,
    lineHeight: 20,
  },
  actionRow: {
    marginTop: Spacing.sm,
  },
});

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
    position: 'relative',
  },
  cloudVerifiedDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.electricBlue + '20',
    borderWidth: 1,
    borderColor: Colors.electricBlue + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appInfo: {
    flex: 1,
  },
  appNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  appName: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.electricBlue + '12',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '25',
  },
  verifiedBadgeText: {
    color: Colors.electricBlue,
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  launchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.electricBlue + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
  },
  launchButtonText: {
    color: Colors.electricBlue,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  appMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  appPackage: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    flex: 1,
  },
  compatBadgeSmall: {
    color: Colors.success,
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
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
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  aboutLogoContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.electricBlue + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
  },
  aboutHeaderInfo: {
    flex: 1,
  },
  aboutAppName: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aboutAppTagline: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  aboutDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
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
  aboutLinks: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  aboutLinkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aboutLinkText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  resetSection: {
    gap: Spacing.lg,
  },
  resetInfo: {
    gap: Spacing.sm,
  },
  resetTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  resetDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  logsButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
