import { useEffect, useCallback, useState, useRef, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, Platform } from 'react-native';
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
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { useTheme } from '@/context/ThemeContext';
import {
  getStatusColor,
  getStatusIcon,
  getSystemInfo,
  type SystemCheckStatus,
  type SystemInfo,
} from '@/services/SystemVerification';
import {
  syncAllSettings,
  getBridgeStatus,
  readBridgeConfig,
  writeBridgeConfig,
  subscribeBridgeSyncState,
  getLatestBridgeSyncState,
  type BridgeSyncState,
} from '@/services/ConfigBridge';
import Card from '@/components/Card';
import PulseIndicator from '@/components/PulseIndicator';
import SystemToggle from '@/components/SystemToggle';

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { heavyImpact, success, warning, mediumImpact } = useHaptics();
  const { colors, isPerformance } = useTheme();
  const isWeb = Platform.OS === 'web';

  const [hookEnabled, setHookEnabled] = useStorage(STORAGE_KEYS.HOOK_ENABLED, false);
  const [frontCamera, setFrontCamera] = useStorage(STORAGE_KEYS.FRONT_CAMERA, true);
  const [backCamera, setBackCamera] = useStorage(STORAGE_KEYS.BACK_CAMERA, false);
  const [selectedMedia] = useStorage<string | null>(STORAGE_KEYS.SELECTED_MEDIA, null);
  const [aiEnhancement] = useStorage<string | null>(STORAGE_KEYS.AI_ENHANCEMENT, null);

  const { status: systemStatus, isChecking, refresh: refreshSystemStatus } = useSystemStatus(30000);
  const [bridgeVersion, setBridgeVersion] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Never');
  const [, setBridgePath] = useState<string | null>(null);
  const [bridgeReadable, setBridgeReadable] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loadingSystemInfo, setLoadingSystemInfo] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [bridgeHookEnabled, setBridgeHookEnabled] = useState(false);
  const [bridgeMediaPath, setBridgeMediaPath] = useState<string | null>(null);
  const [bridgeCameraTarget, setBridgeCameraTarget] = useState<string>('front');
  const [bridgeSyncState, setBridgeSyncState] = useState<BridgeSyncState>(() =>
    getLatestBridgeSyncState()
  );
  const bridgeSyncInFlightRef = useRef<Promise<void> | null>(null);
  const lastBridgeSyncAtRef = useRef(0);

  const masterGlow = useSharedValue(0);
  const masterScale = useSharedValue(1);
  const scanLineY = useSharedValue(0);

  const applyBridgeConfig = useCallback(async () => {
    try {
      const config = await readBridgeConfig();
      if (config) {
        setBridgeHookEnabled(config.enabled || false);
        setBridgeMediaPath(config.mediaSourcePath || null);
        setBridgeCameraTarget(config.cameraTarget || 'front');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setBridgeSyncState({
        ok: false,
        code: 'write_failed',
        message,
        timestamp: Date.now(),
        attempts: 1,
      });
    }
  }, []);

  const syncBridgeState = useCallback(async (force = false) => {
    if (bridgeSyncInFlightRef.current) {
      await bridgeSyncInFlightRef.current;
      return;
    }

    const now = Date.now();
    if (!force && now - lastBridgeSyncAtRef.current < 400) {
      return;
    }

    const run = (async () => {
      try {
        await syncAllSettings(force);
        const bridgeSt = await getBridgeStatus();
        setBridgeVersion(bridgeSt.version);
        setBridgePath(bridgeSt.path);
        setBridgeReadable(bridgeSt.readable);
        setBridgeSyncState(bridgeSt.syncState);
        setLastSyncTime(new Date().toLocaleTimeString());
        await applyBridgeConfig();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setLastSyncTime(`Failed (${new Date().toLocaleTimeString()})`);
        setBridgeSyncState({
          ok: false,
          code: 'write_failed',
          message,
          timestamp: Date.now(),
          attempts: 1,
        });
      }
    })();

    bridgeSyncInFlightRef.current = run;
    try {
      await run;
    } finally {
      lastBridgeSyncAtRef.current = Date.now();
      bridgeSyncInFlightRef.current = null;
    }
  }, [applyBridgeConfig]);

  useEffect(() => {
    const unsubscribe = subscribeBridgeSyncState(state => {
      setBridgeSyncState(state);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void syncBridgeState();
  }, [hookEnabled, frontCamera, backCamera, selectedMedia, syncBridgeState]);

  useFocusEffect(
    useCallback(() => {
      void syncBridgeState(true);
    }, [syncBridgeState])
  );

  useEffect(() => {
    const loadInfo = async () => {
      setLoadingSystemInfo(true);
      const info = await getSystemInfo();
      setSystemInfo(info);
      setLoadingSystemInfo(false);
    };
    void loadInfo();
  }, []);

  useEffect(() => {
    if (isPerformance) {
      masterGlow.value = withTiming(0, { duration: 200 });
      scanLineY.value = withTiming(0, { duration: 200 });
      return;
    }
    if (hookEnabled) {
      masterGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      scanLineY.value = withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      masterGlow.value = withTiming(0, { duration: 400 });
      scanLineY.value = withTiming(0, { duration: 300 });
    }
  }, [hookEnabled, masterGlow, scanLineY, isPerformance]);

  const masterGlowStyle = useAnimatedStyle(() => ({
    ...(isWeb ? {} : { shadowOpacity: masterGlow.value * 0.45 }),
    borderColor: hookEnabled
      ? `rgba(10, 132, 255, ${masterGlow.value * 0.4})`
      : colors.border,
  }));

  const masterButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: masterScale.value }],
  }));

  const allSystemsReady = systemStatus.overallReady;
  const canEnableHook =
    systemStatus.rootAccess.status === 'ok' &&
    systemStatus.xposedFramework.status === 'ok' &&
    systemStatus.storagePermission.status === 'ok';

  const handleMasterToggle = useCallback(async () => {
    if (!hookEnabled && !canEnableHook) {
      warning();
      const failed = [
        systemStatus.rootAccess.status !== 'ok' ? '• Root / KernelSU not detected' : null,
        systemStatus.xposedFramework.status !== 'ok' ? '• LSPosed framework inactive' : null,
        systemStatus.storagePermission.status !== 'ok' ? '• Storage permission missing' : null,
      ].filter(Boolean).join('\n');
      Alert.alert('Prerequisites Not Met', `Cannot enable hook:\n\n${failed}\n\nOpen Setup to resolve.`);
      return;
    }

    if (hookEnabled) {
      warning();
    } else {
      heavyImpact();
      setTimeout(() => success(), 200);
    }
    const nextEnabled = !hookEnabled;
    setHookEnabled(nextEnabled);
    try {
      await writeBridgeConfig({ enabled: nextEnabled });
    } catch {
      // syncBridgeState surfaces bridge failures in UI state
    }
    await syncBridgeState(true);
  }, [
    hookEnabled,
    setHookEnabled,
    heavyImpact,
    success,
    warning,
    canEnableHook,
    systemStatus,
    syncBridgeState,
  ]);

  const handleRefreshStatus = useCallback(async () => {
    mediumImpact();
    await refreshSystemStatus();
    await syncBridgeState(true);
    setLoadingSystemInfo(true);
    const info = await getSystemInfo();
    setSystemInfo(info);
    setLoadingSystemInfo(false);
  }, [mediumImpact, refreshSystemStatus, syncBridgeState]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await handleRefreshStatus();
    setRefreshing(false);
  }, [handleRefreshStatus]);

  const handleSetup = useCallback(() => {
    mediumImpact();
    router.push('/onboarding');
  }, [mediumImpact, router]);

  const activeTargets = [frontCamera && 'Front', backCamera && 'Back'].filter(Boolean);

  const entering = (delay: number) =>
    isPerformance ? undefined : FadeInDown.delay(delay).duration(500);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.surfaceSolid}
        />
      }
    >
      {/* Header */}
      <Animated.View entering={entering(100)}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.appName, { color: colors.accent }]}>VIRTUCAM</Text>
            <Text style={[styles.appSubtitle, { color: colors.textTertiary }]}>Virtual Camera Engine</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={handleSetup}
              style={[styles.setupButton, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '40' }]}
            >
              <Ionicons name="settings-outline" size={16} color={colors.accent} />
              <Text style={[styles.setupButtonText, { color: colors.accent }]}>Setup Guide</Text>
            </Pressable>
            <View
              style={[
                styles.versionBadge,
                allSystemsReady
                  ? { backgroundColor: colors.electricBlue + '18', borderColor: colors.electricBlue + '40' }
                  : { backgroundColor: colors.warningAmber + '18', borderColor: colors.warningAmber + '40' },
              ]}
            >
              <View
                style={[
                  styles.versionDot,
                  { backgroundColor: allSystemsReady ? colors.electricBlue : colors.warningAmber },
                ]}
              />
              <Text
                style={[
                  styles.versionText,
                  { color: allSystemsReady ? colors.electricBlue : colors.warningAmber },
                ]}
              >
                {allSystemsReady ? 'READY' : 'SETUP'}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Master Control */}
      <Animated.View entering={entering(200)}>
        <Animated.View
          style={[
            styles.masterCard,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.border,
              ...(isWeb
                ? { boxShadow: `0 4px 48px ${colors.accent}` }
                : { shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowRadius: 24 }),
            },
            !isPerformance && masterGlowStyle,
            hookEnabled && { borderColor: colors.accent + '40' },
          ]}
        >
          <View style={styles.masterHeader}>
            <View style={styles.masterStatus}>
              <PulseIndicator
                active={hookEnabled && !isPerformance}
                color={hookEnabled ? colors.accent : colors.inactive}
                size={12}
              />
              <Text style={[styles.masterStatusText, { color: hookEnabled ? colors.accent : colors.textTertiary }]}>
                {hookEnabled ? 'HOOK ACTIVE' : 'HOOK INACTIVE'}
              </Text>
            </View>
            <View
              style={[
                styles.statusChip,
                hookEnabled
                  ? { backgroundColor: colors.accent + '20', borderColor: colors.accent + '40' }
                  : { backgroundColor: colors.surfaceLighter, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.statusChipText, { color: hookEnabled ? colors.accent : colors.textTertiary }]}>
                {hookEnabled ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          {hookEnabled && selectedMedia && (
            <Animated.View
              entering={isPerformance ? undefined : FadeIn.duration(400)}
              style={[styles.liveFeedContainer, { borderColor: colors.accent + '30' }]}
            >
              <Image
                source={{ uri: selectedMedia }}
                style={styles.liveFeedImage}
                contentFit="cover"
                transition={isPerformance ? 0 : 300}
              />
              <View style={styles.liveFeedOverlay}>
                <View style={styles.liveFeedBadge}>
                  <View style={styles.liveFeedDot} />
                  <Text style={styles.liveFeedText}>LIVE FEED</Text>
                </View>
                <View style={styles.liveFeedInfo}>
                  <Text style={[styles.liveFeedInfoText, { color: colors.textSecondary }]}>
                    {activeTargets.join(' + ')} CAM •{' '}
                    {aiEnhancement ? `AI: ${aiEnhancement}` : 'RAW'}
                  </Text>
                </View>
              </View>
              {!isPerformance && (
                <Animated.View
                  style={[styles.scanLine, { backgroundColor: colors.accent + '40' }]}
                />
              )}
            </Animated.View>
          )}

          <Animated.View style={isPerformance ? undefined : masterButtonStyle}>
            <Pressable
              onPressIn={() => {
                if (!isPerformance) masterScale.value = withSpring(0.95);
              }}
              onPressOut={() => {
                if (!isPerformance) masterScale.value = withSpring(1);
              }}
              onPress={handleMasterToggle}
              style={[
                styles.masterButton,
                hookEnabled
                  ? { backgroundColor: colors.accent + '12', borderColor: colors.accent + '50' }
                  : { backgroundColor: colors.surfaceLight, borderColor: colors.border },
              ]}
            >
              <Ionicons
                name={hookEnabled ? 'power' : 'power-outline'}
                size={40}
                color={hookEnabled ? colors.accent : colors.textSecondary}
              />
              <Text
                style={[
                  styles.masterButtonLabel,
                  { color: hookEnabled ? colors.accent : colors.textSecondary },
                ]}
              >
                {hookEnabled ? 'DISABLE HOOK' : 'ENABLE HOOK'}
              </Text>
            </Pressable>
          </Animated.View>

          <View style={[styles.statsRow, { borderTopColor: colors.separator }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {activeTargets.length > 0 ? activeTargets.join(' + ') : 'None'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Camera Target</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
            <View style={styles.statItem}>
              <Text
                style={[styles.statValue, { color: selectedMedia ? colors.success : colors.textPrimary }]}
              >
                {selectedMedia ? 'Ready' : 'No Media'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Source Status</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: hookEnabled ? colors.accent : colors.textPrimary }]}>
                {hookEnabled ? 'Live' : 'Idle'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Engine</Text>
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      {/* System Verification */}
      <Animated.View entering={entering(300)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="shield-checkmark" size={16} color={colors.electricBlue} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>System Verification</Text>
          {isChecking && <ActivityIndicator size="small" color={colors.electricBlue} />}
        </View>
        <View style={styles.systemGrid}>
          <SystemCheckCard
            label={systemStatus.rootAccess.label}
            detail={systemStatus.rootAccess.detail}
            status={systemStatus.rootAccess.status}
            icon="shield-checkmark"
          />
          <SystemCheckCard
            label={systemStatus.xposedFramework.label}
            detail={systemStatus.xposedFramework.detail}
            status={systemStatus.xposedFramework.status}
            icon="code-slash"
          />
          <SystemCheckCard
            label={systemStatus.moduleActive.label}
            detail={systemStatus.moduleActive.detail}
            status={systemStatus.moduleActive.status}
            icon="extension-puzzle"
          />
          <SystemCheckCard
            label={systemStatus.storagePermission.label}
            detail={systemStatus.storagePermission.detail}
            status={systemStatus.storagePermission.status}
            icon="folder"
          />
        </View>
      </Animated.View>

      {/* Camera Targeting */}
      <Animated.View entering={entering(400)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="camera-switch" size={16} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Camera Targeting</Text>
        </View>
        <View style={styles.section}>
          <SystemToggle
            label="Front Camera"
            sublabel="Override selfie / front-facing camera"
            value={frontCamera}
            onValueChange={setFrontCamera}
            icon={<Ionicons name="camera-reverse-outline" size={18} color={colors.accent} />}
            accentColor={colors.accent}
          />
          <SystemToggle
            label="Back Camera"
            sublabel="Override rear / main camera"
            value={backCamera}
            onValueChange={setBackCamera}
            icon={<Ionicons name="camera-outline" size={18} color={colors.accentLight} />}
            accentColor={colors.accentLight}
          />
        </View>
      </Animated.View>

      {/* Config Bridge */}
      <Animated.View entering={entering(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="bridge" size={16} color={colors.cyan} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Config Bridge</Text>
        </View>
        <Card>
          <View
            style={[
              styles.bridgeBanner,
              {
                backgroundColor: !bridgeSyncState.ok
                  ? colors.danger + '18'
                  : bridgeReadable && bridgeHookEnabled
                    ? colors.success + '18'
                    : bridgeReadable
                      ? colors.warningAmber + '18'
                      : colors.danger + '18',
              },
            ]}
          >
            <View
              style={[
                styles.miniDot,
                {
                  backgroundColor: !bridgeSyncState.ok
                    ? colors.danger
                    : bridgeReadable
                      ? bridgeHookEnabled ? colors.success : colors.warningAmber
                      : colors.danger,
                  width: 8, height: 8, borderRadius: 4,
                },
              ]}
            />
            <Text
              style={[
                styles.bridgeBannerText,
                {
                  color: !bridgeSyncState.ok
                    ? colors.danger
                    : bridgeReadable
                      ? bridgeHookEnabled ? colors.success : colors.warningAmber
                      : colors.danger,
                },
              ]}
            >
              {!bridgeSyncState.ok
                ? `BRIDGE SYNC FAILED (${bridgeSyncState.code ?? 'unknown'})`
                : bridgeReadable && bridgeHookEnabled
                  ? 'BRIDGE ACTIVE - HOOK LIVE'
                  : bridgeReadable
                    ? 'BRIDGE CONNECTED - HOOK INACTIVE'
                    : 'BRIDGE OFFLINE'}
            </Text>
          </View>
          {!bridgeSyncState.ok && (
            <View
              style={[
                styles.bridgeErrorBox,
                { backgroundColor: colors.danger + '12', borderColor: colors.danger + '35' },
              ]}
            >
              <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
              <Text style={[styles.bridgeErrorText, { color: colors.danger }]}>
                {bridgeSyncState.message}
              </Text>
            </View>
          )}
          <InfoRow
            icon="link-outline"
            label="Bridge Status"
            right={
              <View style={styles.infoValueRow}>
                <View style={[styles.miniDot, { backgroundColor: bridgeReadable ? colors.success : colors.danger }]} />
                <Text style={[styles.infoValue, { color: bridgeReadable ? colors.success : colors.danger }]}>
                  {bridgeReadable ? 'Connected' : 'Disconnected'}
                </Text>
              </View>
            }
          />
          <InfoRow
            icon="sync-outline"
            label="Sync State"
            value={bridgeSyncState.ok ? 'OK' : `${bridgeSyncState.code ?? 'error'}`}
            valueColor={bridgeSyncState.ok ? colors.success : colors.danger}
          />
          <InfoRow
            icon="power-outline"
            label="Hook Status"
            right={
              <View style={styles.infoValueRow}>
                <View style={[styles.miniDot, { backgroundColor: bridgeHookEnabled ? colors.accent : colors.inactive }]} />
                <Text style={[styles.infoValue, { color: bridgeHookEnabled ? colors.accent : colors.textTertiary }]}>
                  {bridgeHookEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
            }
          />
          <InfoRow
            icon="camera-outline"
            label="Camera Target"
            value={bridgeCameraTarget === 'both' ? 'Front & Back' : bridgeCameraTarget === 'front' ? 'Front Only' : 'Back Only'}
          />
          <InfoRow icon="apps-outline" label="Target Apps" value="Managed by LSPosed" />
          <InfoRow
            icon="image-outline"
            label="Active Media"
            value={bridgeMediaPath ? bridgeMediaPath.split('/').pop() ?? 'Unknown' : 'None selected'}
            dimValue={!bridgeMediaPath}
          />
          <InfoRow icon="code-slash-outline" label="Config Rev" value={`#${bridgeVersion}`} />
          <InfoRow
            icon="time-outline"
            label="Last Sync"
            value={lastSyncTime === 'Never' ? 'Syncing...' : lastSyncTime}
            last
          />
        </Card>
      </Animated.View>

      {/* System Information */}
      <Animated.View entering={entering(600)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>System Information</Text>
          {loadingSystemInfo && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
        <Card>
          {systemInfo ? (
            <>
              <InfoGroupHeader icon="phone-portrait-outline" label="DEVICE" />
              <InfoRow icon="hardware-chip-outline" label="Device" value={`${systemInfo.manufacturer} ${systemInfo.model}`} />
              <InfoRow icon="pricetag-outline" label="Brand" value={systemInfo.brand} />
              <InfoRow icon="cube-outline" label="Model" value={systemInfo.model} />
              <InfoRow icon="cube-outline" label="Product" value={systemInfo.product} />
              <GroupSeparator />
              <InfoGroupHeader icon="logo-android" label="ANDROID" />
              <InfoRow icon="logo-android" label="Android" value={`${systemInfo.androidVersion} (SDK ${systemInfo.sdkLevel})`} />
              <InfoRow icon="build-outline" label="Build" value={systemInfo.buildNumber} />
              <InfoRow icon="shield-checkmark-outline" label="Security" value={systemInfo.securityPatch} />
              <GroupSeparator />
              <InfoGroupHeader icon="terminal-outline" label="SYSTEM" />
              <InfoRow icon="key-outline" label="Root" value={`${systemInfo.rootSolution}${systemInfo.rootVersion ? ` ${systemInfo.rootVersion}` : ''}`} />
              <InfoRow icon="terminal-outline" label="Kernel" value={`${systemInfo.kernelVersion.split('\n')[0].slice(0, 42)}…`} />
              <InfoRow icon="shield-outline" label="SELinux" value={systemInfo.selinuxStatus} />
              <InfoRow icon="code-outline" label="ABI" value={systemInfo.abiList} />
              <InfoRow icon="save-outline" label="Storage" value={systemInfo.storage} />
              <InfoRow icon="hardware-chip-outline" label="Memory" value={systemInfo.maxMemory} />
              <InfoRow
                icon="finger-print-outline"
                label="Fingerprint"
                value={systemInfo.fingerprint.split('/').slice(-2).join('/')}
                last
              />
            </>
          ) : (
            <View style={[styles.infoRow, { borderBottomWidth: 0, borderBottomColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Status</Text>
              <Text style={[styles.infoValue, { color: colors.danger }]}>
                {loadingSystemInfo ? 'Loading...' : 'Unavailable'}
              </Text>
            </View>
          )}
        </Card>
      </Animated.View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function InfoGroupHeader({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.infoGroupHeader}>
      <Ionicons name={icon} size={11} color={colors.textTertiary} />
      <Text style={[styles.infoGroupLabel, { color: colors.textTertiary }]}>{label}</Text>
    </View>
  );
}

function GroupSeparator() {
  const { colors } = useTheme();
  return <View style={[styles.infoGroupSeparator, { backgroundColor: colors.separator }]} />;
}

function InfoRow({
  icon,
  label,
  value,
  right,
  last,
  dimValue,
  valueColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  right?: ReactNode;
  last?: boolean;
  dimValue?: boolean;
  valueColor?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.infoRow,
        { borderBottomColor: colors.border },
        last && { borderBottomWidth: 0 },
      ]}
    >
      <View style={styles.infoRowLeft}>
        <Ionicons name={icon} size={14} color={colors.textTertiary} />
        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      {right ?? (
        <Text
          style={[
            styles.infoValue,
            styles.infoValueFlex,
            { color: valueColor ?? (dimValue ? colors.textTertiary : colors.textPrimary) },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

function SystemCheckCard({
  label,
  detail,
  status,
  icon,
}: {
  label: string;
  detail: string;
  status: SystemCheckStatus;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const color = getStatusColor(status);
  const statusIcon = getStatusIcon(status);

  return (
    <View
      style={[
        styles.checkCard,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: color + '30',
        },
      ]}
    >
      <View style={styles.checkCardHeader}>
        <View style={[styles.checkIconCircle, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Ionicons name={statusIcon as keyof typeof Ionicons.glyphMap} size={16} color={color} />
      </View>
      <Text style={[styles.checkLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.checkDetail, { color }]}>{detail}</Text>
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  appName: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: 4,
  },
  appSubtitle: {
    fontSize: FontSize.xs,
    letterSpacing: 1,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  versionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  versionText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  masterCard: {
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    elevation: 8,
    overflow: 'hidden',
  },
  masterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  masterStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  masterStatusText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  statusChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  liveFeedContainer: {
    width: '100%',
    height: 160,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
    borderWidth: 1,
  },
  liveFeedImage: {
    width: '100%',
    height: '100%',
  },
  liveFeedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.sm,
  },
  liveFeedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  liveFeedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  liveFeedText: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  liveFeedInfo: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  liveFeedInfoText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
  },
  masterButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    gap: Spacing.md,
  },
  masterButtonLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: FontSize.xs,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
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
  section: {
    marginBottom: Spacing.lg,
  },
  systemGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  checkCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: BorderRadius.card,
    padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  checkCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  checkDetail: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: {
    fontSize: FontSize.md,
  },
  infoValue: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  infoValueFlex: {
    flex: 1,
    textAlign: 'right',
    marginLeft: Spacing.md,
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bridgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  bridgeBannerText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bridgeErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  bridgeErrorText: {
    flex: 1,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  infoRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  infoGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  infoGroupLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  infoGroupSeparator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
  },
  setupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  setupButtonText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
