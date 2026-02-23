import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
  Linking,
  Switch,
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

type TargetMode = 'all' | 'whitelist' | 'blacklist';
type TargetAppItem = {
  id: string;
  name: string;
  packageName: string;
  enabled: boolean;
};

const TARGET_APP_PRESETS: Array<Omit<TargetAppItem, 'enabled'>> = [
  { id: 'camera', name: 'Camera', packageName: 'com.android.camera' },
  { id: 'whatsapp', name: 'WhatsApp', packageName: 'com.whatsapp' },
  { id: 'telegram', name: 'Telegram', packageName: 'org.telegram.messenger' },
  { id: 'messenger', name: 'Messenger', packageName: 'com.facebook.orca' },
  { id: 'meet', name: 'Google Meet', packageName: 'com.google.android.apps.meetings' },
  { id: 'zoom', name: 'Zoom', packageName: 'us.zoom.videomeetings' },
];

function mergeTargetApps(stored: TargetAppItem[] | null | undefined): TargetAppItem[] {
  const safeStored = Array.isArray(stored) ? stored : [];
  return TARGET_APP_PRESETS.map(preset => {
    const existing = safeStored.find(app => app?.packageName === preset.packageName);
    return {
      ...preset,
      enabled: !!existing?.enabled,
    };
  });
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

  const resolvedTargetApps = useMemo(() => mergeTargetApps(targetApps), [targetApps]);

  const pushTargetBridgeConfig = useCallback((mode: TargetMode, apps: TargetAppItem[]) => {
    const enabledPackages = apps.filter(app => app.enabled).map(app => app.packageName);
    writeBridgeConfig({
      targetMode: mode,
      targetPackages: enabledPackages,
    }).catch(() => {});
  }, []);

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

          {resolvedTargetApps.map((app, index) => (
            <View
              key={app.packageName}
              style={[
                styles.targetAppRow,
                index < resolvedTargetApps.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <View style={styles.targetAppInfo}>
                <Text style={[styles.targetAppName, { color: colors.textPrimary }]}>{app.name}</Text>
                <Text style={[styles.targetAppPkg, { color: colors.textTertiary }]}>{app.packageName}</Text>
              </View>
              <Switch
                value={app.enabled}
                onValueChange={() => handleToggleTargetApp(app.packageName)}
                trackColor={{ false: colors.inactive, true: colors.electricBlue + '60' }}
                thumbColor={app.enabled ? colors.electricBlue : colors.textTertiary}
                disabled={targetMode === 'all'}
              />
            </View>
          ))}
        </Card>
      </Animated.View>

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
                moduleLoaded={String(rawXposedDebug.moduleLoaded)} | moduleScoped={String(rawXposedDebug.moduleScoped)}
              </Text>
              <Text style={styles.rawDebugLine}>
                hookConfigured={String(rawXposedDebug.hookConfigured)} | hookReady={String(rawXposedDebug.hookReady)}
              </Text>
              <Text style={styles.rawDebugHint}>
                Tip: if moduleLoaded=false after reboot, open a scoped target app once, then run diagnostics again.
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
