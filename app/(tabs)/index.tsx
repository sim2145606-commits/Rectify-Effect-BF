import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import Card from '@/components/Card';
import PulseIndicator from '@/components/PulseIndicator';
import SystemToggle from '@/components/SystemToggle';

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { heavyImpact, success, warning } = useHaptics();

  const [hookEnabled, setHookEnabled] = useStorage(STORAGE_KEYS.HOOK_ENABLED, false);
  const [frontCamera, setFrontCamera] = useStorage(STORAGE_KEYS.FRONT_CAMERA, true);
  const [backCamera, setBackCamera] = useStorage(STORAGE_KEYS.BACK_CAMERA, false);
  const [selectedMedia] = useStorage<string | null>(STORAGE_KEYS.SELECTED_MEDIA, null);

  const masterGlow = useSharedValue(0);
  const masterScale = useSharedValue(1);

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
    } else {
      masterGlow.value = withTiming(0, { duration: 400 });
    }
  }, [hookEnabled, masterGlow]);

  const masterGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: masterGlow.value * 0.6,
    borderColor: `rgba(0, 122, 255, ${masterGlow.value * 0.5})`,
  }));

  const masterButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: masterScale.value }],
  }));

  const handleMasterToggle = () => {
    if (hookEnabled) {
      warning();
    } else {
      heavyImpact();
      setTimeout(() => success(), 200);
    }
    setHookEnabled(!hookEnabled);
  };

  const activeTargets = [
    frontCamera && 'Front',
    backCamera && 'Back',
  ].filter(Boolean);

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
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v1.0</Text>
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
                color={hookEnabled ? Colors.success : Colors.inactive}
                size={12}
              />
              <Text style={styles.masterStatusText}>
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
                color={hookEnabled ? Colors.textPrimary : Colors.textSecondary}
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
              <Text style={styles.statValue}>
                {selectedMedia ? 'Ready' : 'No Media'}
              </Text>
              <Text style={styles.statLabel}>Source Status</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, hookEnabled && { color: Colors.success }]}>
                {hookEnabled ? 'Live' : 'Idle'}
              </Text>
              <Text style={styles.statLabel}>Engine</Text>
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      {/* Camera Targeting */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
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

      {/* System Information */}
      <Animated.View entering={FadeInDown.delay(400).duration(500)}>
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
            <Text style={styles.infoValue}>Camera2 API Intercept</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Compatibility</Text>
            <Text style={styles.infoValue}>Android 10 – 16</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Engine</Text>
            <Text style={styles.infoValue}>VirtuCam Core v1.0</Text>
          </View>
        </Card>
      </Animated.View>

      {/* Diagnostics */}
      <Animated.View entering={FadeInDown.delay(500).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="chart-line" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Quick Diagnostics</Text>
        </View>
        <View style={styles.diagnosticsGrid}>
          <DiagnosticCard
            icon="checkmark-circle"
            label="Camera Service"
            status={hookEnabled ? 'Active' : 'Standby'}
            active={hookEnabled}
          />
          <DiagnosticCard
            icon="document-text"
            label="Media Source"
            status={selectedMedia ? 'Loaded' : 'Empty'}
            active={!!selectedMedia}
          />
          <DiagnosticCard
            icon="shield-checkmark"
            label="Permissions"
            status="Granted"
            active={true}
          />
          <DiagnosticCard
            icon="speedometer"
            label="Performance"
            status={hookEnabled ? 'Optimal' : 'N/A'}
            active={hookEnabled}
          />
        </View>
      </Animated.View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function DiagnosticCard({
  icon,
  label,
  status,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  status: string;
  active: boolean;
}) {
  return (
    <View
      style={[
        styles.diagCard,
        active && {
          borderColor: Colors.accent + '40',
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={active ? Colors.accent : Colors.textTertiary}
      />
      <Text style={styles.diagLabel}>{label}</Text>
      <Text
        style={[
          styles.diagStatus,
          active && { color: Colors.success },
        ]}
      >
        {status}
      </Text>
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
    color: Colors.accent,
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
  versionBadge: {
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.accent + '40',
  },
  versionText: {
    color: Colors.accent,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  masterCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: Colors.accent,
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
    backgroundColor: Colors.success + '20',
    borderWidth: 1,
    borderColor: Colors.success + '40',
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
    color: Colors.success,
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
    backgroundColor: Colors.accent + '15',
    borderColor: Colors.accent + '50',
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
    color: Colors.accent,
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
  },
  section: {
    marginBottom: Spacing.lg,
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
  diagnosticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  diagCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  diagLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  diagStatus: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
