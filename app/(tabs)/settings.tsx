import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
  Linking,
  Switch,
  Modal,
  TextInput,
  NativeModules,
} from 'react-native';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { FontSize, Spacing, BorderRadius, platformShadow, STORAGE_KEYS } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';
import { useStorage } from '@/hooks/useStorage';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { useTheme } from '@/context/ThemeContext';
import type { ColorMode } from '@/context/ThemeContext';
import {
  runDiagnostics,
  getRawXposedDebugInfo,
  type DiagnosticsReport,
  type DiagnosticCheckResult,
  type RawXposedDebugInfo,
} from '@/services/DiagnosticsService';
import {
  requestCameraPermission,
  requestAllFilesAccess,
  requestOverlayPermission,
} from '@/services/PermissionManager';
import { getStatusColor } from '@/services/SystemVerification';
import { resetToDefaults } from '@/services/ResetService';
import { writeBridgeConfig } from '@/services/ConfigBridge';
import Card from '@/components/Card';
import GlowButton from '@/components/GlowButton';

const { VirtuCamSettings } = NativeModules;

type TargetMode = 'all' | 'whitelist' | 'blacklist';
type TargetAppSource = 'preset' | 'custom' | 'system_manual';
type TargetAppRisk = 'system_manual';
type TargetAppItem = {
  id: string;
  name: string;
  packageName: string;
  enabled: boolean;
  source: TargetAppSource;
  riskTag?: TargetAppRisk;
};
type InstalledAppItem = {
  packageName: string;
  name: string;
};
type PackageMetadata = {
  packageName: string;
  name: string;
  installed: boolean;
  systemApp: boolean;
};

const PACKAGE_NAME_REGEX = /^[a-zA-Z0-9._]+$/;

const TARGET_APP_PRESETS: Array<Omit<TargetAppItem, 'enabled'>> = [
  { id: 'camera', name: 'Camera', packageName: 'com.android.camera', source: 'preset' },
  { id: 'whatsapp', name: 'WhatsApp', packageName: 'com.whatsapp', source: 'preset' },
  { id: 'telegram', name: 'Telegram', packageName: 'org.telegram.messenger', source: 'preset' },
  { id: 'messenger', name: 'Messenger', packageName: 'com.facebook.orca', source: 'preset' },
  { id: 'meet', name: 'Google Meet', packageName: 'com.google.android.apps.meetings', source: 'preset' },
  { id: 'zoom', name: 'Zoom', packageName: 'us.zoom.videomeetings', source: 'preset' },
];

const PRESET_PACKAGE_SET = new Set(TARGET_APP_PRESETS.map(app => app.packageName));

function sanitizeTargetApp(input: unknown): TargetAppItem | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<TargetAppItem>;
  if (typeof candidate.packageName !== 'string' || typeof candidate.name !== 'string') return null;

  const packageName = candidate.packageName.trim();
  const name = candidate.name.trim();
  if (!packageName || !name) return null;

  const source: TargetAppSource =
    candidate.source === 'system_manual' || candidate.riskTag === 'system_manual'
      ? 'system_manual'
      : candidate.source === 'preset' || PRESET_PACKAGE_SET.has(packageName)
        ? 'preset'
        : 'custom';

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id
      : `${source}-${packageName}`,
    name,
    packageName,
    enabled: candidate.enabled === true,
    source,
    riskTag: source === 'system_manual' ? 'system_manual' : undefined,
  };
}

