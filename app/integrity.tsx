import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';
import {
  getStatusColor,
  type SystemCheckStatus,
  runFullSystemCheck,
  type SystemVerificationState,
} from '@/services/SystemVerification';
import {
  getAndroidVersionInfo,
  type AndroidVersionInfo,
} from '@/services/CompatibilityEngine';
import { getCacheStats, type AICacheStats } from '@/services/AICacheService';
import { getSyncStatus } from '@/services/PresetService';
import { getBridgeStatus } from '@/services/ConfigBridge';
import PulseIndicator from '@/components/PulseIndicator';
import SuccessAnimation from '@/components/SuccessAnimation';

type ScanPhase = 'idle' | 'scanning' | 'complete' | 'failed';

type IntegrityCheck = {
  id: string;
  label: string;
  category: 'system' | 'hooking' | 'connectivity';
  status: SystemCheckStatus;
  detail: string;
  severity: 'critical' | 'important' | 'optional';
};

type HeartbeatStatus = {
  cloudSync: 'online' | 'offline' | 'checking';
  bridge: 'active' | 'inactive' | 'checking';
  lastPing: number;
};

export default function SystemIntegrity() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { heavyImpact, success, warning, mediumImpact, lightImpact } = useHaptics();
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [checks, setChecks] = useState<IntegrityCheck[]>([]);
  const [allVerified, setAllVerified] = useState(false);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [androidInfo, setAndroidInfo] = useState<AndroidVersionInfo | null>(null);
  const [cacheStats, setCacheStats] = useState<AICacheStats | null>(null);
  const [heartbeat, setHeartbeat] = useState<HeartbeatStatus>({
    cloudSync: 'checking',
    bridge: 'checking',
    lastPing: 0,
  });

  // Animations
  const headerGlow = useSharedValue(0);
  const scanPulse = useSharedValue(1);
  const progressAnim = useSharedValue(0);
  const verifiedGlow = useSharedValue(0);
  const heartbeatPulse = useSharedValue(1);

  useEffect(() => {
    headerGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    heartbeatPulse.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      true
    );
  }, [headerGlow, heartbeatPulse]);

  useEffect(() => {
    if (allVerified) {
      verifiedGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [allVerified, verifiedGlow]);

  const headerGlowStyle = useAnimatedStyle(() => ({
    opacity: headerGlow.value,
  }));

  const scanPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scanPulse.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value}%` as `${number}%`,
  }));

  const verifiedGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: verifiedGlow.value * 0.6,
    borderColor: allVerified
      ? `rgba(0, 230, 118, ${verifiedGlow.value * 0.5})`
      : Colors.border,
  }));

  const heartbeatPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartbeatPulse.value }],
  }));

  const checkHeartbeat = useCallback(async () => {
    setHeartbeat(prev => ({
      ...prev,
      cloudSync: 'checking',
      bridge: 'checking',
    }));

    try {
      const [syncStatus, bridgeStatus] = await Promise.all([
        getSyncStatus().catch(() => null),
        getBridgeStatus().catch(() => null),
      ]);

      setHeartbeat({
        cloudSync: syncStatus ? 'online' : 'offline',
        bridge: bridgeStatus?.exists ? 'active' : 'inactive',
        lastPing: Date.now(),
      });
    } catch {
      setHeartbeat(prev => ({
        ...prev,
        cloudSync: 'offline',
        bridge: 'inactive',
        lastPing: Date.now(),
      }));
    }
  }, []);

  // Load initial data
  useEffect(() => {
    const init = async () => {
      const info = getAndroidVersionInfo();
      setAndroidInfo(info);
      const stats = await getCacheStats();
      setCacheStats(stats);
      await checkHeartbeat();
    };
    init();
  }, [checkHeartbeat]);

  // Periodic heartbeat check
  useEffect(() => {
    const interval = setInterval(checkHeartbeat, 30000);
    return () => clearInterval(interval);
  }, [checkHeartbeat]);

  const runIntegrityScan = useCallback(async () => {
    setScanPhase('scanning');
    setScanProgress(0);
    setAllVerified(false);
    setShowSuccessAnim(false);
    heavyImpact();

    scanPulse.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 400 }),
        withTiming(1, { duration: 400 })
      ),
      -1,
      true
    );

    const integrityChecks: IntegrityCheck[] = [];

    // Phase 1: System checks (0-30%)
    progressAnim.value = withTiming(15, { duration: 600 });
    setScanProgress(15);
    await new Promise(r => setTimeout(r, 400));
    mediumImpact();

    let systemResult: SystemVerificationState;
    try {
      systemResult = await runFullSystemCheck();
    } catch {
      setScanPhase('failed');
      return;
    }

    progressAnim.value = withTiming(30, { duration: 400 });
    setScanProgress(30);

    integrityChecks.push(
      {
        id: 'root',
        label: 'Root Access (Superuser)',
        category: 'system',
        status: systemResult.rootAccess.status,
        detail: systemResult.rootAccess.detail,
        severity: 'critical',
      },
      {
        id: 'storage',
        label: 'Storage Permission',
        category: 'system',
        status: systemResult.storagePermission.status,
        detail: systemResult.storagePermission.detail,
        severity: 'important',
      },
      {
        id: 'overlay',
        label: 'System Overlay',
        category: 'system',
        status: systemResult.overlayPermission.status,
        detail: systemResult.overlayPermission.detail,
        severity: 'important',
      },
      {
        id: 'camera_service',
        label: 'Camera Service',
        category: 'system',
        status: systemResult.cameraService.status,
        detail: systemResult.cameraService.detail,
        severity: 'important',
      }
    );

    // Phase 2: Hooking Framework checks (30-60%)
    await new Promise(r => setTimeout(r, 300));
    progressAnim.value = withTiming(45, { duration: 400 });
    setScanProgress(45);
    lightImpact();

    integrityChecks.push(
      {
        id: 'xposed',
        label: 'LSPosed/Xposed Framework',
        category: 'hooking',
        status: systemResult.xposedFramework.status,
        detail: systemResult.xposedFramework.detail,
        severity: 'critical',
      },
      {
        id: 'module',
        label: 'VirtuCam Hook Module',
        category: 'hooking',
        status: systemResult.moduleActive.status,
        detail: systemResult.moduleActive.detail,
        severity: 'critical',
      }
    );

    progressAnim.value = withTiming(60, { duration: 400 });
    setScanProgress(60);
    await new Promise(r => setTimeout(r, 300));

    // Phase 3: Target App Hooking Health (60-80%)
    lightImpact();
    try {
      const targetAppsData = await AsyncStorage.getItem(STORAGE_KEYS.TARGET_APPS);
      const hookEnabled = await AsyncStorage.getItem(STORAGE_KEYS.HOOK_ENABLED);

      if (targetAppsData) {
        const apps = JSON.parse(targetAppsData);
        const enabledApps = Array.isArray(apps) ? apps.filter((a: { enabled: boolean }) => a.enabled) : [];

        integrityChecks.push({
          id: 'target_apps',
          label: `Target App Injection (${enabledApps.length} apps)`,
          category: 'hooking',
          status: enabledApps.length > 0 ? 'passed' : 'warning',
          detail: enabledApps.length > 0
            ? `${enabledApps.length} target app(s) configured for injection`
            : 'No target apps configured',
          severity: 'important',
        });
      } else {
        integrityChecks.push({
          id: 'target_apps',
          label: 'Target App Injection',
          category: 'hooking',
          status: 'warning',
          detail: 'No target apps configured yet',
          severity: 'important',
        });
      }

      integrityChecks.push({
        id: 'hook_status',
        label: 'Hook Engine Status',
        category: 'hooking',
        status: hookEnabled === 'true' ? 'passed' : 'warning',
        detail: hookEnabled === 'true' ? 'Camera hook is active and intercepting' : 'Camera hook is currently disabled',
        severity: 'important',
      });
    } catch {
      integrityChecks.push({
        id: 'target_apps',
        label: 'Target App Injection',
        category: 'hooking',
        status: 'warning',
        detail: 'Could not read target app configuration',
        severity: 'important',
      });
    }

    progressAnim.value = withTiming(80, { duration: 400 });
    setScanProgress(80);
    await new Promise(r => setTimeout(r, 300));

    // Phase 4: Connectivity checks (80-100%)
    mediumImpact();
    await checkHeartbeat();

    integrityChecks.push(
      {
        id: 'cloud_sync',
        label: 'Cloud Sync Service',
        category: 'connectivity',
        status: heartbeat.cloudSync === 'online' ? 'passed' : heartbeat.cloudSync === 'checking' ? 'checking' : 'warning',
        detail: heartbeat.cloudSync === 'online' ? 'Cloud sync service is reachable' : 'Cloud sync service unreachable',
        severity: 'optional',
      },
      {
        id: 'config_bridge',
        label: 'Config Bridge',
        category: 'connectivity',
        status: heartbeat.bridge === 'active' ? 'passed' : 'warning',
        detail: heartbeat.bridge === 'active' ? 'Bridge file synced and accessible' : 'Bridge file not found',
        severity: 'important',
      }
    );

    progressAnim.value = withTiming(100, { duration: 300 });
    setScanProgress(100);
    await new Promise(r => setTimeout(r, 200));

    scanPulse.value = withTiming(1, { duration: 200 });

    setChecks(integrityChecks);

    // Determine if all verified
    const criticalChecks = integrityChecks.filter(c => c.severity === 'critical');
    const importantChecks = integrityChecks.filter(c => c.severity === 'important');
    const criticalPassed = criticalChecks.every(c => c.status === 'passed' || c.status === 'unavailable');
    const importantPassed = importantChecks.every(c => c.status === 'passed' || c.status === 'unavailable');
    const verified = criticalPassed && importantPassed;

    setAllVerified(verified);
    setScanPhase('complete');

    if (verified) {
      success();
      setShowSuccessAnim(true);
    } else {
      warning();
    }

    // Save scan result
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.INTEGRITY_SCAN_RESULT, JSON.stringify({
        checks: integrityChecks,
        verified,
        timestamp: Date.now(),
      }));
      await AsyncStorage.setItem(STORAGE_KEYS.INTEGRITY_LAST_SCAN, Date.now().toString());
    } catch {
      // Non-critical
    }
  }, [heavyImpact, mediumImpact, lightImpact, success, warning, progressAnim, scanPulse, heartbeat, checkHeartbeat]);

  const generateSystemReport = useCallback(async () => {
    lightImpact();

    const now = new Date();
    const info = getAndroidVersionInfo();
    const stats = await getCacheStats();

    let report = '═══════════════════════════════════════\n';
    report += '  VIRTUCAM SYSTEM INTEGRITY REPORT\n';
    report += '═══════════════════════════════════════\n\n';
    report += `Generated: ${now.toISOString()}\n`;
    report += `Platform: Android ${info.versionName} (SDK ${info.sdkVersion})\n`;
    report += `Codename: ${info.codename}\n\n`;

    report += '── SYSTEM CHECKS ──────────────────────\n';
    const systemChecks = checks.filter(c => c.category === 'system');
    for (const check of systemChecks) {
      const icon = check.status === 'passed' ? '✓' : check.status === 'warning' ? '△' : '✗';
      report += `  ${icon} ${check.label}: ${check.status.toUpperCase()}\n`;
      report += `    └─ ${check.detail}\n`;
    }

    report += '\n── HOOKING FRAMEWORK ──────────────────\n';
    const hookingChecks = checks.filter(c => c.category === 'hooking');
    for (const check of hookingChecks) {
      const icon = check.status === 'passed' ? '✓' : check.status === 'warning' ? '△' : '✗';
      report += `  ${icon} ${check.label}: ${check.status.toUpperCase()}\n`;
      report += `    └─ ${check.detail}\n`;
    }

    report += '\n── CONNECTIVITY ───────────────────────\n';
    const connectivityChecks = checks.filter(c => c.category === 'connectivity');
    for (const check of connectivityChecks) {
      const icon = check.status === 'passed' ? '✓' : check.status === 'warning' ? '△' : '✗';
      report += `  ${icon} ${check.label}: ${check.status.toUpperCase()}\n`;
      report += `    └─ ${check.detail}\n`;
    }

    report += '\n── DEVICE COMPATIBILITY ───────────────\n';
    report += `  Camera API: ${info.supportsCamera2 ? 'Camera2 (Modern)' : 'Camera1 (Legacy)'}\n`;
    report += `  Scoped Storage: ${info.requiresScopedStorage ? 'Required' : 'Not Required'}\n`;
    report += `  Post Notifications: ${info.requiresPostNotificationPermission ? 'Required' : 'Not Required'}\n`;
    report += `  Media Projection FG: ${info.requiresMediaProjectionForeground ? 'Required' : 'Not Required'}\n`;

    report += '\n── AI CACHE ───────────────────────────\n';
    report += `  Cached Entries: ${stats.totalEntries}\n`;
    report += `  Cache Size: ${(stats.totalSizeKB / 1024).toFixed(1)} MB\n`;
    report += `  Hit Rate: ${stats.hitRate}%\n`;

    report += '\n── VERDICT ────────────────────────────\n';
    const passedCount = checks.filter(c => c.status === 'passed' || c.status === 'unavailable').length;
    report += `  ${passedCount}/${checks.length} checks passed\n`;
    report += `  Status: ${allVerified ? '✓ ALL SYSTEMS VERIFIED' : '△ ACTION REQUIRED'}\n`;
    report += '\n═══════════════════════════════════════\n';
    report += '  VirtuCam v1.0 — System Integrity Tool\n';
    report += '═══════════════════════════════════════\n';

    // Save and share
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SYSTEM_REPORT_LOG, report);
    } catch {
      // Non-critical
    }

    try {
      await Share.share({
        message: report,
        title: 'VirtuCam System Report',
      });
    } catch {
      Alert.alert('Report Generated', 'The system report has been saved to app storage.');
    }
  }, [checks, allVerified, lightImpact]);

  const handleManualVerification = (checkId: string) => {
    const check = checks.find(c => c.id === checkId);
    if (!check || check.status === 'passed') return;

    Alert.alert(
      `Confirm ${check.label}`,
      `Have you manually granted the "${check.label}" permission in your device's settings?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            const newChecks = checks.map(c =>
              c.id === checkId ? { ...c, status: 'passed' as SystemCheckStatus, detail: `${check.label} permission confirmed by user.` } : c
            );
            setChecks(newChecks);
            success();
          },
        },
      ]
    );
  };

  const passedCount = useMemo(() =>
    checks.filter(c => c.status === 'passed' || c.status === 'unavailable').length,
    [checks]
  );

  const categorizedChecks = useMemo(() => ({
    system: checks.filter(c => c.category === 'system'),
    hooking: checks.filter(c => c.category === 'hooking'),
    connectivity: checks.filter(c => c.category === 'connectivity'),
  }), [checks]);

  const heartbeatColor = useCallback((status: string) => {
    switch (status) {
      case 'online':
      case 'connected':
      case 'active':
        return Colors.verifiedGreen;
      case 'offline':
      case 'disconnected':
      case 'inactive':
        return Colors.danger;
      default:
        return Colors.textTertiary;
    }
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <View style={styles.header}>
          <Pressable
            onPress={() => { lightImpact(); router.back(); }}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={20} color={allVerified ? Colors.verifiedGreen : Colors.electricBlue} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={styles.headerTitleRow}>
              <Animated.View style={[styles.headerGlowDot, headerGlowStyle]}>
                <View style={[styles.headerDotInner, { backgroundColor: allVerified ? Colors.verifiedGreen : Colors.electricBlue }]} />
              </Animated.View>
              <Text style={[styles.headerTitle, allVerified && { color: Colors.verifiedGreen }]}>
                SYSTEM INTEGRITY
              </Text>
            </View>
            <Text style={styles.headerSubtitle}>
              Pre-Flight Diagnostic Dashboard
            </Text>
          </View>
          {androidInfo && (
            <View style={styles.androidBadge}>
              <MaterialCommunityIcons name="android" size={14} color={Colors.verifiedGreen} />
              <Text style={styles.androidBadgeText}>{androidInfo.versionName}</Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* Success Animation Overlay */}
      {showSuccessAnim && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.successOverlay}>
          <SuccessAnimation
            visible={showSuccessAnim}
            size={80}
            color={Colors.verifiedGreen}
            glowColor={Colors.verifiedGreenGlow}
            onAnimationComplete={() => setShowSuccessAnim(false)}
          />
        </Animated.View>
      )}

      {/* Scan Control Card */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <Animated.View
          style={[
            styles.scanCard,
            verifiedGlowStyle,
            allVerified && styles.scanCardVerified,
          ]}
        >
          {/* Status display */}
          <View style={styles.scanHeader}>
            <View style={styles.scanStatusRow}>
              <PulseIndicator
                active={scanPhase === 'scanning'}
                color={scanPhase === 'complete'
                  ? (allVerified ? Colors.verifiedGreen : Colors.warningAmber)
                  : scanPhase === 'scanning'
                  ? Colors.electricBlue
                  : Colors.inactive}
                size={12}
              />
              <Text style={[
                styles.scanStatusText,
                scanPhase === 'complete' && allVerified && { color: Colors.verifiedGreen },
                scanPhase === 'scanning' && { color: Colors.electricBlue },
              ]}>
                {scanPhase === 'idle' && 'AWAITING SCAN'}
                {scanPhase === 'scanning' && 'SCANNING SYSTEM...'}
                {scanPhase === 'complete' && allVerified && 'ALL SYSTEMS VERIFIED'}
                {scanPhase === 'complete' && !allVerified && 'ACTION REQUIRED'}
                {scanPhase === 'failed' && 'SCAN FAILED'}
              </Text>
            </View>
            {scanPhase === 'complete' && (
              <View style={[
                styles.verifiedBadge,
                allVerified ? styles.verifiedBadgePass : styles.verifiedBadgeFail,
              ]}>
                <Text style={[
                  styles.verifiedBadgeText,
                  { color: allVerified ? Colors.verifiedGreen : Colors.warningAmber },
                ]}>
                  {passedCount}/{checks.length}
                </Text>
              </View>
            )}
          </View>

          {/* Progress bar */}
          {scanPhase === 'scanning' && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, progressStyle]} />
              </View>
              <Text style={styles.progressText}>{scanProgress}% Complete</Text>
            </View>
          )}

          {/* Scan button */}
          <Animated.View style={scanPulseStyle}>
            <Pressable
              onPress={runIntegrityScan}
              disabled={scanPhase === 'scanning'}
              style={[
                styles.scanButton,
                allVerified && styles.scanButtonVerified,
                scanPhase === 'scanning' && styles.scanButtonScanning,
              ]}
            >
              {scanPhase === 'scanning' ? (
                <View style={styles.scanButtonContent}>
                  <ActivityIndicator
                    size="small"
                    color={Colors.electricBlue}
                  />
                  <Text style={[styles.scanButtonLabel, { color: Colors.electricBlue }]}>
                    SCANNING...
                  </Text>
                </View>
              ) : (
                <View style={styles.scanButtonContent}>
                  <Ionicons
                    name={allVerified ? 'shield-checkmark' : 'scan'}
                    size={28}
                    color={allVerified ? Colors.verifiedGreen : Colors.electricBlue}
                  />
                  <Text style={[
                    styles.scanButtonLabel,
                    { color: allVerified ? Colors.verifiedGreen : Colors.electricBlue },
                  ]}>
                    {scanPhase === 'idle' ? 'RUN INTEGRITY SCAN' : allVerified ? 'RESCAN SYSTEM' : 'RUN SCAN AGAIN'}
                  </Text>
                  <Text style={styles.scanButtonSub}>
                    One-tap device environment scan
                  </Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* Connectivity Heartbeat */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <View style={styles.sectionHeader}>
          <Animated.View style={heartbeatPulseStyle}>
            <MaterialCommunityIcons name="heart-pulse" size={16} color={Colors.danger} />
          </Animated.View>
          <Text style={styles.sectionTitle}>Connectivity Heartbeat</Text>
          <Pressable onPress={checkHeartbeat} style={styles.refreshSmall}>
            <Ionicons name="refresh" size={14} color={Colors.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.heartbeatGrid}>
          <HeartbeatCard
            icon="cloud-sync"
            label="Cloud Sync"
            status={heartbeat.cloudSync}
            color={heartbeatColor(heartbeat.cloudSync)}
          />
          <HeartbeatCard
            icon="bridge"
            label="Config Bridge"
            status={heartbeat.bridge}
            color={heartbeatColor(heartbeat.bridge)}
          />
        </View>
        {heartbeat.lastPing > 0 && (
          <Text style={styles.heartbeatTimestamp}>
            Last ping: {new Date(heartbeat.lastPing).toLocaleTimeString()}
          </Text>
        )}
      </Animated.View>

      {/* Scan Results */}
      {scanPhase === 'complete' && (
        <>
          {/* System Checks */}
          {categorizedChecks.system.length > 0 && (
            <Animated.View entering={FadeInDown.delay(350).duration(500)}>
              <View style={styles.sectionHeader}>
                <Ionicons name="shield-checkmark" size={16} color={Colors.electricBlue} />
                <Text style={styles.sectionTitle}>System Environment</Text>
              </View>
              {categorizedChecks.system.map((check, index) => (
                <Animated.View
                  key={check.id}
                  entering={FadeInDown.delay(400 + index * 60).duration(300)}
                >
                  <IntegrityCheckCard
                    check={check}
                    allVerified={allVerified}
                    pressable={check.id === 'overlay' || check.id === 'storage'}
                    onPress={() => handleManualVerification(check.id)}
                  />
                </Animated.View>
              ))}
            </Animated.View>
          )}

          {/* Hooking Framework */}
          {categorizedChecks.hooking.length > 0 && (
            <Animated.View entering={FadeInDown.delay(500).duration(500)}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="hook" size={16} color={Colors.purple} />
                <Text style={styles.sectionTitle}>Hooking Framework</Text>
              </View>
              {categorizedChecks.hooking.map((check, index) => (
                <Animated.View
                  key={check.id}
                  entering={FadeInDown.delay(550 + index * 60).duration(300)}
                >
                  <IntegrityCheckCard
                    check={check}
                    allVerified={allVerified}
                    pressable={check.id === 'overlay' || check.id === 'storage'}
                    onPress={() => handleManualVerification(check.id)}
                  />
                </Animated.View>
              ))}
            </Animated.View>
          )}

          {/* Connectivity */}
          {categorizedChecks.connectivity.length > 0 && (
            <Animated.View entering={FadeInDown.delay(650).duration(500)}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="connection" size={16} color={Colors.cyan} />
                <Text style={styles.sectionTitle}>Connectivity</Text>
              </View>
              {categorizedChecks.connectivity.map((check, index) => (
                <Animated.View
                  key={check.id}
                  entering={FadeInDown.delay(700 + index * 60).duration(300)}
                >
                  <IntegrityCheckCard
                    check={check}
                    allVerified={allVerified}
                    pressable={check.id === 'overlay' || check.id === 'storage'}
                    onPress={() => handleManualVerification(check.id)}
                  />
                </Animated.View>
              ))}
            </Animated.View>
          )}

          {/* Log Exporter */}
          <Animated.View entering={FadeInDown.delay(800).duration(500)}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text" size={16} color={Colors.warningAmber} />
              <Text style={styles.sectionTitle}>Log Exporter</Text>
            </View>
            <Pressable onPress={generateSystemReport} style={styles.exportCard}>
              <View style={styles.exportIcon}>
                <Ionicons name="share-outline" size={24} color={Colors.gold} />
              </View>
              <View style={styles.exportText}>
                <Text style={styles.exportTitle}>Export System Report</Text>
                <Text style={styles.exportDesc}>
                  Generate a professional diagnostic report and share via any app
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.gold} />
            </Pressable>
          </Animated.View>

          {/* AI Cache Status */}
          {cacheStats && (
            <Animated.View entering={FadeInDown.delay(850).duration(500)}>
              <View style={styles.sectionHeader}>
                <Ionicons name="sparkles" size={16} color={Colors.electricBlue} />
                <Text style={styles.sectionTitle}>AI Cache System</Text>
              </View>
              <View style={styles.cacheCard}>
                <View style={styles.cacheRow}>
                  <Text style={styles.cacheLabel}>Cached Entries</Text>
                  <Text style={styles.cacheValue}>{cacheStats.totalEntries}</Text>
                </View>
                <View style={styles.cacheDivider} />
                <View style={styles.cacheRow}>
                  <Text style={styles.cacheLabel}>Cache Size</Text>
                  <Text style={styles.cacheValue}>{(cacheStats.totalSizeKB / 1024).toFixed(1)} MB</Text>
                </View>
                <View style={styles.cacheDivider} />
                <View style={styles.cacheRow}>
                  <Text style={styles.cacheLabel}>Hit Rate</Text>
                  <Text style={[styles.cacheValue, { color: Colors.verifiedGreen }]}>{cacheStats.hitRate}%</Text>
                </View>
              </View>
            </Animated.View>
          )}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function HeartbeatCard({
  icon,
  label,
  status,
  color,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  status: string;
  color: string;
}) {
  return (
    <View style={[styles.heartbeatCard, { borderColor: color + '30' }]}>
      <View style={[styles.heartbeatIcon, { backgroundColor: color + '15' }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.heartbeatLabel}>{label}</Text>
      <View style={styles.heartbeatStatusRow}>
        <View style={[styles.heartbeatDot, { backgroundColor: color }]} />
        <Text style={[styles.heartbeatStatus, { color }]}>
          {status === 'checking' ? '...' : status.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

function IntegrityCheckCard({
  check,
  allVerified,
  pressable,
  onPress,
}: {
  check: IntegrityCheck;
  allVerified: boolean;
  pressable: boolean;
  onPress: () => void;
}) {
  const isPassed = check.status === 'passed' || check.status === 'unavailable';
  const color = allVerified && isPassed
    ? Colors.verifiedGreen
    : getStatusColor(check.status);

  const severityColor = check.severity === 'critical'
    ? Colors.danger
    : check.severity === 'important'
    ? Colors.warningAmber
    : Colors.textTertiary;

  return (
    <Pressable onPress={onPress} disabled={!pressable || isPassed}>
      <View style={[styles.checkCard, { borderColor: color + '25' }]}>
        <View style={styles.checkCardRow}>
          <View style={[styles.checkIcon, { backgroundColor: color + '15' }]}>
            <Ionicons
              name={isPassed ? 'checkmark-circle' : check.status === 'warning' ? 'alert-circle' : 'close-circle'}
              size={18}
              color={color}
            />
          </View>
          <View style={styles.checkCardText}>
            <View style={styles.checkTitleRow}>
              <Text style={[styles.checkLabel, { color: isPassed ? Colors.textPrimary : color }]}>
                {check.label}
              </Text>
              <View style={[styles.severityBadge, { backgroundColor: severityColor + '15', borderColor: severityColor + '30' }]}>
                <Text style={[styles.severityText, { color: severityColor }]}>
                  {check.severity.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={[styles.checkDetail, { color }]}>
              {check.detail}
            </Text>
          </View>
          {allVerified && isPassed && (
            <View style={styles.goldStarContainer}>
              <Ionicons name="star" size={14} color={Colors.gold} />
            </View>
          )}
        </View>
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerCenter: { flex: 1 },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerGlowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.electricBlue + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDotInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  headerTitle: {
    color: Colors.electricBlue,
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: 2,
  },
  headerSubtitle: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    letterSpacing: 1,
    marginTop: 2,
    marginLeft: Spacing.xl,
  },
  androidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.verifiedGreen + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.verifiedGreen + '30',
  },
  androidBadgeText: {
    color: Colors.verifiedGreen,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  // Success overlay
  successOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    height: 100,
  },

  // Scan Card
  scanCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
    shadowColor: Colors.verifiedGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 8,
  },
  scanCardVerified: {
    backgroundColor: Colors.verifiedGreen + '05',
  },
  scanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  scanStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  scanStatusText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  verifiedBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  verifiedBadgePass: {
    backgroundColor: Colors.verifiedGreen + '15',
    borderColor: Colors.verifiedGreen + '40',
  },
  verifiedBadgeFail: {
    backgroundColor: Colors.warningAmber + '15',
    borderColor: Colors.warningAmber + '40',
  },
  verifiedBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  progressContainer: {
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.electricBlue,
    borderRadius: 2,
  },
  progressText: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  scanButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    borderColor: Colors.electricBlue + '30',
    backgroundColor: Colors.electricBlue + '08',
    borderStyle: 'dashed',
  },
  scanButtonVerified: {
    borderColor: Colors.verifiedGreen + '40',
    backgroundColor: Colors.verifiedGreen + '08',
    borderStyle: 'solid',
  },
  scanButtonScanning: {
    borderColor: Colors.electricBlue + '40',
    borderStyle: 'solid',
    backgroundColor: Colors.electricBlue + '05',
  },
  scanButtonContent: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  scanButtonLabel: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    letterSpacing: 2,
  },
  scanButtonSub: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  refreshSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Heartbeat
  heartbeatGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  heartbeatCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  heartbeatIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartbeatLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  heartbeatStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heartbeatDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  heartbeatStatus: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heartbeatTimestamp: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  // Check Cards
  checkCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  checkCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  checkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCardText: {
    flex: 1,
  },
  checkTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  checkLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  severityText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  checkDetail: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  goldStarContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.gold + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Export
  exportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gold + '30',
  },
  exportIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gold + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gold + '30',
  },
  exportText: { flex: 1 },
  exportTitle: {
    color: Colors.gold,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  exportDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },

  // AI Cache
  cacheCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cacheRow: {
    flex: 1,
    alignItems: 'center',
  },
  cacheLabel: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  cacheValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  cacheDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
});
