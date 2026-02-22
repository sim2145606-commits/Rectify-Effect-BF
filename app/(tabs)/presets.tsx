import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';
import { useTheme } from '@/context/ThemeContext';
import Card from '@/components/Card';
import GlowButton from '@/components/GlowButton';
import {
  fetchPresets,
  savePreset,
  deletePreset,
  renamePreset,
  applyPreset,
  captureCurrentConfig,
  type LocalPreset,
} from '@/services/PresetService';

export default function PresetsScreen() {
  const insets = useSafeAreaInsets();
  const { lightImpact, mediumImpact, success, warning, heavyImpact } = useHaptics();
  const { colors, isPerformance } = useTheme();

  const [presets, setPresets] = useState<LocalPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameDesc, setRenameDesc] = useState('');

  const loadPresets = useCallback(async () => {
    try {
      const data = await fetchPresets();
      setPresets(data);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadPresets();
  }, [loadPresets]);

  const handleSavePreset = useCallback(async () => {
    if (!presetName.trim()) {
      Alert.alert('Required', 'Please enter a preset name.');
      return;
    }

    setSaving(true);
    mediumImpact();

    try {
      const config = await captureCurrentConfig();
      await savePreset({
        ...config,
        name: presetName.trim(),
        description: presetDesc.trim() || undefined,
      });

      success();
      setPresetName('');
      setPresetDesc('');
      setShowSaveForm(false);
      await loadPresets();
    } catch (err) {
      warning();
      Alert.alert('Save Failed', err instanceof Error ? err.message : 'Could not save preset.');
    } finally {
      setSaving(false);
    }
  }, [presetName, presetDesc, mediumImpact, success, warning, loadPresets]);

  const handleApplyPreset = useCallback(
    async (preset: LocalPreset) => {
      setApplyingId(preset.id);
      heavyImpact();

      try {
        await applyPreset(preset);
        success();
        Alert.alert('Preset Applied', `"${preset.name}" has been loaded. Settings are now active.`);
      } catch {
        warning();
        Alert.alert('Apply Failed', 'Could not apply this preset.');
      } finally {
        setApplyingId(null);
      }
    },
    [heavyImpact, success, warning]
  );

  const handleDeletePreset = useCallback(
    (preset: LocalPreset) => {
      lightImpact();
      Alert.alert('Delete Preset', `Remove "${preset.name}" permanently?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePreset(preset.id);
              success();
              await loadPresets();
            } catch (err: unknown) {
              const errorMsg = err instanceof Error ? err.message.replace(/[\r\n]/g, '') : String(err).replace(/[\r\n]/g, '');
              if (__DEV__) console.error(`Failed to delete preset: ${errorMsg}`);
              Alert.alert('Error', 'Failed to delete preset.');
            }
          },
        },
      ]);
    },
    [lightImpact, success, loadPresets]
  );

  const handleStartRename = useCallback(
    (preset: LocalPreset) => {
      lightImpact();
      setRenamingId(preset.id);
      setRenameText(preset.name);
      setRenameDesc(preset.description || '');
    },
    [lightImpact]
  );

  const handleSaveRename = useCallback(async () => {
    if (!renameText.trim() || !renamingId) return;

    try {
      await renamePreset(renamingId, renameText.trim(), renameDesc.trim() || undefined);
      success();
      setRenamingId(null);
      setRenameText('');
      setRenameDesc('');
      await loadPresets();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message.replace(/[\r\n]/g, '') : String(err).replace(/[\r\n]/g, '');
      if (__DEV__) console.error(`Failed to rename preset: ${errorMsg}`);
      warning();
      Alert.alert('Error', 'Failed to rename preset.');
    }
  }, [renamingId, renameText, renameDesc, success, warning, loadPresets]);

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameText('');
    setRenameDesc('');
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPresetSummary = (preset: LocalPreset) => {
    const parts: string[] = [];
    if (preset.camera_front && preset.camera_back) parts.push('Dual Cam');
    else if (preset.camera_front) parts.push('Front Cam');
    else if (preset.camera_back) parts.push('Back Cam');
    if (preset.mirrored) parts.push('Mirrored');
    if (preset.rotation !== 0) parts.push(`${preset.rotation}°`);
    parts.push(preset.scale_mode.toUpperCase());
    if (preset.offset_x !== 0 || preset.offset_y !== 0) {
      parts.push(`Offset: ${preset.offset_x},${preset.offset_y}`);
    }
    return parts.join(' • ');
  };

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
          onRefresh={handleRefresh}
          tintColor={colors.electricBlue}
          colors={[colors.electricBlue]}
          progressBackgroundColor={colors.surfaceSolid}
        />
      }
    >
      {/* Header */}
      <Animated.View entering={entering(100)}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextBlock}>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Local Presets</Text>
            <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
              Save, manage &amp; load camera configurations
            </Text>
          </View>
          <View
            style={[
              styles.presetCountBadge,
              { backgroundColor: colors.electricBlue + '18', borderColor: colors.electricBlue + '40' },
            ]}
          >
            <Text style={[styles.presetCountValue, { color: colors.electricBlue }]}>{presets.length}</Text>
            <Text style={[styles.presetCountLabel, { color: colors.electricBlue }]}>SAVED</Text>
          </View>
        </View>
      </Animated.View>

      {/* Save Current Config */}
      <Animated.View entering={entering(200)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="save-outline" size={16} color={colors.electricBlue} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Capture Configuration</Text>
        </View>

        {!showSaveForm ? (
          <Pressable
            onPress={() => {
              lightImpact();
              setShowSaveForm(true);
            }}
            style={[
              styles.captureButton,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.electricBlue + '30',
              },
            ]}
          >
            <View style={[styles.captureIconCircle, { backgroundColor: colors.electricBlue + '18' }]}>
              <MaterialCommunityIcons name="content-save-cog" size={28} color={colors.electricBlue} />
            </View>
            <View style={styles.captureTextBlock}>
              <Text style={[styles.captureTitle, { color: colors.textPrimary }]}>
                Save Current Config as Preset
              </Text>
              <Text style={[styles.captureDesc, { color: colors.textTertiary }]}>
                Captures scale, mirror, offset, rotation &amp; media
              </Text>
            </View>
            <Ionicons name="add-circle" size={24} color={colors.electricBlue} />
          </Pressable>
        ) : (
          <Animated.View entering={isPerformance ? undefined : FadeIn.duration(300)}>
            <Card glow glowColor={colors.electricBlueGlow} style={styles.saveFormCard}>
              <View style={styles.saveFormHeader}>
                <MaterialCommunityIcons name="content-save-cog" size={20} color={colors.electricBlue} />
                <Text style={[styles.saveFormTitle, { color: colors.textPrimary }]}>New Preset</Text>
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Preset Name *</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.surfaceLight,
                      color: colors.textPrimary,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="e.g. Meeting Ready, Selfie Mode..."
                  placeholderTextColor={colors.textTertiary}
                  value={presetName}
                  onChangeText={setPresetName}
                  maxLength={50}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Description (optional)</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    styles.textArea,
                    {
                      backgroundColor: colors.surfaceLight,
                      color: colors.textPrimary,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="Notes about this configuration..."
                  placeholderTextColor={colors.textTertiary}
                  value={presetDesc}
                  onChangeText={setPresetDesc}
                  multiline
                  numberOfLines={2}
                  maxLength={200}
                />
              </View>
              <View style={styles.saveFormActions}>
                <GlowButton
                  label="Cancel"
                  variant="secondary"
                  size="small"
                  onPress={() => {
                    setShowSaveForm(false);
                    setPresetName('');
                    setPresetDesc('');
                  }}
                />
                <GlowButton
                  label="Save Preset"
                  variant="primary"
                  size="small"
                  onPress={handleSavePreset}
                  loading={saving}
                  icon={<Ionicons name="save" size={14} color={colors.textPrimary} />}
                />
              </View>
            </Card>
          </Animated.View>
        )}
      </Animated.View>

      {/* Preset Library */}
      <Animated.View entering={entering(300)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="folder-multiple" size={16} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Preset Library</Text>
        </View>

        {loading ? (
          <Card style={styles.loadingCard}>
            <ActivityIndicator color={colors.electricBlue} size="large" />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading presets...</Text>
          </Card>
        ) : presets.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceLight }]}>
              <MaterialCommunityIcons name="folder-open-outline" size={36} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No Presets Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
              Save your first camera configuration to get started
            </Text>
          </Card>
        ) : (
          presets.map((preset, index) => (
            <Animated.View
              key={preset.id}
              entering={isPerformance ? undefined : FadeInDown.delay(100 * index).duration(400)}
              exiting={isPerformance ? undefined : FadeOut.duration(200)}
              layout={isPerformance ? undefined : LinearTransition.springify()}
            >
              <PresetCard
                preset={preset}
                onApply={() => handleApplyPreset(preset)}
                onDelete={() => handleDeletePreset(preset)}
                onRename={() => handleStartRename(preset)}
                isApplying={applyingId === preset.id}
                isRenaming={renamingId === preset.id}
                renameText={renameText}
                renameDesc={renameDesc}
                onRenameTextChange={setRenameText}
                onRenameDescChange={setRenameDesc}
                onSaveRename={handleSaveRename}
                onCancelRename={handleCancelRename}
                summary={getPresetSummary(preset)}
                dateLabel={formatDate(preset.created_at)}
              />
            </Animated.View>
          ))
        )}
      </Animated.View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function PresetCard({
  preset,
  onApply,
  onDelete,
  onRename,
  isApplying,
  isRenaming,
  renameText,
  renameDesc,
  onRenameTextChange,
  onRenameDescChange,
  onSaveRename,
  onCancelRename,
  summary,
  dateLabel,
}: {
  preset: LocalPreset;
  onApply: () => void;
  onDelete: () => void;
  onRename: () => void;
  isApplying: boolean;
  isRenaming: boolean;
  renameText: string;
  renameDesc: string;
  onRenameTextChange: (text: string) => void;
  onRenameDescChange: (text: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  summary: string;
  dateLabel: string;
}) {
  const { colors, isPerformance } = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={isPerformance ? undefined : animStyle}>
      <Pressable
        onPressIn={() => {
          if (!isPerformance) scale.value = withSpring(0.98);
        }}
        onPressOut={() => {
          if (!isPerformance) scale.value = withSpring(1);
        }}
        style={[
          styles.presetCard,
          { backgroundColor: colors.surfaceCard, borderColor: colors.border },
        ]}
      >
        <View style={styles.presetHeader}>
          <View
            style={[
              styles.presetIconBlock,
              { backgroundColor: colors.electricBlue + '14', borderColor: colors.electricBlue + '28' },
            ]}
          >
            <MaterialCommunityIcons name="tune-vertical" size={20} color={colors.electricBlue} />
          </View>
          <View style={styles.presetTextBlock}>
            {isRenaming ? (
              <View style={styles.renameInputs}>
                <TextInput
                  style={[
                    styles.renameInput,
                    {
                      backgroundColor: colors.surfaceLight,
                      color: colors.textPrimary,
                      borderColor: colors.electricBlue + '40',
                    },
                  ]}
                  value={renameText}
                  onChangeText={onRenameTextChange}
                  placeholder="Preset name"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={50}
                />
                <TextInput
                  style={[
                    styles.renameInput,
                    styles.renameDescInput,
                    {
                      backgroundColor: colors.surfaceLight,
                      color: colors.textPrimary,
                      borderColor: colors.electricBlue + '40',
                    },
                  ]}
                  value={renameDesc}
                  onChangeText={onRenameDescChange}
                  placeholder="Description (optional)"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={200}
                />
              </View>
            ) : (
              <>
                <Text style={[styles.presetName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {preset.name}
                </Text>
                {preset.description && (
                  <Text style={[styles.presetDescription, { color: colors.textSecondary }]} numberOfLines={1}>
                    {preset.description}
                  </Text>
                )}
              </>
            )}
            <Text style={[styles.presetSummary, { color: colors.textTertiary }]} numberOfLines={1}>
              {summary}
            </Text>
          </View>
          <Text style={[styles.presetDate, { color: colors.textTertiary }]}>{dateLabel}</Text>
        </View>

        <View style={[styles.presetActions, { borderTopColor: colors.separator }]}>
          {isRenaming ? (
            <>
              <Pressable
                onPress={onCancelRename}
                style={[styles.actionButton, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
              >
                <Ionicons name="close" size={16} color={colors.textSecondary} />
                <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSaveRename}
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.electricBlue + '18', borderColor: colors.electricBlue + '40' },
                ]}
              >
                <Ionicons name="checkmark" size={16} color={colors.electricBlue} />
                <Text style={[styles.actionButtonText, { color: colors.electricBlue }]}>Save</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                onPress={onDelete}
                style={[
                  styles.deleteButton,
                  { backgroundColor: colors.danger + '14', borderColor: colors.danger + '28' },
                ]}
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </Pressable>
              <Pressable
                onPress={onRename}
                style={[
                  styles.renameButton,
                  { backgroundColor: colors.surfaceLight, borderColor: colors.border },
                ]}
              >
                <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={onApply}
                disabled={isApplying}
                style={[styles.applyButton, { backgroundColor: colors.accent, shadowColor: colors.accent }]}
              >
                {isApplying ? (
                  <ActivityIndicator size={14} color="#FFFFFF" />
                ) : (
                  <Ionicons name="flash" size={14} color="#FFFFFF" />
                )}
                <Text style={styles.applyButtonText}>{isApplying ? 'LOADING...' : 'LOAD'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xxl,
  },
  headerTextBlock: {
    flex: 1,
  },
  screenTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  screenSubtitle: {
    fontSize: FontSize.md,
    marginTop: 4,
  },
  presetCountBadge: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  presetCountValue: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  presetCountLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 2,
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
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    borderRadius: BorderRadius.card,
    padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.lg,
  },
  captureIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureTextBlock: {
    flex: 1,
  },
  captureTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  captureDesc: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  saveFormCard: {
    marginBottom: Spacing.lg,
  },
  saveFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  saveFormTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  textInput: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textArea: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  saveFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  loadingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxxl,
  },
  loadingText: {
    fontSize: FontSize.sm,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxxl,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  presetCard: {
    borderRadius: BorderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  presetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  presetIconBlock: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  presetTextBlock: {
    flex: 1,
  },
  presetName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  presetDescription: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  presetSummary: {
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  presetDate: {
    fontSize: FontSize.xs,
  },
  renameInputs: {
    gap: Spacing.xs,
  },
  renameInput: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontSize: FontSize.sm,
    borderWidth: 1,
  },
  renameDescInput: {
    fontSize: FontSize.xs,
  },
  presetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
