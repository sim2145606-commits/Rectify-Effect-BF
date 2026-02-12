import React, { useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import {
  getStatusColor,
  type SystemCheckStatus,
} from '@/services/SystemVerification';
import {
  requestOverlayPermission,
  requestMediaLibraryPermission,
  requestCameraPermission,
} from '@/services/PermissionManager';
import { syncAllSettings, writeBridgeConfig } from '@/services/ConfigBridge';
import StatusRing from '@/components/StatusRing';
import ReadinessGauge from '@/components/ReadinessGauge';
import PulseIndicator from '@/components/PulseIndicator';

// ─── Types ──────────────────────────────────────────

type InjectionMethod = 'camera2' | 'camera1' | 'loopback';

type WizardStep = {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: 'complete' | 'pending' | 'action_needed';
  action?: () => Promise<void>;
};

// ─── Helpers ────────────────────────────────────────

function mapSystemStatus(status: SystemCheckStatus): 'active' | 'warning' | 'inactive' | 'checking' {
  switch (status) {
    case 'passed': return 'active';
    case 'warning': return 'warning';
    case 'failed': return 'inactive';
    case 'checking': return 'checking';
    case 'unavailable': return 'warning';
    default: return 'checking';
  }
}

function calculateReadinessScore(checks: {
  root: SystemCheckStatus;
  xposed: SystemCheckStatus;
  module: SystemCheckStatus;
  storage: SystemCheckStatus;
  overlay: SystemCheckStatus;
  camera: SystemCheckStatus;
}): number {
  const weights: Record<string, number> = {
    root: 25,
    xposed: 25,
    module: 20,
    storage: 10,
    overlay: 10,
    camera: 10,
  };

  let totalScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const status = checks[key as keyof typeof checks];
    if (status === 'passed') totalScore += weight;
    else if (status === 'warning' || status === 'unavailable') totalScore += weight * 0.4;
    // 'failed' and 'checking' get 0
  }

  return Math.round(totalScore);
}

// ─── Main Screen ────────────────────────────────────

