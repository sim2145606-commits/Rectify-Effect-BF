import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import Card from '@/components/Card';
import GlowButton from '@/components/GlowButton';
import {
  performFullSync,
  getSyncStatus,
  fetchPresets,
  type SyncStatus,
  type CloudPreset,
} from '@/services/PresetService';

export default function CloudDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mediumImpact, success, heavyImpact } = useHaptics();

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: 'idle',
    lastSynced: null,
    presetCount: 0,
    cloudVerifiedApps: [],
  });
  const [presets, setPresets] = useState<CloudPreset[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Local device config for comparison
  const [hookEnabled] = useStorage(STORAGE_KEYS.HOOK_ENABLED, false);
  const [frontCamera] = useStorage(STORAGE_KEYS.FRONT_CAMERA, true);
  const [backCamera] = useStorage(STORAGE_KEYS.BACK_CAMERA, false);
  const [rotation] = useStorage(STORAGE_KEYS.ROTATION, 0);
  const [mirrored] = useStorage(STORAGE_KEYS.MIRRORED, false);
  const [scaleMode] = useStorage(STORAGE_KEYS.SCALE_MODE, 'fit');
  const [aiEnhancement] = useStorage<string | null>(STORAGE_KEYS.AI_ENHANCEMENT, null);

  // Electric Blue Pulse animations
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);
  const orbGlow = useSharedValue(0);
  const ringRotation = useSharedValue(0);

  useEffect(() => {
    // Main pulse
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 1200, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1200 }),
        withTiming(0.2, { duration: 1200 })
      ),
      -1,
      false
    );
    // Central orb glow
    orbGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    // Ring rotation
    ringRotation.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );
  }, [pulseScale, pulseOpacity, orbGlow, ringRotation]);

  const pulseAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const orbGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: orbGlow.value * 0.8,
    opacity: 0.6 + orbGlow.value * 0.4,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotation.value}deg` }],
  }));

  const loadData = useCallback(async () => {
    try {
      const [status, presetData] = await Promise.all([
        getSyncStatus(),
        fetchPresets(),
      ]);
      setSyncStatus(status);
      setPresets(presetData);
    } catch {
      setSyncStatus((prev) => ({ ...prev, state: 'error' }));
    } finally {
      setInitialLoad(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    heavyImpact();
    setSyncStatus((prev) => ({ ...prev, state: 'syncing' }));

    try {
      const status = await performFullSync();
      const presetData = await fetchPresets();
      setSyncStatus(status);
      setPresets(presetData);
      success();
    } catch {
      setSyncStatus((prev) => ({ ...prev, state: 'error' }));
    } finally {
      setIsSyncing(false);
    }
  }, [heavyImpact, success]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const formatLastSynced = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getSyncColor = () => {
    switch (syncStatus.state) {
      case 'syncing': return Colors.electricBlue;
      case 'synced': return Colors.success;
      case 'error': return Colors.danger;
      default: return Colors.textTertiary;
    }
  };

  const getSyncLabel = () => {
    switch (syncStatus.state) {
      case 'syncing': return 'SYNCHRONIZING';
      case 'synced': return 'SYNCHRONIZED';
      case 'error': return 'SYNC ERROR';
      default: return 'IDLE';
    }
  };

  // Device config summary
  const deviceConfig = {
    cameras: [frontCamera && 'Front', backCamera && 'Back'].filter(Boolean).join(' + ') || 'None',
    rotation: `${rotation}°`,
    mirrored: mirrored ? 'Yes' : 'No',
    scaleMode: scaleMode.toUpperCase(),
    aiFilter: aiEnhancement || 'None',
    hookStatus: hookEnabled ? 'Active' : 'Inactive',
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.lg },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={Colors.electricBlue}
          colors={[Colors.electricBlue]}
          progressBackgroundColor={Colors.surface}
        />
      }
    >
      {/* Header with Back Button */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              mediumImpact();
              router.back();
            }}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTextBlock}>
            <Text style={styles.screenTitle}>Cloud Command</Text>
            <Text style={styles.screenSubtitle}>Device ↔ Cloud sync dashboard</Text>
          </View>
        </View>
      </Animated.View>

      {/* Sync Orb Visual */}
      <Animated.View entering={FadeIn.delay(200).duration(800)}>
        <View style={styles.orbContainer}>
          {/* Pulse rings */}
          <Animated.View style={[styles.pulseRing, styles.pulseRingOuter, pulseAnimStyle]} />
          <Animated.View style={[styles.pulseRing, styles.pulseRingMiddle, pulseAnimStyle]} />

          {/* Rotating ring */}
          <Animated.View style={[styles.rotatingRing, ringStyle]}>
            <View style={styles.ringDot} />
            <View style={[styles.ringDot, styles.ringDotOpposite]} />
          </Animated.View>

          {/* Central Orb */}
          <Animated.View style={[styles.centralOrb, orbGlowStyle]}>
            {isSyncing ? (
              <ActivityIndicator size="large" color={Colors.electricBlue} />
            ) : (
              <MaterialCommunityIcons
                name="cloud-sync"
                size={36}
                color={Colors.electricBlue}
              />
            )}
          </Animated.View>

          {/* Status Label */}
          <View style={[styles.syncStatusChip, { borderColor: getSyncColor() + '60' }]}>
            <View style={[styles.syncStatusDot, { backgroundColor: getSyncColor() }]} />
            <Text style={[styles.syncStatusText, { color: getSyncColor() }]}>
              {getSyncLabel()}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Sync Action */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <GlowButton
          label={isSyncing ? 'Syncing...' : 'Force Sync Now'}
          variant="primary"
          size="large"
          fullWidth
          onPress={handleSync}
          loading={isSyncing}
          icon={
            !isSyncing ? (
              <Ionicons name="sync" size={18} color={Colors.textPrimary} />
            ) : undefined
          }
        />
      </Animated.View>

      {/* Sync Metrics */}
      <Animated.View entering={FadeInDown.delay(400).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="chart-timeline-variant" size={18} color={Colors.electricBlue} />
          <Text style={styles.sectionTitle}>Sync Metrics</Text>
        </View>
        <View style={styles.metricsGrid}>
          <MetricCard
            icon="clock-outline"
            label="Last Synced"
            value={formatLastSynced(syncStatus.lastSynced)}
            color={Colors.electricBlue}
          />
          <MetricCard
            icon="cloud-check"
            label="Cloud Presets"
            value={`${syncStatus.presetCount}`}
            color={Colors.success}
          />
          <MetricCard
            icon="shield-check"
            label="Verified Apps"
            value={`${syncStatus.cloudVerifiedApps.length}`}
            color={Colors.accent}
          />
          <MetricCard
            icon="connection"
            label="Sync State"
            value={syncStatus.state === 'synced' ? 'OK' : syncStatus.state.toUpperCase()}
            color={getSyncColor()}
          />
        </View>
      </Animated.View>

      {/* Device Configuration */}
      <Animated.View entering={FadeInDown.delay(500).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="cellphone-cog" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Device Configuration</Text>
          <View style={[styles.liveBadge, hookEnabled && styles.liveBadgeActive]}>
            <View style={[styles.liveDot, { backgroundColor: hookEnabled ? Colors.success : Colors.textTertiary }]} />
            <Text style={[styles.liveText, hookEnabled && { color: Colors.success }]}>
              {hookEnabled ? 'LIVE' : 'IDLE'}
            </Text>
          </View>
        </View>
        <Card glow={hookEnabled} glowColor={Colors.electricBlueGlow}>
          <ConfigRow label="Hook Status" value={deviceConfig.hookStatus} highlighted={hookEnabled} />
          <ConfigRow label="Camera Targets" value={deviceConfig.cameras} />
          <ConfigRow label="Rotation" value={deviceConfig.rotation} />
          <ConfigRow label="Mirrored" value={deviceConfig.mirrored} />
          <ConfigRow label="Scale Mode" value={deviceConfig.scaleMode} />
          <ConfigRow label="AI Filter" value={deviceConfig.aiFilter} last />
        </Card>
      </Animated.View>

      {/* Cloud Presets Summary */}
      <Animated.View entering={FadeInDown.delay(600).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="cloud-outline" size={18} color={Colors.cyan} />
          <Text style={styles.sectionTitle}>Cloud Configurations</Text>
        </View>
        {initialLoad ? (
          <Card style={styles.loadingCard}>
            <ActivityIndicator color={Colors.electricBlue} />
          </Card>
        ) : presets.length === 0 ? (
          <Card style={styles.emptyCard}>
            <MaterialCommunityIcons name="cloud-off-outline" size={24} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No cloud configurations found</Text>
          </Card>
        ) : (
          presets.slice(0, 5).map((preset, index) => (
            <Animated.View
              key={preset.id}
              entering={FadeInDown.delay(50 * index).duration(300)}
            >
              <CloudPresetRow preset={preset} />
            </Animated.View>
          ))
        )}
        {presets.length > 5 && (
          <Text style={styles.morePresetsText}>
            +{presets.length - 5} more configurations in cloud
          </Text>
        )}
      </Animated.View>

      {/* Cloud Verified Apps */}
      {syncStatus.cloudVerifiedApps.length > 0 && (
        <Animated.View entering={FadeInDown.delay(700).duration(500)}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-done-circle" size={18} color={Colors.success} />
            <Text style={styles.sectionTitle}>Cloud Verified Apps</Text>
          </View>
          <Card>
            <View style={styles.verifiedAppsGrid}>
              {syncStatus.cloudVerifiedApps.map((pkg) => (
                <View key={pkg} style={styles.verifiedAppChip}>
                  <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                  <Text style={styles.verifiedAppText} numberOfLines={1}>
                    {pkg.split('.').pop()}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </Animated.View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.metricCard, animStyle]}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.96); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        style={[styles.metricCardInner, { borderColor: color + '25' }]}
      >
        <View style={[styles.metricIcon, { backgroundColor: color + '15' }]}>
          <MaterialCommunityIcons name={icon} size={18} color={color} />
        </View>
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function ConfigRow({
  label,
  value,
  highlighted,
  last,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.configRow, !last && styles.configRowBorder]}>
      <Text style={styles.configLabel}>{label}</Text>
      <Text style={[styles.configValue, highlighted && { color: Colors.electricBlue }]}>
        {value}
      </Text>
    </View>
  );
}

function CloudPresetRow({ preset }: { preset: CloudPreset }) {
  const targetCount = Array.isArray(preset.target_apps) ? preset.target_apps.length : 0;

  return (
    <View style={styles.cloudPresetRow}>
      <View style={styles.cloudPresetIcon}>
        <MaterialCommunityIcons name="tune-vertical" size={16} color={Colors.electricBlue} />
      </View>
      <View style={styles.cloudPresetInfo}>
        <Text style={styles.cloudPresetName} numberOfLines={1}>{preset.name}</Text>
        <Text style={styles.cloudPresetMeta}>
          {preset.camera_front ? 'Front' : ''}{preset.camera_front && preset.camera_back ? '+' : ''}{preset.camera_back ? 'Back' : ''} • {preset.scale_mode} • {targetCount} apps
        </Text>
      </View>
      <View style={styles.cloudVerifiedBadge}>
        <Ionicons name="cloud-done" size={14} color={Colors.electricBlue} />
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTextBlock: {
    flex: 1,
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
    marginTop: 2,
  },
  // Sync Orb
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    marginBottom: Spacing.xxl,
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Colors.electricBlue + '40',
  },
  pulseRingOuter: {
    width: 160,
    height: 160,
  },
  pulseRingMiddle: {
    width: 120,
    height: 120,
  },
  rotatingRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '20',
    borderStyle: 'dashed',
  },
  ringDot: {
    position: 'absolute',
    top: -4,
    left: '50%',
    marginLeft: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.electricBlue,
  },
  ringDotOpposite: {
    top: undefined,
    bottom: -4,
  },
  centralOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.electricBlue + '15',
    borderWidth: 2,
    borderColor: Colors.electricBlue + '50',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.electricBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 10,
  },
  syncStatusChip: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  syncStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncStatusText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
  },
  metricCardInner: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
  },
  metricIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  metricLabel: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLighter,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  liveBadgeActive: {
    backgroundColor: Colors.success + '15',
    borderColor: Colors.success + '40',
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  liveText: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  configRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  configLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  configValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
  },
  cloudPresetRow: {
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
  cloudPresetIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.electricBlue + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudPresetInfo: {
    flex: 1,
  },
  cloudPresetName: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  cloudPresetMeta: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  cloudVerifiedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.electricBlue + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedAppsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  verifiedAppChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + '12',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  verifiedAppText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: '600',
    maxWidth: 80,
  },
  morePresetsText: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
