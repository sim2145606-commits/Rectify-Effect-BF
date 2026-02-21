import React, { useState, useCallback, useEffect } from 'react';
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
  AppState,
  type AppStateStatus,
} from 'react-native';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import {
  runDiagnostics,
  type DiagnosticsReport,
  type DiagnosticCheckResult,
} from '@/services/DiagnosticsService';
import {
  requestCameraPermission,
  requestAllFilesAccess,
  requestOverlayPermission,
} from '@/services/PermissionManager';
import { getStatusColor } from '@/services/SystemVerification';
import { resetToDefaults } from '@/services/ResetService';
import Card from '@/components/Card';
import GlowButton from '@/components/GlowButton';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lightImpact, mediumImpact, success, warning, heavyImpact } = useHaptics();

  const { status: systemStatus, refresh: refreshSystemStatus } = useSystemStatus();

  // Diagnostics state
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [diagnosticsReport, setDiagnosticsReport] = useState<DiagnosticsReport | null>(null);
  const [diagnosticsChecks, setDiagnosticsChecks] = useState<DiagnosticCheckResult[]>([]);
  const [isResetting, setIsResetting] = useState(false);

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
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void refreshSystemStatus();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [refreshSystemStatus]);

  const handleRunDiagnostics = useCallback(async () => {
    setIsRunningDiagnostics(true);
    setDiagnosticsChecks([]);
    setDiagnosticsReport(null);
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
      'This will reset ALL settings to their default values. Your permissions and onboarding status will be preserved. This action cannot be undone.\\n\\nAre you sure?',
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)}> 
        <Text style={styles.screenTitle}>Settings</Text>
        <Text style={styles.screenSubtitle}>
          Configure permissions and system options
        </Text>
      </Animated.View>

      {/* LSPosed Notice */}
      <Animated.View entering={FadeInDown.delay(150).duration(500)}>
        <Card style={styles.lsposedNoticeCard}>
          <View style={styles.lsposedNoticeRow}>
            <View style={[styles.lsposedIcon, { backgroundColor: Colors.electricBlue + '15' }]}>
              <MaterialCommunityIcons name="puzzle-outline" size={20} color={Colors.electricBlue} />
            </View>
            <View style={styles.lsposedNoticeText}>
              <Text style={styles.lsposedNoticeTitle}>App Targeting via LSPosed</Text>
              <Text style={styles.lsposedNoticeDesc}>
                Per-app hook scope is managed in LSPosed Manager → Modules → VirtuCam → Scope.
                Enable only the apps you want the virtual camera feed injected into.
              </Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      {/* Permissions Section */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.electricBlue} />
          <Text style={styles.sectionTitle}>System Permissions</Text>
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
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>About VirtuCam</Text>
        </View>
        <Card>
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
      <Animated.View entering={FadeInDown.delay(400).duration(500)}>
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <Ionicons name="document-text-outline" size={18} color={Colors.electricBlue} />
          <Text style={styles.sectionTitle}>Diagnostics</Text>
        </View>
        <Card>
          <Pressable
            onPress={handleRunDiagnostics}
            disabled={isRunningDiagnostics}
            style={[styles.aboutRow, diagnosticsReport ? {} : { borderBottomWidth: 0 }]}
          >
            <View style={styles.logsButtonContent}>
              {isRunningDiagnostics ? (
                <ActivityIndicator size={14} color={Colors.accent} />
              ) : (
                <Ionicons name="pulse" size={16} color={Colors.accent} />
              )}
              <Text style={[styles.aboutLabel, { color: Colors.accent }]}>
                {isRunningDiagnostics ? 'Running Diagnostics...' : 'Run Diagnostics'}
              </Text>
            </View>
            {!isRunningDiagnostics && (
              <Ionicons name="play-circle" size={18} color={Colors.accent} />
            )}
          </Pressable>

          {diagnosticsChecks.length > 0 &&
            diagnosticsChecks.map((check, i) => {
              const color =
                check.status === 'pass'
                  ? Colors.success
                  : check.status === 'fail'
                    ? Colors.danger
                    : Colors.warningAmber;
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
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.border,
                    },
                  ]}
                >
                  <View style={[styles.permissionIcon, { backgroundColor: bgColor }]}>
                    <Ionicons name={icon} size={18} color={color} />
                  </View>
                  <View style={styles.permissionInfo}>
                    <Text style={styles.permissionLabel}>{check.name}</Text>
                    <Text style={styles.permissionDesc}>{check.detail}</Text>
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
              <Text style={styles.diagnosticsPassText}>
                ✓ {diagnosticsReport.passCount} Passed
              </Text>
              <Text style={styles.diagnosticsFailText}>
                ✗ {diagnosticsReport.failCount} Failed
              </Text>
              <Text style={styles.diagnosticsWarnText}>
                ⚠ {diagnosticsReport.warnCount} Warnings
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => router.push('/logs' as Href)}
            style={styles.logsLink}
          >
            <View style={styles.logsButtonContent}>
              <Ionicons name="document-text" size={16} color={Colors.electricBlue} />
              <Text style={styles.logsLinkText}>
                View Diagnostic Logs
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.electricBlue} />
          </Pressable>
        </Card>
      </Animated.View>

      {/* Reset to Defaults */}
      <Animated.View entering={FadeInDown.delay(500).duration(500)}>
        <View style={styles.resetSectionHeader}>
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
                isResetting ? undefined : (
                  <Ionicons name="refresh" size={16} color={Colors.textPrimary} />
                )
              }
            />
          </View>
        </Card>
      </Animated.View>

      <View style={{ height: 40 }} />
    </ScrollView>
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
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 4,
  },
  lsposedNoticeDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 18,
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
    height: 1,
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
  diagnosticsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.sm,
  },
  diagnosticsPassText: {
    color: Colors.success,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  diagnosticsFailText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  diagnosticsWarnText: {
    color: Colors.warningAmber,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  logsLink: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 0,
  },
  logsLinkText: {
    color: Colors.electricBlue,
    fontSize: FontSize.md,
  },
  resetSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    marginTop: Spacing.xl,
  },
});