export default function SystemEngine() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { heavyImpact, success, warning, mediumImpact, lightImpact, selection } = useHaptics();

  const { status: systemStatus, isChecking, refresh: refreshSystemStatus } = useSystemStatus(15000);

  const [engineInitialized, setEngineInitialized] = useStorage(STORAGE_KEYS.ENGINE_INITIALIZED, false);
  const [camera2Hook, setCamera2Hook] = useStorage(STORAGE_KEYS.CAMERA2_HOOK, true);
  const [camera1Hook, setCamera1Hook] = useStorage(STORAGE_KEYS.CAMERA1_HOOK, false);
  const [virtualLoopback, setVirtualLoopback] = useStorage(STORAGE_KEYS.VIRTUAL_LOOPBACK, false);
  const [wizardComplete, setWizardComplete] = useStorage(STORAGE_KEYS.SETUP_WIZARD_COMPLETE, false);

  const [isInitializing, setIsInitializing] = useState(false);

  // ─── Animations ─────────────────────────────

  const headerGlow = useSharedValue(0);
  const enginePulse = useSharedValue(1);
  const scanLineY = useSharedValue(0);
  const initButtonGlow = useSharedValue(0);
  const initButtonScale = useSharedValue(1);

  useEffect(() => {
    headerGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [headerGlow]);

  useEffect(() => {
    if (engineInitialized) {
      enginePulse.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      scanLineY.value = withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.linear }),
        -1,
        false
      );
      initButtonGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      enginePulse.value = withTiming(1, { duration: 300 });
      scanLineY.value = withTiming(0, { duration: 300 });
      initButtonGlow.value = withTiming(0, { duration: 300 });
    }
  }, [engineInitialized, enginePulse, scanLineY, initButtonGlow]);

  const headerGlowStyle = useAnimatedStyle(() => ({
    opacity: headerGlow.value,
  }));

  const enginePulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: enginePulse.value }],
  }));

  const scanLineStyle = useAnimatedStyle(() => ({
    top: `${scanLineY.value * 100}%` as `${number}%`,
    opacity: engineInitialized ? 0.6 : 0,
  }));

  const initButtonGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: engineInitialized ? initButtonGlow.value * 0.7 : 0,
    borderColor: engineInitialized
      ? `rgba(0, 212, 255, ${initButtonGlow.value * 0.6})`
      : Colors.border,
  }));

  const initButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: initButtonScale.value }],
  }));

  // ─── Computed Values ────────────────────────

  const readinessScore = useMemo(() => {
    return calculateReadinessScore({
      root: systemStatus.rootAccess.status,
      xposed: systemStatus.xposedFramework.status,
      module: systemStatus.moduleActive.status,
      storage: systemStatus.storagePermission.status,
      overlay: systemStatus.overlayPermission.status,
      camera: systemStatus.cameraService.status,
    });
  }, [systemStatus]);

  const diagnosticWarnings = useMemo(() => {
    const warnings: { id: string; title: string; description: string; severity: 'critical' | 'warning'; icon: keyof typeof Ionicons.glyphMap }[] = [];

    if (systemStatus.rootAccess.status === 'failed' || systemStatus.rootAccess.status === 'warning') {
      warnings.push({
        id: 'root',
        title: 'Root Access Required',
        description: 'Grant superuser access via Magisk or KernelSU. System-level camera injection requires root privileges.',
        severity: 'critical',
        icon: 'shield-outline',
      });
    }

    if (systemStatus.xposedFramework.status === 'failed' || systemStatus.xposedFramework.status === 'warning') {
      warnings.push({
        id: 'xposed',
        title: 'Hooking Framework Missing',
        description: 'Install LSPosed (Zygisk) or EdXposed. Required for Camera2 API intercept hooks.',
        severity: 'critical',
        icon: 'code-slash-outline',
      });
    }

    if (systemStatus.moduleActive.status === 'failed' || systemStatus.moduleActive.status === 'warning') {
      warnings.push({
        id: 'module',
        title: 'VirtuCam Module Inactive',
        description: 'Enable VirtuCam module in LSPosed Manager and select target scope for system_server.',
        severity: 'warning',
        icon: 'extension-puzzle-outline',
      });
    }

    if (systemStatus.overlayPermission.status === 'failed' || systemStatus.overlayPermission.status === 'warning') {
      warnings.push({
        id: 'overlay',
        title: 'Overlay Permission Required',
        description: 'Enable "Display over other apps" for real-time feed overlay during injection.',
        severity: 'warning',
        icon: 'layers-outline',
      });
    }

    return warnings;
  }, [systemStatus]);

  const wizardSteps: WizardStep[] = useMemo(() => {
    const rootOk = systemStatus.rootAccess.status === 'passed';
    const storageOk = systemStatus.storagePermission.status === 'passed';
    const overlayOk = systemStatus.overlayPermission.status === 'passed';

    return [
      {
        id: 'root',
        label: 'Root Access',
        description: 'Superuser privileges required for system-level hooks',
        icon: 'shield-checkmark' as keyof typeof Ionicons.glyphMap,
        status: rootOk ? 'complete' : 'action_needed',
      },
      {
        id: 'storage',
        label: 'Storage Access',
        description: 'Full filesystem access for media source injection',
        icon: 'folder-open' as keyof typeof Ionicons.glyphMap,
        status: storageOk ? 'complete' : 'action_needed',
        action: async () => {
          await requestMediaLibraryPermission();
          await refreshSystemStatus();
        },
      },
      {
        id: 'overlay',
        label: 'System Overlay',
        description: 'Display over apps for live injection preview',
        icon: 'layers' as keyof typeof Ionicons.glyphMap,
        status: overlayOk ? 'complete' : 'action_needed',
        action: async () => {
          await requestOverlayPermission();
          await refreshSystemStatus();
        },
      },
      {
        id: 'camera',
        label: 'Camera Access',
        description: 'Camera device enumeration and stream interception',
        icon: 'camera' as keyof typeof Ionicons.glyphMap,
        status: storageOk ? 'complete' : 'pending',
        action: async () => {
          await requestCameraPermission();
          await refreshSystemStatus();
        },
      },
    ];
  }, [systemStatus, refreshSystemStatus]);

  // ─── Handlers ───────────────────────────────

  const handleInitializeEngine = useCallback(async () => {
    if (engineInitialized) {
      Alert.alert(
        '⚠ Shutdown Engine',
        'This will disable the system-level camera interceptor. Active hooks will be released.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Shutdown',
            style: 'destructive',
            onPress: async () => {
              warning();
              setIsInitializing(true);
              await new Promise(r => setTimeout(r, 800));
              setEngineInitialized(false);
              try {
                await writeBridgeConfig({ enabled: false });
              } catch {
                // Silent
              }
              setIsInitializing(false);
            },
          },
        ]
      );
      return;
    }

    // Show confirmation for initialization
    Alert.alert(
      '◈ Initialize Engine',
      'This will activate the system-level camera interceptor and hook into the media server pipeline.\n\nProceed with engine initialization?',
      [
        { text: 'Abort', style: 'cancel' },
        {
          text: 'Initialize',
          onPress: async () => {
            heavyImpact();
            setIsInitializing(true);

            // Simulated initialization sequence
            await new Promise(r => setTimeout(r, 600));
            mediumImpact();
            await new Promise(r => setTimeout(r, 600));
            mediumImpact();
            await new Promise(r => setTimeout(r, 400));

            try {
              await syncAllSettings();
              await writeBridgeConfig({ enabled: true });
            } catch {
              // Continue anyway
            }

            setEngineInitialized(true);
            setIsInitializing(false);
            success();
          },
        },
      ]
    );
  }, [engineInitialized, setEngineInitialized, heavyImpact, mediumImpact, success, warning]);

  const handleMethodToggle = useCallback((method: InjectionMethod) => {
    selection();
    switch (method) {
      case 'camera2':
        setCamera2Hook(!camera2Hook);
        break;
      case 'camera1':
        setCamera1Hook(!camera1Hook);
        break;
      case 'loopback':
        setVirtualLoopback(!virtualLoopback);
        break;
    }
  }, [camera2Hook, camera1Hook, virtualLoopback, setCamera2Hook, setCamera1Hook, setVirtualLoopback, selection]);

  const handleWizardAction = useCallback(async (step: WizardStep) => {
    lightImpact();
    if (step.action) {
      await step.action();
    } else {
      Alert.alert(
        step.label,
        `${step.description}\n\nThis requires manual configuration outside the app.`,
        [{ text: 'Understood' }]
      );
    }
  }, [lightImpact]);

  const handleRefresh = useCallback(async () => {
    mediumImpact();
    await refreshSystemStatus();
  }, [mediumImpact, refreshSystemStatus]);

  const completedSteps = wizardSteps.filter(s => s.status === 'complete').length;

  useEffect(() => {
    if (completedSteps === wizardSteps.length && !wizardComplete) {
      setWizardComplete(true);
    }
  }, [completedSteps, wizardSteps.length, wizardComplete, setWizardComplete]);

  // ─── Render ─────────────────────────────────

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.lg },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Header ─────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              lightImpact();
              router.back();
            }}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.electricBlue} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={styles.headerTitleRow}>
              <Animated.View style={[styles.headerGlowDot, headerGlowStyle]}>
                <View style={styles.headerDotInner} />
              </Animated.View>
              <Text style={styles.headerTitle}>SYSTEM ENGINE</Text>
            </View>
            <Text style={styles.headerSubtitle}>Phase 2 — Injection Core</Text>
          </View>
          <Pressable onPress={handleRefresh} style={styles.refreshBtn}>
            {isChecking ? (
              <ActivityIndicator color={Colors.electricBlue} size="small" />
            ) : (
              <Ionicons name="refresh" size={18} color={Colors.electricBlue} />
            )}
          </Pressable>
        </View>
      </Animated.View>

      {/* ─── Engine Status Dashboard ─────────── */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="gauge" size={16} color={Colors.electricBlue} />
          <Text style={styles.sectionTitle}>System Diagnostics</Text>
          <View style={[styles.liveBadge, engineInitialized && styles.liveBadgeActive]}>
            <View style={[styles.liveDot, { backgroundColor: engineInitialized ? Colors.electricBlue : Colors.textTertiary }]} />
            <Text style={[styles.liveText, { color: engineInitialized ? Colors.electricBlue : Colors.textTertiary }]}>
              {engineInitialized ? 'LIVE' : 'IDLE'}
            </Text>
          </View>
        </View>

        <Animated.View style={enginePulseStyle}>
          <View style={styles.diagnosticsCard}>
            {/* Scan line overlay */}
            {engineInitialized && (
              <Animated.View style={[styles.cardScanLine, scanLineStyle]} />
            )}

            <View style={styles.statusRingRow}>
              <StatusRing
                label="Root"
                detail={systemStatus.rootAccess.status === 'passed' ? 'GRANTED' : 'REQUIRED'}
                status={mapSystemStatus(systemStatus.rootAccess.status)}
                icon={<Ionicons name="shield-checkmark" size={22} color={getStatusColor(systemStatus.rootAccess.status)} />}
              />
              <StatusRing
                label="Framework"
                detail={systemStatus.xposedFramework.status === 'passed' ? 'HOOKED' : 'MISSING'}
                status={mapSystemStatus(systemStatus.xposedFramework.status)}
                icon={<MaterialCommunityIcons name="hook" size={22} color={getStatusColor(systemStatus.xposedFramework.status)} />}
              />
              <StatusRing
                label="Module"
                detail={systemStatus.moduleActive.status === 'passed' ? 'ACTIVE' : 'INACTIVE'}
                status={mapSystemStatus(systemStatus.moduleActive.status)}
                icon={<Ionicons name="extension-puzzle" size={22} color={getStatusColor(systemStatus.moduleActive.status)} />}
              />
            </View>

            {/* Subtle divider */}
            <View style={styles.cardDivider} />

            {/* Quick metrics */}
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{readinessScore}%</Text>
                <Text style={styles.metricLabel}>Readiness</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={[styles.metricValue, { color: engineInitialized ? Colors.electricBlue : Colors.textTertiary }]}>
                  {engineInitialized ? 'ONLINE' : 'OFFLINE'}
                </Text>
                <Text style={styles.metricLabel}>Engine</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>
                  {[camera2Hook && 'C2', camera1Hook && 'C1', virtualLoopback && 'VL'].filter(Boolean).join('+') || '—'}
                </Text>
                <Text style={styles.metricLabel}>Hooks</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      {/* ─── Readiness Gauge ─────────────────── */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="speedometer" size={16} color={Colors.cyan} />
          <Text style={styles.sectionTitle}>Readiness Assessment</Text>
        </View>
        <View style={styles.gaugeCard}>
          <ReadinessGauge
            score={readinessScore}
            label="System Readiness"
            sublabel={readinessScore >= 80 ? 'All core systems operational' : 'Resolve warnings to improve readiness'}
          />
        </View>
      </Animated.View>

      {/* ─── Diagnostic Warnings ─────────────── */}
      {diagnosticWarnings.length > 0 && (
        <Animated.View entering={FadeInDown.delay(350).duration(500)}>
          <View style={styles.sectionHeader}>
            <Ionicons name="warning" size={16} color={Colors.warningAmber} />
            <Text style={styles.sectionTitle}>Diagnostic Warnings</Text>
            <View style={styles.warningCountBadge}>
              <Text style={styles.warningCountText}>{diagnosticWarnings.length}</Text>
            </View>
          </View>
          {diagnosticWarnings.map((w, index) => (
            <Animated.View
              key={w.id}
              entering={FadeInDown.delay(400 + index * 80).duration(400)}
            >
              <DiagnosticWarningCard
                title={w.title}
                description={w.description}
                severity={w.severity}
                icon={w.icon}
              />
            </Animated.View>
          ))}
        </Animated.View>
      )}

      {/* ─── Setup Wizard ────────────────────── */}
      <Animated.View entering={FadeInDown.delay(450).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="wizard-hat" size={16} color={Colors.purple} />
          <Text style={styles.sectionTitle}>System Setup</Text>
          <View style={[styles.progressBadge, completedSteps === wizardSteps.length && styles.progressBadgeComplete]}>
            <Text style={[styles.progressBadgeText, completedSteps === wizardSteps.length && styles.progressBadgeTextComplete]}>
              {completedSteps}/{wizardSteps.length}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${(completedSteps / wizardSteps.length) * 100}%` as `${number}%`,
                  backgroundColor: completedSteps === wizardSteps.length ? Colors.electricBlue : Colors.purple,
                },
              ]}
            />
          </View>
        </View>

        {wizardSteps.map((step, index) => (
          <Animated.View
            key={step.id}
            entering={FadeInDown.delay(500 + index * 80).duration(400)}
          >
            <WizardStepCard
              step={step}
              index={index}
              isLast={index === wizardSteps.length - 1}
              onAction={() => handleWizardAction(step)}
            />
          </Animated.View>
        ))}
      </Animated.View>

      {/* ─── Hooking Configuration ───────────── */}
      <Animated.View entering={FadeInDown.delay(600).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="hook" size={16} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Injection Method</Text>
        </View>

        <HookMethodCard
          title="Camera2 API Injection"
          description="Modern camera framework hook — intercepts CameraDevice and CaptureSession"
          enabled={camera2Hook}
          onToggle={() => handleMethodToggle('camera2')}
          icon="videocam"
          color={Colors.electricBlue}
          badge="RECOMMENDED"
          badgeColor={Colors.electricBlue}
          status={systemStatus.xposedFramework.status === 'passed' ? 'compatible' : 'requires_framework'}
        />
        <HookMethodCard
          title="Legacy Camera1 Support"
          description="Compatibility layer for pre-Lollipop Camera API — broader app support"
          enabled={camera1Hook}
          onToggle={() => handleMethodToggle('camera1')}
          icon="camera"
          color={Colors.accent}
          badge="LEGACY"
          badgeColor={Colors.warningAmber}
          status={systemStatus.rootAccess.status === 'passed' ? 'compatible' : 'requires_root'}
        />
        <HookMethodCard
          title="Virtual Video Loopback"
          description="V4L2 loopback device emulation — creates virtual /dev/video node"
          enabled={virtualLoopback}
          onToggle={() => handleMethodToggle('loopback')}
          icon="git-network"
          color={Colors.purple}
          badge="ADVANCED"
          badgeColor={Colors.purple}
          status={systemStatus.rootAccess.status === 'passed' ? 'compatible' : 'requires_root'}
        />
      </Animated.View>

      {/* ─── Initialize Engine Toggle ────────── */}
      <Animated.View entering={FadeInDown.delay(700).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="power" size={16} color={engineInitialized ? Colors.electricBlue : Colors.danger} />
          <Text style={styles.sectionTitle}>Engine Control</Text>
        </View>

        <Animated.View style={initButtonAnimStyle}>
          <Animated.View
            style={[
              styles.engineControlCard,
              initButtonGlowStyle,
              engineInitialized && styles.engineControlCardActive,
            ]}
          >
            {/* Background scan effect */}
            {engineInitialized && (
              <Animated.View style={[styles.engineScanLine, scanLineStyle]} />
            )}

            <View style={styles.engineControlHeader}>
              <View style={styles.engineStatusRow}>
                <PulseIndicator
                  active={engineInitialized}
                  color={engineInitialized ? Colors.electricBlue : Colors.inactive}
                  size={10}
                />
                <Text style={[styles.engineStatusText, engineInitialized && { color: Colors.electricBlue }]}>
                  {engineInitialized ? 'ENGINE LIVE' : 'ENGINE STANDBY'}
                </Text>
              </View>
              <View style={[styles.engineBadge, engineInitialized ? styles.engineBadgeActive : styles.engineBadgeInactive]}>
                <Text style={[styles.engineBadgeText, engineInitialized && { color: Colors.electricBlue }]}>
                  {engineInitialized ? '◈ INITIALIZED' : '○ DORMANT'}
                </Text>
              </View>
            </View>

            {/* Active hooks display */}
            {engineInitialized && (
              <Animated.View entering={FadeIn.duration(400)} style={styles.activeHooksRow}>
                {camera2Hook && <ActiveHookBadge label="Camera2 API" color={Colors.electricBlue} />}
                {camera1Hook && <ActiveHookBadge label="Camera1 API" color={Colors.accent} />}
                {virtualLoopback && <ActiveHookBadge label="V4L2 Loopback" color={Colors.purple} />}
              </Animated.View>
            )}

            <Pressable
              onPressIn={() => {
                initButtonScale.value = withSpring(0.97);
              }}
              onPressOut={() => {
                initButtonScale.value = withSpring(1);
              }}
              onPress={handleInitializeEngine}
              disabled={isInitializing}
              style={[
                styles.engineButton,
                engineInitialized ? styles.engineButtonActive : styles.engineButtonInactive,
              ]}
            >
              {isInitializing ? (
                <View style={styles.engineButtonContent}>
                  <ActivityIndicator color={Colors.electricBlue} size="small" />
                  <Text style={[styles.engineButtonLabel, { color: Colors.electricBlue }]}>
                    {engineInitialized ? 'SHUTTING DOWN...' : 'INITIALIZING...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.engineButtonContent}>
                  <Ionicons
                    name={engineInitialized ? 'stop-circle' : 'power'}
                    size={32}
                    color={engineInitialized ? Colors.danger : Colors.electricBlue}
                  />
                  <Text
                    style={[
                      styles.engineButtonLabel,
                      { color: engineInitialized ? Colors.danger : Colors.electricBlue },
                    ]}
                  >
                    {engineInitialized ? 'SHUTDOWN ENGINE' : 'INITIALIZE ENGINE'}
                  </Text>
                  <Text style={styles.engineButtonSublabel}>
                    {engineInitialized
                      ? 'Release all system hooks and interceptors'
                      : 'Activate camera interceptor pipeline'}
                  </Text>
                </View>
              )}
            </Pressable>

            {/* System readiness indicator */}
            <View style={styles.engineFooter}>
              <View style={styles.engineFooterItem}>
                <View style={[styles.footerDot, { backgroundColor: readinessScore >= 80 ? Colors.success : Colors.warningAmber }]} />
                <Text style={styles.engineFooterText}>
                  Readiness: {readinessScore}%
                </Text>
              </View>
              <View style={styles.engineFooterItem}>
                <View style={[styles.footerDot, { backgroundColor: (camera2Hook || camera1Hook || virtualLoopback) ? Colors.success : Colors.danger }]} />
                <Text style={styles.engineFooterText}>
                  Hooks: {[camera2Hook && 'C2', camera1Hook && 'C1', virtualLoopback && 'VL'].filter(Boolean).join(', ') || 'None'}
                </Text>
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Sub Components ─────────────────────────────────

function DiagnosticWarningCard({
  title,
  description,
  severity,
  icon,
}: {
  title: string;
  description: string;
  severity: 'critical' | 'warning';
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const color = severity === 'critical' ? Colors.danger : Colors.warningAmber;

  return (
    <View
      style={[
        styles.warningCard,
        {
          borderColor: color + '30',
          borderLeftColor: color,
        },
      ]}
    >
      <View style={styles.warningCardHeader}>
        <View style={[styles.warningIconCircle, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <View style={styles.warningCardContent}>
          <View style={styles.warningTitleRow}>
            <Text style={[styles.warningTitle, { color }]}>{title}</Text>
            <View style={[styles.severityBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
              <Text style={[styles.severityText, { color }]}>
                {severity === 'critical' ? '⚠ CRITICAL' : '△ WARNING'}
              </Text>
            </View>
          </View>
          <Text style={styles.warningDescription}>{description}</Text>
        </View>
      </View>
    </View>
  );
}

function WizardStepCard({
  step,
  index,
  isLast,
  onAction,
}: {
  step: WizardStep;
  index: number;
  isLast: boolean;
  onAction: () => void;
}) {
  const isComplete = step.status === 'complete';
  const color = isComplete ? Colors.electricBlue : Colors.textTertiary;

  return (
    <Pressable onPress={onAction} disabled={isComplete}>
      <View style={styles.wizardStepContainer}>
        {/* Timeline connector */}
        <View style={styles.timelineColumn}>
          <View
            style={[
              styles.timelineCircle,
              {
                backgroundColor: isComplete ? Colors.electricBlue + '20' : Colors.surfaceLight,
                borderColor: isComplete ? Colors.electricBlue : Colors.border,
              },
            ]}
          >
            {isComplete ? (
              <Ionicons name="checkmark" size={14} color={Colors.electricBlue} />
            ) : (
              <Text style={styles.timelineNumber}>{index + 1}</Text>
            )}
          </View>
          {!isLast && (
            <View
              style={[
                styles.timelineLine,
                { backgroundColor: isComplete ? Colors.electricBlue + '40' : Colors.border },
              ]}
            />
          )}
        </View>

        {/* Card content */}
        <View
          style={[
            styles.wizardCard,
            isComplete && styles.wizardCardComplete,
          ]}
        >
          <View style={styles.wizardCardHeader}>
            <View style={[styles.wizardIconCircle, { backgroundColor: color + '15' }]}>
              <Ionicons name={step.icon} size={16} color={color} />
            </View>
            <View style={styles.wizardCardText}>
              <Text style={[styles.wizardLabel, isComplete && { color: Colors.electricBlue }]}>
                {step.label}
              </Text>
              <Text style={styles.wizardDescription} numberOfLines={2}>
                {step.description}
              </Text>
            </View>
            {!isComplete && (
              <View style={styles.wizardActionBadge}>
                <Ionicons name="chevron-forward" size={14} color={Colors.warningAmber} />
              </View>
            )}
            {isComplete && (
              <View style={styles.wizardCompleteBadge}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.electricBlue} />
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function HookMethodCard({
  title,
  description,
  enabled,
  onToggle,
  icon,
  color,
  badge,
  badgeColor,
  status,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  badge: string;
  badgeColor: string;
  status: 'compatible' | 'requires_root' | 'requires_framework';
}) {
  const statusLabels: Record<string, { text: string; color: string }> = {
    compatible: { text: 'COMPATIBLE', color: Colors.success },
    requires_root: { text: 'NEEDS ROOT', color: Colors.warningAmber },
    requires_framework: { text: 'NEEDS FRAMEWORK', color: Colors.warningAmber },
  };

  const statusInfo = statusLabels[status];

  return (
    <Pressable onPress={onToggle}>
      <View
        style={[
          styles.hookCard,
          enabled && { borderColor: color + '40' },
        ]}
      >
        <View style={styles.hookCardHeader}>
          <View style={[styles.hookIconCircle, { backgroundColor: color + '15', borderColor: color + '30' }]}>
            <Ionicons name={icon} size={18} color={color} />
          </View>
          <View style={styles.hookCardContent}>
            <View style={styles.hookTitleRow}>
              <Text style={[styles.hookTitle, enabled && { color }]} numberOfLines={1}>
                {title}
              </Text>
              <View style={[styles.hookBadge, { backgroundColor: badgeColor + '15', borderColor: badgeColor + '30' }]}>
                <Text style={[styles.hookBadgeText, { color: badgeColor }]}>{badge}</Text>
              </View>
            </View>
            <Text style={styles.hookDescription} numberOfLines={2}>{description}</Text>

            {/* Status badges row */}
            <View style={styles.hookStatusRow}>
              <View style={[styles.hookStatusBadge, { backgroundColor: statusInfo.color + '10', borderColor: statusInfo.color + '25' }]}>
                <View style={[styles.hookStatusDot, { backgroundColor: statusInfo.color }]} />
                <Text style={[styles.hookStatusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
              </View>
              <View style={[styles.hookToggleBadge, { backgroundColor: enabled ? color + '15' : Colors.surfaceLight, borderColor: enabled ? color + '30' : Colors.border }]}>
                <Text style={[styles.hookToggleText, { color: enabled ? color : Colors.textTertiary }]}>
                  {enabled ? '● ENABLED' : '○ DISABLED'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ActiveHookBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.activeHookBadge, { backgroundColor: color + '10', borderColor: color + '25' }]}>
      <View style={[styles.activeHookDot, { backgroundColor: color }]} />
      <Text style={[styles.activeHookText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────

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
  headerCenter: {
    flex: 1,
  },
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
    backgroundColor: Colors.electricBlue,
  },
  headerTitle: {
    color: Colors.electricBlue,
    fontSize: FontSize.xxl,
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
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Section Header
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  liveBadgeActive: {
    backgroundColor: Colors.electricBlue + '10',
    borderColor: Colors.electricBlue + '30',
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  liveText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Diagnostics Card
  diagnosticsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  cardScanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: Colors.electricBlue + '30',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    zIndex: 10,
  },
  statusRingRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.md,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metricLabel: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },

  // Gauge Card
  gaugeCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },

  // Diagnostic Warnings
  warningCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderLeftWidth: 3,
    marginBottom: Spacing.sm,
  },
  warningCardHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  warningIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningCardContent: {
    flex: 1,
  },
  warningTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
    flexWrap: 'wrap',
  },
  warningTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  severityText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  warningDescription: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  warningCountBadge: {
    backgroundColor: Colors.warningAmber + '15',
    borderColor: Colors.warningAmber + '30',
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
  },
  warningCountText: {
    color: Colors.warningAmber,
    fontSize: 10,
    fontWeight: '800',
  },

  // Setup Wizard
  progressBadge: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  progressBadgeComplete: {
    backgroundColor: Colors.electricBlue + '15',
    borderColor: Colors.electricBlue + '30',
  },
  progressBadgeText: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '800',
  },
  progressBadgeTextComplete: {
    color: Colors.electricBlue,
  },
  progressBarContainer: {
    marginBottom: Spacing.lg,
  },
  progressBarBg: {
    height: 3,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  wizardStepContainer: {
    flexDirection: 'row',
    minHeight: 72,
  },
  timelineColumn: {
    width: 32,
    alignItems: 'center',
  },
  timelineCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    zIndex: 1,
  },
  timelineNumber: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '800',
  },
  timelineLine: {
    width: 1.5,
    flex: 1,
    marginVertical: 2,
  },
  wizardCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginLeft: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  wizardCardComplete: {
    borderColor: Colors.electricBlue + '25',
    backgroundColor: Colors.electricBlue + '05',
  },
  wizardCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  wizardIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardCardText: {
    flex: 1,
  },
  wizardLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  wizardDescription: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
    lineHeight: 15,
  },
  wizardActionBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.warningAmber + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardCompleteBadge: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hook Method Cards
  hookCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hookCardHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  hookIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  hookCardContent: {
    flex: 1,
  },
  hookTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  hookTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  hookBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  hookBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hookDescription: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginBottom: Spacing.sm,
  },
  hookStatusRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  hookStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  hookStatusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  hookStatusText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hookToggleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  hookToggleText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Engine Control
  engineControlCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 8,
    marginBottom: Spacing.sm,
  },
  engineControlCardActive: {
    backgroundColor: Colors.surface,
  },
  engineScanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: Colors.electricBlue + '25',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    zIndex: 10,
  },
  engineControlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  engineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  engineStatusText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  engineBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  engineBadgeActive: {
    backgroundColor: Colors.electricBlue + '15',
    borderColor: Colors.electricBlue + '40',
  },
  engineBadgeInactive: {
    backgroundColor: Colors.surfaceLighter,
    borderColor: Colors.border,
  },
  engineBadgeText: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  activeHooksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  activeHookBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  activeHookDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  activeHookText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  engineButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
  },
  engineButtonActive: {
    backgroundColor: Colors.danger + '08',
    borderColor: Colors.danger + '40',
  },
  engineButtonInactive: {
    backgroundColor: Colors.electricBlue + '08',
    borderColor: Colors.electricBlue + '30',
    borderStyle: 'dashed',
  },
  engineButtonContent: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  engineButtonLabel: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    letterSpacing: 2,
  },
  engineButtonSublabel: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
  engineFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  engineFooterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  engineFooterText: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