function mergeTargetApps(stored: TargetAppItem[] | null | undefined): TargetAppItem[] {
  const safeStored = (Array.isArray(stored) ? stored : [])
    .map(sanitizeTargetApp)
    .filter((app): app is TargetAppItem => app !== null);

  const byPackage = new Map<string, TargetAppItem>();
  safeStored.forEach(app => {
    byPackage.set(app.packageName, app);
  });

  const presets = TARGET_APP_PRESETS.map(preset => {
    const existing = byPackage.get(preset.packageName);
    return {
      ...preset,
      enabled: existing?.enabled === true,
      source: 'preset' as const,
    };
  });

  const customApps = safeStored
    .filter(app => !PRESET_PACKAGE_SET.has(app.packageName))
    .map(app => {
      if (app.source === 'system_manual') {
        return { ...app, source: 'system_manual' as const, riskTag: 'system_manual' as const };
      }
      return { ...app, source: 'custom' as const };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...presets, ...customApps];
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lightImpact, mediumImpact, success, warning, heavyImpact } = useHaptics();
  const { colors, colorMode, setColorMode, performanceMode, setPerformanceMode, isPerformance } = useTheme();

  const { status: systemStatus, refresh: refreshSystemStatus } = useSystemStatus();

  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [diagnosticsReport, setDiagnosticsReport] = useState<DiagnosticsReport | null>(null);
  const [diagnosticsChecks, setDiagnosticsChecks] = useState<DiagnosticCheckResult[]>([]);
  const [rawXposedDebug, setRawXposedDebug] = useState<RawXposedDebugInfo | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [targetMode, setTargetMode] = useStorage<TargetMode>(STORAGE_KEYS.TARGET_MODE, 'all');
  const [targetApps, setTargetApps] = useStorage<TargetAppItem[]>(STORAGE_KEYS.TARGET_APPS, []);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [installedApps, setInstalledApps] = useState<InstalledAppItem[]>([]);
  const [isManualPickerVisible, setIsManualPickerVisible] = useState(false);
  const [manualPackageInput, setManualPackageInput] = useState('');
  const [manualLookupLoading, setManualLookupLoading] = useState(false);

  const resolvedTargetApps = useMemo(() => mergeTargetApps(targetApps), [targetApps]);
  const enabledTargetApps = useMemo(
    () => resolvedTargetApps.filter(app => app.enabled),
    [resolvedTargetApps]
  );
  const broadScopePackages = useMemo(() => {
    if (!rawXposedDebug?.broadScopePackages) return [];
    return rawXposedDebug.broadScopePackages
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }, [rawXposedDebug]);
  const scopeMismatchDetail = useMemo(() => {
    if (!rawXposedDebug) return '';
    if (targetMode !== 'whitelist') return '';
    const configured = enabledTargetApps.length;
    const scoped = rawXposedDebug.scopedTargetsCount;
    if (configured === 0) {
      return 'Whitelist mode has no enabled local target apps.';
    }
    if (scoped < configured) {
      return `Whitelist mismatch: ${scoped}/${configured} enabled local targets are scoped in LSPosed.`;
    }
    return '';
  }, [rawXposedDebug, targetMode, enabledTargetApps]);

  const filteredInstalledApps = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    const base = query.length === 0
      ? installedApps
      : installedApps.filter(app =>
          app.name.toLowerCase().includes(query) || app.packageName.toLowerCase().includes(query)
        );
    return base.slice(0, 200);
  }, [installedApps, pickerQuery]);
  const manualPackageTrimmed = useMemo(() => manualPackageInput.trim(), [manualPackageInput]);
  const manualPackageValid = useMemo(
    () => PACKAGE_NAME_REGEX.test(manualPackageTrimmed),
    [manualPackageTrimmed]
  );

  const pushTargetBridgeConfig = useCallback((mode: TargetMode, apps: TargetAppItem[]) => {
    const enabledPackages = apps.filter(app => app.enabled).map(app => app.packageName);
    writeBridgeConfig({
      targetMode: mode,
      targetPackages: enabledPackages,
    }).catch(() => {});
  }, []);

  const loadInstalledApps = useCallback(async () => {
    if (!VirtuCamSettings?.getAllInstalledApps) {
      Alert.alert('Unavailable', 'Native app picker API is not available on this build.');
      return;
    }

    setPickerLoading(true);
    try {
      const rawList = await VirtuCamSettings.getAllInstalledApps();
      const parsed = Array.isArray(rawList)
        ? rawList
            .map((entry: unknown) => {
              if (!entry || typeof entry !== 'object') return null;
              const candidate = entry as Partial<InstalledAppItem>;
              if (typeof candidate.packageName !== 'string' || typeof candidate.name !== 'string') {
                return null;
              }
              const packageName = candidate.packageName.trim();
              const name = candidate.name.trim();
              if (!packageName || !name) return null;
              return { packageName, name } as InstalledAppItem;
            })
            .filter((entry): entry is InstalledAppItem => entry !== null)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];

      setInstalledApps(parsed);
    } catch {
      Alert.alert('Scan Failed', 'Unable to load installed apps.');
    } finally {
      setPickerLoading(false);
    }
  }, []);

  const lookupPackageMetadata = useCallback(
    async (packageName: string): Promise<PackageMetadata> => {
      if (VirtuCamSettings?.resolvePackageMetadata) {
        const metadata = await VirtuCamSettings.resolvePackageMetadata(packageName);
        return {
          packageName,
          name:
            typeof metadata?.name === 'string' && metadata.name.trim().length > 0
              ? metadata.name.trim()
              : packageName,
          installed: metadata?.installed === true,
          systemApp: metadata?.systemApp === true,
        };
      }

      const installed = installedApps.some(app => app.packageName === packageName);
      const fallbackName = installedApps.find(app => app.packageName === packageName)?.name ?? packageName;
      return {
        packageName,
        name: fallbackName,
        installed,
        systemApp: false,
      };
    },
    [installedApps]
  );

  const handleOpenAddAppPicker = useCallback(async () => {
    lightImpact();
    setPickerQuery('');
    await loadInstalledApps();
    setIsPickerVisible(true);
  }, [lightImpact, loadInstalledApps]);

  const handleOpenManualPicker = useCallback(() => {
    lightImpact();
    setManualPackageInput('');
    setManualLookupLoading(false);
    setIsManualPickerVisible(true);
  }, [lightImpact]);

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
            return;
          case 'overlay':
            await requestOverlayPermission();
            break;
          case 'allfiles':
            await requestAllFilesAccess();
            break;
        }
        setTimeout(() => {
          void refreshSystemStatus();
        }, 500);
        success();
      } catch {
        warning();
      }
    },
    [lightImpact, success, warning, refreshSystemStatus]
  );

  useEffect(() => {
    void refreshSystemStatus();
  }, [refreshSystemStatus]);

  useEffect(() => {
    pushTargetBridgeConfig(targetMode, resolvedTargetApps);
  }, [targetMode, resolvedTargetApps, pushTargetBridgeConfig]);

  useEffect(() => {
    let active = true;
    const refreshRawDebug = async () => {
      const info = await getRawXposedDebugInfo();
      if (active) {
        setRawXposedDebug(info);
      }
    };
    void refreshRawDebug();
    return () => {
      active = false;
    };
  }, [targetMode, resolvedTargetApps.length]);

  const handleTargetModeChange = useCallback((mode: TargetMode) => {
    lightImpact();
    setTargetMode(mode);
    pushTargetBridgeConfig(mode, resolvedTargetApps);
  }, [lightImpact, setTargetMode, resolvedTargetApps, pushTargetBridgeConfig]);

  const handleToggleTargetApp = useCallback((packageName: string) => {
    lightImpact();
    const nextApps = resolvedTargetApps.map(app =>
      app.packageName === packageName ? { ...app, enabled: !app.enabled } : app
    );
    setTargetApps(nextApps);
    pushTargetBridgeConfig(targetMode, nextApps);
  }, [lightImpact, resolvedTargetApps, setTargetApps, targetMode, pushTargetBridgeConfig]);

  const handleAddCustomTargetApp = useCallback((app: InstalledAppItem) => {
    lightImpact();
    const existing = resolvedTargetApps.find(item => item.packageName === app.packageName);
    let nextApps: TargetAppItem[];
    if (existing) {
      nextApps = resolvedTargetApps.map(item =>
        item.packageName === app.packageName
          ? { ...item, enabled: true, name: app.name, source: item.source }
          : item
      );
    } else {
      nextApps = [
        ...resolvedTargetApps,
        {
          id: `custom-${app.packageName}`,
          name: app.name,
          packageName: app.packageName,
          enabled: true,
          source: 'custom',
          riskTag: undefined,
        },
      ];
    }
    setTargetApps(nextApps);
    pushTargetBridgeConfig(targetMode, nextApps);
  }, [lightImpact, resolvedTargetApps, setTargetApps, pushTargetBridgeConfig, targetMode]);

  const handleAddManualSystemTarget = useCallback(async () => {
    const packageName = manualPackageInput.trim();
    if (!PACKAGE_NAME_REGEX.test(packageName)) {
      Alert.alert(
        'Invalid Package Name',
        'Package name must match [a-zA-Z0-9._]+ and contain no spaces.'
      );
      return;
    }

    setManualLookupLoading(true);
    let metadata: PackageMetadata;
    try {
      metadata = await lookupPackageMetadata(packageName);
    } catch (err: unknown) {
      setManualLookupLoading(false);
      Alert.alert(
        'Lookup Failed',
        err instanceof Error ? err.message : 'Unable to resolve package metadata'
      );
      return;
    }
    setManualLookupLoading(false);

    const resolvedName = metadata.name || packageName;
    const installDetail = metadata.installed
      ? `Installed as "${resolvedName}" (${metadata.systemApp ? 'System app' : 'User app'}).`
      : 'Package is not currently installed; it will be saved as a manual custom entry.';

    Alert.alert(
      'Add System App Target',
      `Manual system targeting can cause lag, camera instability, or app crashes.\n\n${installDetail}\n\nProceed only if this package is intentionally scoped in LSPosed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add with Precaution',
          style: 'destructive',
          onPress: () => {
            lightImpact();
            const existing = resolvedTargetApps.find(item => item.packageName === packageName);
            let nextApps: TargetAppItem[];
            if (existing) {
              nextApps = resolvedTargetApps.map(item =>
                item.packageName === packageName
                  ? {
                      ...item,
                      enabled: true,
                      name: resolvedName,
                      source: item.source === 'preset' ? 'preset' : 'system_manual',
                      riskTag: item.source === 'preset' ? undefined : 'system_manual',
                    }
                  : item
              );
            } else {
              nextApps = [
                ...resolvedTargetApps,
                {
                  id: `system-manual-${packageName}`,
                  name: resolvedName,
                  packageName,
                  enabled: true,
                  source: 'system_manual',
                  riskTag: 'system_manual',
                },
              ];
            }

            setTargetApps(nextApps);
            pushTargetBridgeConfig(targetMode, nextApps);
            setManualPackageInput('');
            setIsManualPickerVisible(false);
          },
        },
      ]
    );
  }, [
    manualPackageInput,
    lookupPackageMetadata,
    lightImpact,
    resolvedTargetApps,
    setTargetApps,
    pushTargetBridgeConfig,
    targetMode,
  ]);

  const handleRemoveTargetApp = useCallback((packageName: string) => {
    lightImpact();
    const nextApps = resolvedTargetApps.filter(app => app.packageName !== packageName);
    setTargetApps(nextApps);
    pushTargetBridgeConfig(targetMode, nextApps);
  }, [lightImpact, resolvedTargetApps, setTargetApps, targetMode, pushTargetBridgeConfig]);

  const handleRunDiagnostics = useCallback(async () => {
    setIsRunningDiagnostics(true);
    setDiagnosticsChecks([]);
    setDiagnosticsReport(null);
    setRawXposedDebug(null);
    mediumImpact();

    try {
      const report = await runDiagnostics((check, index) => {
        setDiagnosticsChecks(prev => {
          const updated = [...prev];
          updated[index] = check;
          return updated;
        });
      });
      setDiagnosticsReport(report);
      const rawDebug = await getRawXposedDebugInfo();
      setRawXposedDebug(rawDebug);
      if (report.failCount === 0) {
        success();
      } else {
        warning();
      }
    } catch {
      warning();
      Alert.alert('Diagnostics Error', 'Failed to run diagnostics.');
    } finally {
      setIsRunningDiagnostics(false);
    }
  }, [mediumImpact, success, warning]);

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
                    'All settings have been reset to defaults and verified successfully. Please restart the app for changes to take full effect.'
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
            } catch (err: unknown) {
              warning();
              Alert.alert('Reset Error', err instanceof Error ? err.message : 'An unexpected error occurred.');
            } finally {
              setIsResetting(false);
            }
          },
        },
      ]
    );
  }, [heavyImpact, success, warning]);

  const COLOR_MODES: { key: ColorMode; label: string; icon: string }[] = [
    { key: 'day', label: 'Day', icon: 'sunny' },
    { key: 'system', label: 'Auto', icon: 'phone-portrait' },
    { key: 'dark', label: 'Dark', icon: 'moon' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(100).duration(500)}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Settings</Text>
        <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
          Appearance, permissions, and system options
        </Text>
      </Animated.View>

      {/* Appearance Section */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(130).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={16} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Appearance</Text>
        </View>

        <Card>
          {/* Color Mode picker */}
          <View style={styles.colorModeRow}>
            <View style={styles.colorModeLabel}>
              <Ionicons name="contrast-outline" size={18} color={colors.textSecondary} />
              <View style={styles.colorModeLabelText}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Color Mode</Text>
                <Text style={[styles.rowSublabel, { color: colors.textTertiary }]}>
                  {colorMode === 'system' ? 'Follows system theme' : colorMode === 'dark' ? 'Always dark' : 'Always light'}
                </Text>
              </View>
            </View>
            <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceLighter, borderColor: colors.border }]}>
              {COLOR_MODES.map(({ key, label, icon }) => {
                const active = colorMode === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      lightImpact();
                      setColorMode(key);
                    }}
                    style={[
                      styles.segment,
                      active && {
                        backgroundColor: colors.accent,
                        ...(isPerformance ? {} : platformShadow(colors.accent, 2, 6, 0.3, 3)),
                      },
                    ]}
                  >
                    <Ionicons
                      name={icon as keyof typeof Ionicons.glyphMap}
                      size={13}
                      color={active ? '#FFFFFF' : colors.textTertiary}
                    />
                    <Text
                      style={[
                        styles.segmentLabel,
                        { color: active ? '#FFFFFF' : colors.textTertiary },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.separator }]} />

          {/* Performance Mode toggle */}
          <Pressable
            onPress={() => {
              mediumImpact();
              setPerformanceMode(!performanceMode);
            }}
            style={styles.perfRow}
          >
            <View style={[styles.perfIconWrap, { backgroundColor: performanceMode ? colors.accent + '20' : colors.surfaceLight }]}>
              <Ionicons
                name="flash"
                size={18}
                color={performanceMode ? colors.accent : colors.textSecondary}
              />
            </View>
            <View style={styles.perfTextWrap}>
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Performance Mode</Text>
              <Text style={[styles.rowSublabel, { color: colors.textTertiary }]}>
                Disables blur, animations &amp; transparency for maximum speed
              </Text>
            </View>
            <Switch
              value={performanceMode}
              onValueChange={val => {
                mediumImpact();
                setPerformanceMode(val);
              }}
              trackColor={{
                false: colors.surfaceLighter,
                true: colors.accent,
              }}
              thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
              ios_backgroundColor={colors.surfaceLighter}
              style={Platform.OS === 'web' ? { height: 24, width: 44 } : undefined}
            />
          </Pressable>
        </Card>
      </Animated.View>

      {/* LSPosed Notice */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(160).duration(500)}>
        <Card style={styles.lsposedNoticeCard}>
          <View style={styles.lsposedNoticeRow}>
            <View style={[styles.lsposedIcon, { backgroundColor: colors.electricBlue + '18' }]}>
              <MaterialCommunityIcons name="puzzle-outline" size={20} color={colors.electricBlue} />
            </View>
            <View style={styles.lsposedNoticeText}>
              <Text style={[styles.lsposedNoticeTitle, { color: colors.textPrimary }]}>App Targeting via LSPosed</Text>
              <Text style={[styles.lsposedNoticeDesc, { color: colors.textSecondary }]}>
                Per-app hook scope is managed in LSPosed Manager → Modules → VirtuCam → Scope.
                Enable only the apps you want the virtual camera feed injected into.
              </Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      {/* Target Apps */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(180).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="apps-outline" size={16} color={colors.electricBlue} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Target Apps</Text>
        </View>
        <Card>
          <Text style={[styles.targetSectionDesc, { color: colors.textSecondary }]}>
            Optional local app filter for VirtuCam config. LSPosed scope remains the final authority.
          </Text>

          <View style={[styles.targetModePills, { backgroundColor: colors.surfaceLighter, borderColor: colors.border }]}>
            {([
              ['all', 'All'],
              ['whitelist', 'Whitelist'],
              ['blacklist', 'Blacklist'],
            ] as Array<[TargetMode, string]>).map(([mode, label]) => {
              const active = targetMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => handleTargetModeChange(mode)}
                  style={[
                    styles.targetModePill,
                    active && {
                      backgroundColor: colors.electricBlue,
                      ...(isPerformance ? {} : platformShadow(colors.electricBlue, 2, 6, 0.25, 2)),
                    },
                  ]}
                >
                  <Text style={[styles.targetModePillText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.targetActionsRow}>
            <Text style={[styles.targetActionsHint, { color: colors.textTertiary }]}>
              {enabledTargetApps.length} enabled app{enabledTargetApps.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.targetActionButtons}>
            <Pressable
              onPress={() => void handleOpenAddAppPicker()}
              style={[styles.addAppButton, { backgroundColor: colors.electricBlue + '18', borderColor: colors.electricBlue + '35' }]}
            >
              {pickerLoading ? (
                <ActivityIndicator size="small" color={colors.electricBlue} />
              ) : (
                <Ionicons name="add-circle-outline" size={15} color={colors.electricBlue} />
              )}
              <Text style={[styles.addAppButtonText, { color: colors.electricBlue }]}>Add Application</Text>
            </Pressable>
            <Pressable
              onPress={handleOpenManualPicker}
              style={[styles.addAppButton, { backgroundColor: colors.warningAmber + '18', borderColor: colors.warningAmber + '35' }]}
            >
              <Ionicons name="shield-outline" size={15} color={colors.warningAmber} />
              <Text style={[styles.addAppButtonText, { color: colors.warningAmber }]}>Add System App</Text>
            </Pressable>
          </View>

          <View style={[styles.scopeAlertBox, { backgroundColor: colors.warningAmber + '14', borderColor: colors.warningAmber + '35' }]}>
            <Ionicons name="warning-outline" size={14} color={colors.warningAmber} />
            <Text style={[styles.scopeAlertText, { color: colors.warningAmber }]}>
              System app targeting is manual allowlist only. Add exact package names and scope them in LSPosed with caution.
            </Text>
          </View>

          {broadScopePackages.length > 0 && (
            <View style={[styles.scopeAlertBox, { backgroundColor: colors.warningAmber + '18', borderColor: colors.warningAmber + '40' }]}>
              <Ionicons name="warning-outline" size={14} color={colors.warningAmber} />
              <Text style={[styles.scopeAlertText, { color: colors.warningAmber }]}>
                Broad LSPosed scope entries detected ({broadScopePackages.join(', ')}). This can cause lag/hangs.
              </Text>
            </View>
          )}

          {scopeMismatchDetail.length > 0 && (
            <View style={[styles.scopeAlertBox, { backgroundColor: colors.danger + '14', borderColor: colors.danger + '35' }]}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
              <Text style={[styles.scopeAlertText, { color: colors.danger }]}>{scopeMismatchDetail}</Text>
            </View>
          )}

          {rawXposedDebug && (
            <>
              <Text style={[styles.scopeMeta, { color: colors.textTertiary }]}>
                Scope reason: {rawXposedDebug.scopeEvaluationReason} | Mapping: {rawXposedDebug.mappingHint}
              </Text>
              {rawXposedDebug.latestZeroReason.toLowerCase().includes('enabled=false') && (
                <Text style={[styles.scopeMeta, { color: colors.warningAmber }]}>
                  {rawXposedDebug.quickFixHint}
                </Text>
              )}
            </>
          )}

          {resolvedTargetApps.length === 0 ? (
            <View style={styles.emptyTargetApps}>
              <Text style={[styles.emptyTargetAppsText, { color: colors.textTertiary }]}>No target apps configured.</Text>
            </View>
          ) : (
            resolvedTargetApps.map((app, index) => {
              const isCustom = app.source === 'custom';
              const isManualSystem = app.source === 'system_manual';
              const isRemovable = app.source !== 'preset';
              const badgeBg = isManualSystem
                ? colors.warningAmber + '20'
                : isCustom
                  ? colors.cyan + '20'
                  : colors.surfaceLight;
              const badgeBorder = isManualSystem
                ? colors.warningAmber + '40'
                : isCustom
                  ? colors.cyan + '40'
                  : colors.border;
              const badgeText = isManualSystem
                ? colors.warningAmber
                : isCustom
                  ? colors.cyan
                  : colors.textTertiary;
              const badgeLabel = isManualSystem ? 'System (Manual)' : isCustom ? 'Custom' : 'Preset';
              return (
                <View
                  key={app.packageName}
                  style={[
                    styles.targetAppRow,
                    index < resolvedTargetApps.length - 1 && {
                      borderBottomColor: colors.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View style={styles.targetAppInfo}>
                    <View style={styles.targetAppTitleRow}>
                      <Text style={[styles.targetAppName, { color: colors.textPrimary }]}>{app.name}</Text>
                      <View
                        style={[
                          styles.targetSourceBadge,
                          {
                            backgroundColor: badgeBg,
                            borderColor: badgeBorder,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.targetSourceBadgeText,
                            { color: badgeText },
                          ]}
                        >
                          {badgeLabel}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.targetAppPkg, { color: colors.textTertiary }]}>{app.packageName}</Text>
                  </View>
                  <View style={styles.targetRowActions}>
                    {isRemovable && (
                      <Pressable
                        onPress={() => handleRemoveTargetApp(app.packageName)}
                        style={[styles.removeAppButton, { borderColor: colors.danger + '40', backgroundColor: colors.danger + '12' }]}
                      >
                        <Ionicons name="trash-outline" size={13} color={colors.danger} />
                      </Pressable>
                    )}
                    <Switch
                      value={app.enabled}
                      onValueChange={() => handleToggleTargetApp(app.packageName)}
                      trackColor={{ false: colors.inactive, true: colors.electricBlue + '60' }}
                      thumbColor={app.enabled ? colors.electricBlue : colors.textTertiary}
                      disabled={targetMode === 'all'}
                    />
                  </View>
                </View>
              );
            })
          )}
        </Card>
      </Animated.View>

      <Modal
        visible={isPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsPickerVisible(false)}
      >
        <View style={styles.pickerBackdrop}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Add Application</Text>
              <Pressable onPress={() => setIsPickerVisible(false)} style={styles.pickerCloseButton}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="Search name or package"
              placeholderTextColor={colors.textTertiary}
              style={[styles.pickerSearchInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceLight }]}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {pickerLoading ? (
              <View style={styles.pickerLoading}>
                <ActivityIndicator size="small" color={colors.electricBlue} />
                <Text style={[styles.pickerLoadingText, { color: colors.textSecondary }]}>Scanning installed apps...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredInstalledApps}
                keyExtractor={item => item.packageName}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const alreadyAdded = resolvedTargetApps.some(app => app.packageName === item.packageName);
                  return (
                    <Pressable
                      onPress={() => {
                        handleAddCustomTargetApp(item);
                        setIsPickerVisible(false);
                      }}
                      style={[styles.pickerAppRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={styles.pickerAppInfo}>
                        <Text style={[styles.pickerAppName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[styles.pickerAppPackage, { color: colors.textTertiary }]} numberOfLines={1}>
                          {item.packageName}
                        </Text>
                      </View>
                      <Text style={[styles.pickerAppAction, { color: alreadyAdded ? colors.warningAmber : colors.electricBlue }]}>
                        {alreadyAdded ? 'Enable' : 'Add'}
                      </Text>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.pickerEmpty}>
                    <Text style={[styles.pickerEmptyText, { color: colors.textTertiary }]}>
                      No matching apps found.
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={isManualPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsManualPickerVisible(false)}
      >
        <View style={styles.pickerBackdrop}>
          <View style={[styles.manualSheet, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Add System App (Manual)</Text>
              <Pressable onPress={() => setIsManualPickerVisible(false)} style={styles.pickerCloseButton}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={[styles.scopeAlertBox, { backgroundColor: colors.warningAmber + '14', borderColor: colors.warningAmber + '35' }]}>
              <Ionicons name="warning-outline" size={14} color={colors.warningAmber} />
              <Text style={[styles.scopeAlertText, { color: colors.warningAmber }]}>
                Add only exact package names. Manual system entries can increase lag or break camera behavior in scoped apps.
              </Text>
            </View>

            <TextInput
              value={manualPackageInput}
              onChangeText={setManualPackageInput}
              placeholder="e.g. com.android.camera"
              placeholderTextColor={colors.textTertiary}
              style={[styles.pickerSearchInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceLight }]}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.manualHint, { color: manualPackageTrimmed.length === 0 || manualPackageValid ? colors.textTertiary : colors.danger }]}>
              Allowed format: [a-zA-Z0-9._]+
            </Text>

            <View style={styles.manualActionsRow}>
              <Pressable
                onPress={() => setIsManualPickerVisible(false)}
                style={[styles.manualActionButton, { borderColor: colors.border, backgroundColor: colors.surfaceLight }]}
              >
                <Text style={[styles.manualActionText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleAddManualSystemTarget()}
                disabled={!manualPackageValid || manualLookupLoading}
                style={[
                  styles.manualActionButton,
                  {
                    borderColor: colors.warningAmber + '40',
                    backgroundColor: manualPackageValid ? colors.warningAmber + '18' : colors.surfaceLighter,
                    opacity: manualPackageValid ? 1 : 0.65,
                  },
                ]}
              >
                {manualLookupLoading ? (
                  <ActivityIndicator size="small" color={colors.warningAmber} />
                ) : (
                  <Text style={[styles.manualActionText, { color: colors.warningAmber }]}>Validate and Add</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Permissions Section */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(200).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="shield-checkmark" size={16} color={colors.electricBlue} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>System Permissions</Text>
        </View>
        <Card>
          <PermissionRow
            icon="camera-outline"
            label="Camera Access"
            description="Required to intercept camera feed"
            granted={systemStatus.cameraPermission.status === 'ok'}
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
            granted={systemStatus.overlayPermission.status === 'ok'}
            onRequest={() => handleRequestPermission('overlay')}
            last
          />
        </Card>
      </Animated.View>

      {/* App Info */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(300).duration(500)}>
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>About VirtuCam</Text>
        </View>
        <Card>
          <View style={styles.aboutHeader}>
            <View style={[styles.aboutLogoContainer, { backgroundColor: colors.electricBlue + '18', borderColor: colors.electricBlue + '30' }]}>
              <MaterialCommunityIcons name="camera-iris" size={36} color={colors.electricBlue} />
            </View>
            <View style={styles.aboutHeaderInfo}>
              <Text style={[styles.aboutAppName, { color: colors.textPrimary }]}>VirtuCam</Text>
              <Text style={[styles.aboutAppTagline, { color: colors.textTertiary }]}>Virtual Camera Engine for Android</Text>
            </View>
          </View>

          <View style={[styles.aboutDivider, { backgroundColor: colors.border }]} />

          <AboutRow label="Version" value="1.0.0" />
          <AboutRow label="Build" value={`${Platform.OS} ${Platform.Version}`} />
          <AboutRow label="Hook Engine" value="Camera2 API Interceptor" />
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Framework</Text>
            <Text style={[styles.aboutValue, { color: getStatusColor(systemStatus.xposedFramework.status) }]}>
              {systemStatus.xposedFramework.detail}
            </Text>
          </View>
          <AboutRow label="Target SDK" value="Android 10 – 16" />
          <AboutRow label="Developer" value="ggSetRanges" last />

          <View style={styles.aboutLinks}>
            <Pressable
              style={[styles.aboutLinkButton, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
              onPress={() => Linking.openURL('https://github.com/ggsetRanges/virtucam')}
            >
              <Ionicons name="logo-github" size={16} color={colors.textSecondary} />
              <Text style={[styles.aboutLinkText, { color: colors.textSecondary }]}>Source Code</Text>
            </Pressable>
            <Pressable
              style={[styles.aboutLinkButton, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
              onPress={() => Linking.openURL('https://github.com/ggsetRanges/virtucam/issues')}
            >
              <Ionicons name="bug-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.aboutLinkText, { color: colors.textSecondary }]}>Report Issue</Text>
            </Pressable>
          </View>
        </Card>
      </Animated.View>

      {/* Diagnostics */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(400).duration(500)}>
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <Ionicons name="document-text-outline" size={16} color={colors.electricBlue} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Diagnostics</Text>
        </View>
        <Card>
          <Pressable
            onPress={handleRunDiagnostics}
            disabled={isRunningDiagnostics}
            style={[styles.aboutRow, { borderBottomColor: colors.border }, diagnosticsReport ? {} : { borderBottomWidth: 0 }]}
          >
            <View style={styles.logsButtonContent}>
              {isRunningDiagnostics ? (
                <ActivityIndicator size={14} color={colors.accent} />
              ) : (
                <Ionicons name="pulse" size={16} color={colors.accent} />
              )}
              <Text style={[styles.aboutLabel, { color: colors.accent }]}>
                {isRunningDiagnostics ? 'Running Diagnostics...' : 'Run Diagnostics'}
              </Text>
            </View>
            {!isRunningDiagnostics && (
              <Ionicons name="play-circle" size={18} color={colors.accent} />
            )}
          </Pressable>

          {diagnosticsChecks.length > 0 &&
            diagnosticsChecks.map((check, i) => {
              const color =
                check.status === 'pass'
                  ? colors.success
                  : check.status === 'fail'
                    ? colors.danger
                    : colors.warningAmber;
              const icon =
                check.status === 'pass'
                  ? 'checkmark-circle'
                  : check.status === 'fail'
                    ? 'close-circle'
                    : 'alert-circle';
              const bgColor = color + '20';
              return (
                <View
                  key={i}
                  style={[
                    styles.permissionRow,
                    i < diagnosticsChecks.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.permissionIcon, { backgroundColor: bgColor }]}>
                    <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={color} />
                  </View>
                  <View style={styles.permissionInfo}>
                    <Text style={[styles.permissionLabel, { color: colors.textPrimary }]}>{check.name}</Text>
                    <Text style={[styles.permissionDesc, { color: colors.textTertiary }]}>{check.detail}</Text>
                  </View>
                  <View style={[styles.permissionBadge, { backgroundColor: bgColor }]}>
                    <Text style={[styles.permissionBadgeText, { color }]}>
                      {check.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              );
            })}

          {diagnosticsReport && (
            <View style={styles.diagnosticsSummary}>
              <Text style={[styles.diagnosticsPassText, { color: colors.success }]}>
                ✓ {diagnosticsReport.passCount} Passed
              </Text>
              <Text style={[styles.diagnosticsFailText, { color: colors.danger }]}>
                ✗ {diagnosticsReport.failCount} Failed
              </Text>
              <Text style={[styles.diagnosticsWarnText, { color: colors.warningAmber }]}>
                ⚠ {diagnosticsReport.warnCount} Warnings
              </Text>
            </View>
          )}

          {rawXposedDebug && (
            <View style={styles.rawDebugBox}>
              <Text style={styles.rawDebugTitle}>Raw Detection Debug</Text>
              <Text style={styles.rawDebugLine}>detectionMethod: {rawXposedDebug.detectionMethod}</Text>
              <Text style={styles.rawDebugLine}>markerSource: {rawXposedDebug.markerSource}</Text>
              <Text style={styles.rawDebugLine}>
                scopeEvaluationReason: {rawXposedDebug.scopeEvaluationReason}
              </Text>
              <Text style={styles.rawDebugLine}>
                lsposedPath: {rawXposedDebug.lsposedPath || '(empty)'}
              </Text>
              <Text style={styles.rawDebugLine}>
                configuredTargets: {rawXposedDebug.configuredTargets || '(none)'}
              </Text>
              <Text style={styles.rawDebugLine}>
                scopedTargets: {rawXposedDebug.scopedTargets || '(none)'}
              </Text>
              <Text style={styles.rawDebugLine}>
                targetCount: {rawXposedDebug.scopedTargetsCount}/{rawXposedDebug.configuredTargetsCount}
              </Text>
              <Text style={styles.rawDebugLine}>
                moduleLoaded={String(rawXposedDebug.moduleLoaded)} | moduleScoped={String(rawXposedDebug.moduleScoped)}
              </Text>
              <Text style={styles.rawDebugLine}>
                hookConfigured={String(rawXposedDebug.hookConfigured)} | hookReady={String(rawXposedDebug.hookReady)}
              </Text>
              <Text style={styles.rawDebugLine}>
                broadScope={String(rawXposedDebug.broadScopeDetected)} {rawXposedDebug.broadScopePackages || ''}
              </Text>
              <Text style={styles.rawDebugLine}>
                mappingHint: {rawXposedDebug.mappingHint}
              </Text>
              <Text style={styles.rawDebugHint}>
                {rawXposedDebug.quickFixHint}
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => router.push('/logs' as Href)}
            style={styles.logsLink}
          >
            <View style={styles.logsButtonContent}>
              <Ionicons name="document-text" size={16} color={colors.electricBlue} />
              <Text style={[styles.logsLinkText, { color: colors.electricBlue }]}>
                View Diagnostic Logs
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.electricBlue} />
          </Pressable>
        </Card>
      </Animated.View>

      {/* Reset */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(500).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="refresh" size={16} color={colors.danger} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Reset Settings</Text>
        </View>
        <Card>
          <View style={styles.resetSection}>
            <View style={styles.resetInfo}>
              <Text style={[styles.resetTitle, { color: colors.textPrimary }]}>Reset to Default Settings</Text>
              <Text style={[styles.resetDesc, { color: colors.textSecondary }]}>
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
                isResetting ? undefined : (
                  <Ionicons name="refresh" size={16} color={colors.textPrimary} />
                )
              }
            />
          </View>
        </Card>
      </Animated.View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function AboutRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.aboutRow, { borderBottomColor: colors.border }, last && { borderBottomWidth: 0 }]}>
      <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.aboutValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
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
  const { colors } = useTheme();
  const statusColor = granted ? colors.electricBlue : colors.warningAmber;

  return (
    <Pressable
      onPress={!granted ? onRequest : undefined}
      style={[
        styles.permissionRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.permissionIcon, { backgroundColor: statusColor + '20' }]}>
        <Ionicons name={icon} size={18} color={statusColor} />
      </View>
      <View style={styles.permissionInfo}>
        <Text style={[styles.permissionLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.permissionDesc, { color: colors.textTertiary }]}>{description}</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  screenTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  screenSubtitle: {
    fontSize: FontSize.md,
    marginTop: 4,
    marginBottom: Spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flex: 1,
  },
  colorModeRow: {
    flexDirection: 'column',
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  colorModeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  colorModeLabelText: {
    flex: 1,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  segmentLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.md,
  },
  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  perfIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perfTextWrap: {
    flex: 1,
  },
  rowLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  rowSublabel: {
    fontSize: FontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  lsposedNoticeCard: {
    marginBottom: Spacing.lg,
  },
  lsposedNoticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  lsposedIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lsposedNoticeText: {
    flex: 1,
  },
  lsposedNoticeTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 4,
  },
  lsposedNoticeDesc: {
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  targetSectionDesc: {
    fontSize: FontSize.sm,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  targetModePills: {
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 3,
    marginBottom: Spacing.sm,
  },
  targetModePill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    paddingVertical: 8,
  },
  targetModePillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  targetAppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  targetAppInfo: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  targetAppName: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  targetAppPkg: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  targetActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  targetActionsHint: {
    fontSize: FontSize.xs,
    flex: 1,
  },
  targetActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  addAppButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    flex: 1,
    justifyContent: 'center',
  },
  addAppButtonText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  scopeAlertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  scopeAlertText: {
    flex: 1,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  scopeMeta: {
    fontSize: FontSize.xs,
    marginBottom: Spacing.sm,
    lineHeight: 16,
  },
  emptyTargetApps: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTargetAppsText: {
    fontSize: FontSize.sm,
  },
  targetAppTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  targetSourceBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
  },
  targetSourceBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  targetRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  removeAppButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '82%',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  manualSheet: {
    marginHorizontal: Spacing.lg,
    marginTop: '28%',
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.md,
  },
  pickerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  pickerCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSearchInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    fontSize: FontSize.sm,
  },
  pickerLoading: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pickerLoadingText: {
    fontSize: FontSize.sm,
  },
  pickerAppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  pickerAppInfo: {
    flex: 1,
  },
  pickerAppName: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  pickerAppPackage: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  pickerAppAction: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  pickerEmpty: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerEmptyText: {
    fontSize: FontSize.sm,
  },
  manualHint: {
    fontSize: FontSize.xs,
    marginBottom: Spacing.md,
  },
  manualActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  manualActionButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  manualActionText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
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
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  permissionDesc: {
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  aboutHeaderInfo: {
    flex: 1,
  },
  aboutAppName: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  aboutAppTagline: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  aboutDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.md,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aboutLabel: {
    fontSize: FontSize.md,
  },
  aboutValue: {
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
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  aboutLinkText: {
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
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  resetDesc: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  logsButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  logsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  logsLinkText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  diagnosticsSummary: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  diagnosticsPassText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  diagnosticsFailText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  diagnosticsWarnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  rawDebugBox: {
    marginTop: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  rawDebugTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  rawDebugLine: {
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  rawDebugHint: {
    marginTop: Spacing.xs,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
});
