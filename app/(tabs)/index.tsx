import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
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
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { getStatusColor, getStatusIcon, type SystemCheckStatus } from '@/services/SystemVerification';
import { syncAllSettings, getBridgeStatus } from '@/services/ConfigBridge';
import Card from '@/components/Card';
import PulseIndicator from '@/components/PulseIndicator';
import SystemToggle from '@/components/SystemToggle';

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { heavyImpact, success, warning, mediumImpact } = useHaptics();

  const [hookEnabled, setHookEnabled] = useStorage(STORAGE_KEYS.HOOK_ENABLED, false);
  const [frontCamera, setFrontCamera] = useStorage(STORAGE_KEYS.FRONT_CAMERA, true);
  const [backCamera, setBackCamera] = useStorage(STORAGE_KEYS.BACK_CAMERA, false);
  const [selectedMedia] = useStorage<string | null>(STORAGE_KEYS.SELECTED_MEDIA, null);
  const [aiEnhancement] = useStorage<string | null>(STORAGE_KEYS.AI_ENHANCEMENT, null);

  const { status: systemStatus, isChecking, refresh: refreshSystemStatus } = useSystemStatus(30000);
  const [bridgeVersion, setBridgeVersion] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Never');

  const masterGlow = useSharedValue(0);
  const masterScale = useSharedValue(1);
  const scanLineY = useSharedValue(0);

  // Sync bridge config whenever key settings change
  useEffect(() => {
    const doSync = async () => {
      try {
        await syncAllSettings();
        const bridgeSt = await getBridgeStatus();
        setBridgeVersion(bridgeSt.version);
        setLastSyncTime(new Date().toLocaleTimeString());
      } catch {
        // Silent
      }
    };
    doSync();
  }, [hookEnabled, frontCamera, backCamera, selectedMedia]);

  useEffect(() => {
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
  }, [hookEnabled, masterGlow, scanLineY]);

  const masterGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: masterGlow.value * 0.6,
    borderColor: hookEnabled
      ? `rgba(0, 212, 255, ${masterGlow.value * 0.5})`
      : Colors.border,
  }));

  const masterButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: masterScale.value }],
  }));

  const scanLineStyle = useAnimatedStyle(() => ({
    top: `${scanLineY.value * 100}%` as `${number}%`,
  }));

  const handleMasterToggle = useCallback(async () => {
    if (hookEnabled) {
      warning();
    } else {
      heavyImpact();
      setTimeout(() => success(), 200);
    }
    setHookEnabled(!hookEnabled);
  }, [hookEnabled, setHookEnabled, heavyImpact, success, warning]);

  const handleRefreshStatus = useCallback(async () => {
    mediumImpact();
    await refreshSystemStatus();
    await syncAllSettings();
    const bridgeSt = await getBridgeStatus();
    setBridgeVersion(bridgeSt.version);
    setLastSyncTime(new Date().toLocaleTimeString());
  }, [mediumImpact, refreshSystemStatus]);

  const activeTargets = [
    frontCamera && 'Front',
    backCamera && 'Back',
  ].filter(Boolean);

  const allSystemsReady = systemStatus.overallReady;

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
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>VIRTUCAM</Text>
            <Text style={styles.appSubtitle}>Virtual Camera Engine</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable onPress={handleRefreshStatus} style={styles.refreshButton}>
              {isChecking ? (
                <ActivityIndicator color={Colors.electricBlue} size="small" />
              ) : (
                <Ionicons name="refresh" size={18} color={Colors.electricBlue} />
              )}
            </Pressable>
            <View style={[styles.versionBadge, allSystemsReady ? styles.versionBadgeReady : styles.versionBadgeWarn]}>
              <View style={[styles.versionDot, { backgroundColor: allSystemsReady ? Colors.electricBlue : Colors.warningAmber }]} />
              <Text style={[styles.versionText, { color: allSystemsReady ? Colors.electricBlue : Colors.warningAmber }]}>
                {allSystemsReady ? 'READY' : 'SETUP'}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Master Control */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <Animated.View
          style={[
            styles.masterCard,
            masterGlowStyle,
            hookEnabled && styles.masterCardActive,
          ]}
        >
          <View style={styles.masterHeader}>
            <View style={styles.masterStatus}>
              <PulseIndicator
                active={hookEnabled}
                color={hookEnabled ? Colors.electricBlue : Colors.inactive}
                size={12}
              />
              <Text style={[styles.masterStatusText, hookEnabled && { color: Colors.electricBlue }]}>
                {hookEnabled ? 'HOOK ACTIVE' : 'HOOK INACTIVE'}
              </Text>
            </View>
            <View
              style={[
                styles.statusChip,
                hookEnabled ? styles.statusChipActive : styles.statusChipInactive,
              ]}
            >
              <Text
                style={[
                  styles.statusChipText,
                  hookEnabled ? styles.statusChipTextActive : undefined,
                ]}
              >
                {hookEnabled ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          {/* Live Feed Monitor */}
          {hookEnabled && selectedMedia && (
            <Animated.View entering={FadeIn.duration(400)} style={styles.liveFeedContainer}>
              <Image
                source={{ uri: selectedMedia }}
                style={styles.liveFeedImage}
                contentFit="cover"
                transition={300}
              />
              <View style={styles.liveFeedOverlay}>
                <View style={styles.liveFeedBadge}>
                  <View style={styles.liveFeedDot} />
                  <Text style={styles.liveFeedText}>LIVE FEED</Text>
                </View>
                <View style={styles.liveFeedInfo}>
                  <Text style={styles.liveFeedInfoText}>
                    {activeTargets.join(' + ')} CAM • {aiEnhancement ? `AI: ${aiEnhancement}` : 'RAW'}
                  </Text>
                </View>
              </View>
              {/* Scan line effect */}
              <Animated.View style={[styles.scanLine, scanLineStyle]} />
            </Animated.View>
          )}

          <Animated.View style={masterButtonStyle}>
            <Pressable
              onPressIn={() => {
                masterScale.value = withSpring(0.95);
              }}
              onPressOut={() => {
                masterScale.value = withSpring(1);
              }}
              onPress={handleMasterToggle}
              style={[
                styles.masterButton,
                hookEnabled ? styles.masterButtonActive : styles.masterButtonInactive,
              ]}
            >
              <Ionicons
                name={hookEnabled ? 'power' : 'power-outline'}
                size={40}
                color={hookEnabled ? Colors.electricBlue : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.masterButtonLabel,
                  hookEnabled && styles.masterButtonLabelActive,
                ]}
              >
                {hookEnabled ? 'DISABLE HOOK' : 'ENABLE HOOK'}
              </Text>
            </Pressable>
          </Animated.View>

          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {activeTargets.length > 0 ? activeTargets.join(' + ') : 'None'}
              </Text>
              <Text style={styles.statLabel}>Camera Target</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, selectedMedia ? { color: Colors.success } : undefined]}>
                {selectedMedia ? 'Ready' : 'No Media'}
              </Text>
              <Text style={styles.statLabel}>Source Status</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, hookEnabled && { color: Colors.electricBlue }]}>
                {hookEnabled ? 'Live' : 'Idle'}
              </Text>
              <Text style={styles.statLabel}>Engine</Text>
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      {/* System Verification Status */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.electricBlue} />
          <Text style={styles.sectionTitle}>System Verification</Text>
          {isChecking && <ActivityIndicator size="small" color={Colors.electricBlue} />}
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
      <Animated.View entering={FadeInDown.delay(400).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="camera-switch" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Camera Targeting</Text>
        </View>
        <View style={styles.section}>
          <SystemToggle
            label="Front Camera"
            sublabel="Override selfie / front-facing camera"
            value={frontCamera}
            onValueChange={setFrontCamera}
            icon={
              <Ionicons name="camera-reverse-outline" size={18} color={Colors.accent} />
            }
            accentColor={Colors.accent}
          />
          <SystemToggle
            label="Back Camera"
            sublabel="Override rear / main camera"
            value={backCamera}
            onValueChange={setBackCamera}
            icon={
              <Ionicons name="camera-outline" size={18} color={Colors.accentLight} />
            }
            accentColor={Colors.accentLight}
          />
        </View>
      </Animated.View>

      {/* Bridge Status */}
      <Animated.View entering={FadeInDown.delay(500).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="bridge" size={18} color={Colors.cyan} />
          <Text style={styles.sectionTitle}>Config Bridge</Text>
        </View>
        <Card>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Bridge Status</Text>
            <View style={styles.infoValueRow}>
              <View style={[styles.miniDot, { backgroundColor: Colors.electricBlue }]} />
              <Text style={[styles.infoValue, { color: Colors.electricBlue }]}>Connected</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Config Version</Text>
            <Text style={styles.infoValue}>v{bridgeVersion}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Last Sync</Text>
            <Text style={styles.infoValue}>{lastSyncTime}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Storage Path</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              /virtucam/bridge.json
            </Text>
          </View>
        </Card>
      </Animated.View>

      {/* System Integrity Access */}
      <Animated.View entering={FadeInDown.delay(520).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.success} />
          <Text style={styles.sectionTitle}>System Integrity</Text>
        </View>
        <Pressable
          onPress={() => {
            mediumImpact();
            router.push('/integrity');
          }}
          style={styles.integrityCard}
        >
          <View style={styles.integrityIconCircle}>
            <Ionicons name="scan" size={28} color={Colors.success} />
          </View>
          <View style={styles.integrityText}>
            <Text style={styles.integrityTitle}>Pre-Flight Diagnostic</Text>
            <Text style={styles.integrityDesc}>
              One-tap integrity scan, log exporter & connectivity heartbeat
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.success} />
        </Pressable>
      </Animated.View>

      {/* System Engine Access */}
      <Animated.View entering={FadeInDown.delay(550).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="hardware-chip" size={18} color={Colors.cyan} />
          <Text style={styles.sectionTitle}>System Engine</Text>
        </View>
        <Pressable
          onPress={() => {
            mediumImpact();
            router.push('/engine');
          }}
          style={styles.engineAccessCard}
        >
          <View style={styles.engineAccessIconCircle}>
            <Ionicons name="cog" size={28} color={Colors.cyan} />
          </View>
          <View style={styles.engineAccessText}>
            <Text style={styles.engineAccessTitle}>Engine Diagnostics & Control</Text>
            <Text style={styles.engineAccessDesc}>
              System setup, injection hooks & engine initialization
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.cyan} />
        </Pressable>
      </Animated.View>

      {/* Cloud Command Access */}
      <Animated.View entering={FadeInDown.delay(600).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="cloud-sync" size={18} color={Colors.electricBlue} />
          <Text style={styles.sectionTitle}>Cloud Command</Text>
        </View>
        <Pressable
          onPress={() => {
            mediumImpact();
            router.push('/cloud');
          }}
          style={styles.cloudCommandCard}
        >
          <View style={styles.cloudCommandIconCircle}>
            <MaterialCommunityIcons name="cloud-sync" size={28} color={Colors.electricBlue} />
          </View>
          <View style={styles.cloudCommandText}>
            <Text style={styles.cloudCommandTitle}>Cloud Command Dashboard</Text>
            <Text style={styles.cloudCommandDesc}>
              View sync status, cloud presets & verified configurations
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.electricBlue} />
        </Pressable>
      </Animated.View>

      {/* System Information */}
      <Animated.View entering={FadeInDown.delay(700).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>System Information</Text>
        </View>
        <Card>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Platform</Text>
            <Text style={styles.infoValue}>{Platform.OS === 'android' ? 'Android' : Platform.OS}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Hook Method</Text>
            <Text style={styles.infoValue}>Camera2 + Camera1 Adaptive</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Compatibility</Text>
            <Text style={styles.infoValue}>Android 9 – 16</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Engine</Text>
            <Text style={styles.infoValue}>VirtuCam Core v2.0</Text>
          </View>
        </Card>
      </Animated.View>

      <View style={{ height: 40 }} />
    </ScrollView>
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
  const color = getStatusColor(status);
  const statusIcon = getStatusIcon(status);

  return (
    <View
      style={[
        styles.checkCard,
        {
          borderColor: color + '30',
        },
      ]}
    >
      <View style={styles.checkCardHeader}>
        <View style={[styles.checkIconCircle, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Ionicons
          name={statusIcon as keyof typeof Ionicons.glyphMap}
          size={16}
          color={color}
        />
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
      <Text style={[styles.checkDetail, { color }]}>{detail}</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  appName: {
    color: Colors.electricBlue,
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: 3,
  },
  appSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    letterSpacing: 1,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  versionBadgeReady: {
    backgroundColor: Colors.electricBlue + '15',
    borderColor: Colors.electricBlue + '40',
  },
  versionBadgeWarn: {
    backgroundColor: Colors.warningAmber + '15',
    borderColor: Colors.warningAmber + '40',
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
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 8,
  },
  masterCardActive: {
    backgroundColor: Colors.surface,
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
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  statusChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusChipActive: {
    backgroundColor: Colors.electricBlue + '20',
    borderWidth: 1,
    borderColor: Colors.electricBlue + '40',
  },
  statusChipInactive: {
    backgroundColor: Colors.surfaceLighter,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusChipText: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statusChipTextActive: {
    color: Colors.electricBlue,
  },
  liveFeedContainer: {
    width: '100%',
    height: 160,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
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
    backgroundColor: Colors.textPrimary,
  },
  liveFeedText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  liveFeedInfo: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  liveFeedInfoText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.electricBlue + '40',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  masterButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    gap: Spacing.md,
  },
  masterButtonActive: {
    backgroundColor: Colors.electricBlue + '10',
    borderColor: Colors.electricBlue + '50',
  },
  masterButtonInactive: {
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  masterButtonLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '800',
    letterSpacing: 2,
  },
  masterButtonLabelActive: {
    color: Colors.electricBlue,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
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
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
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
    color: Colors.textSecondary,
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  infoValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
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
  engineAccessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.cyan + '30',
    marginBottom: Spacing.lg,
    shadowColor: Colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  engineAccessIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.cyan + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cyan + '30',
  },
  engineAccessText: {
    flex: 1,
  },
  engineAccessTitle: {
    color: Colors.cyan,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  engineAccessDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  integrityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.success + '30',
    marginBottom: Spacing.lg,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  integrityIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.success + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  integrityText: {
    flex: 1,
  },
  integrityTitle: {
    color: Colors.success,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  integrityDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  cloudCommandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
    marginBottom: Spacing.lg,
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  cloudCommandIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.electricBlue + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
  },
  cloudCommandText: {
    flex: 1,
  },
  cloudCommandTitle: {
    color: Colors.electricBlue,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  cloudCommandDesc: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});
