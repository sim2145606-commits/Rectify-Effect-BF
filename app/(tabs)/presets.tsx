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
  Layout,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useHaptics } from '@/hooks/useHaptics';
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
      // Silently handle - empty list shown
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadPresets();
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
            } catch {
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
    if (!renameText.trim() || !renamingId) {
      return;
    }

    try {
      await renamePreset(renamingId, renameText.trim(), renameDesc.trim() || undefined);
      success();
      setRenamingId(null);
      setRenameText('');
      setRenameDesc('');
      await loadPresets();
    } catch {
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg }]}
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
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.screenTitle}>Local Presets</Text>
            <Text style={styles.screenSubtitle}>Save, manage & load camera configurations</Text>
          </View>
          <View style={styles.presetCountBadge}>
            <Text style={styles.presetCountValue}>{presets.length}</Text>
            <Text style={styles.presetCountLabel}>SAVED</Text>
          </View>
        </View>
      </Animated.View>

      {/* Save Current Config */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="save-outline" size={18} color={Colors.electricBlue} />
          <Text style={styles.sectionTitle}>Capture Configuration</Text>
        </View>

        {!showSaveForm ? (
          <Pressable
            onPress={() => {
              lightImpact();
              setShowSaveForm(true);
            }}
            style={styles.captureButton}
          >
            <View style={styles.captureIconCircle}>
              <MaterialCommunityIcons
                name="content-save-cog"
                size={28}
                color={Colors.electricBlue}
              />
            </View>
            <View style={styles.captureTextBlock}>
              <Text style={styles.captureTitle}>Save Current Config as Preset</Text>
              <Text style={styles.captureDesc}>
                Captures scale, mirror, offset, rotation & media
              </Text>
            </View>
            <Ionicons name="add-circle" size={24} color={Colors.electricBlue} />
          </Pressable>
        ) : (
          <Animated.View entering={FadeIn.duration(300)}>
            <Card glow glowColor={Colors.electricBlueGlow} style={styles.saveFormCard}>
              <View style={styles.saveFormHeader}>
                <MaterialCommunityIcons
                  name="content-save-cog"
                  size={20}
                  color={Colors.electricBlue}
                />
                <Text style={styles.saveFormTitle}>New Preset</Text>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Preset Name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Meeting Ready, Selfie Mode..."
                  placeholderTextColor={Colors.textTertiary}
                  value={presetName}
                  onChangeText={setPresetName}
                  maxLength={50}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Notes about this configuration..."
                  placeholderTextColor={Colors.textTertiary}
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
                  icon={<Ionicons name="save" size={14} color={Colors.textPrimary} />}
                />
              </View>
            </Card>
          </Animated.View>
        )}
      </Animated.View>

      {/* Preset Library */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="folder-multiple" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Preset Library</Text>
        </View>

        {loading ? (
          <Card style={styles.loadingCard}>
            <ActivityIndicator color={Colors.electricBlue} size="large" />
            <Text style={styles.loadingText}>Loading presets...</Text>
          </Card>
        ) : presets.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons
                name="folder-open-outline"
                size={36}
                color={Colors.textTertiary}
              />
            </View>
            <Text style={styles.emptyTitle}>No Presets Yet</Text>
            <Text style={styles.emptySubtitle}>
              Save your first camera configuration to get started
            </Text>
          </Card>
        ) : (
          presets.map((preset, index) => (
            <Animated.View
              key={preset.id}
              entering={FadeInDown.delay(100 * index).duration(400)}
              exiting={FadeOut.duration(200)}
              layout={Layout.springify()}
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

      <View style={{ height: 40 }} />
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
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.98);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        style={styles.presetCard}
      >
        {/* Header */}
        <View style={styles.presetHeader}>
          <View style={styles.presetIconBlock}>
            <MaterialCommunityIcons name="tune-vertical" size={20} color={Colors.electricBlue} />
          </View>
          <View style={styles.presetTextBlock}>
            {isRenaming ? (
              <View style={styles.renameInputs}>
                <TextInput
                  style={styles.renameInput}
                  value={renameText}
                  onChangeText={onRenameTextChange}
                  placeholder="Preset name"
                  placeholderTextColor={Colors.textTertiary}
                  maxLength={50}
                />
                <TextInput
                  style={[styles.renameInput, styles.renameDescInput]}
                  value={renameDesc}
                  onChangeText={onRenameDescChange}
                  placeholder="Description (optional)"
                  placeholderTextColor={Colors.textTertiary}
                  maxLength={200}
                />
              </View>
            ) : (
              <>
                <Text style={styles.presetName} numberOfLines={1}>
                  {preset.name}
                </Text>
                {preset.description && (
                  <Text style={styles.presetDescription} numberOfLines={1}>
                    {preset.description}
                  </Text>
                )}
              </>
            )}
            <Text style={styles.presetSummary} numberOfLines={1}>
              {summary}
            </Text>
          </View>
          <Text style={styles.presetDate}>{dateLabel}</Text>
        </View>

        {/* Actions */}
        <View style={styles.presetActions}>
          {isRenaming ? (
            <>
              <Pressable onPress={onCancelRename} style={styles.actionButton}>
                <Ionicons name="close" size={16} color={Colors.textSecondary} />
                <Text style={styles.actionButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSaveRename}
                style={[styles.actionButton, styles.actionButtonPrimary]}
              >
                <Ionicons name="checkmark" size={16} color={Colors.electricBlue} />
                <Text style={[styles.actionButtonText, { color: Colors.electricBlue }]}>Save</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={onDelete} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              </Pressable>
              <Pressable onPress={onRename} style={styles.renameButton}>
                <Ionicons name="pencil-outline" size={16} color={Colors.textSecondary} />
              </Pressable>
              <Pressable onPress={onApply} disabled={isApplying} style={styles.applyButton}>
                {isApplying ? (
                  <ActivityIndicator size={14} color={Colors.textPrimary} />
                ) : (
                  <Ionicons name="flash" size={14} color={Colors.textPrimary} />
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
    backgroundColor: Colors.background,
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
    color: Colors.textPrimary,
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  screenSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    marginTop: 4,
  },
  presetCountBadge: {
    backgroundColor: Colors.electricBlue + '15',
    borderWidth: 1,
    borderColor: Colors.electricBlue + '40',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  presetCountValue: {
    color: Colors.electricBlue,
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  presetCountLabel: {
    color: Colors.electricBlue,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 2,
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
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
    borderStyle: 'dashed',
    marginBottom: Spacing.lg,
  },
  captureIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.electricBlue + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureTextBlock: {
    flex: 1,
  },
  captureTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  captureDesc: {
    color: Colors.textTertiary,
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
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderColor: Colors.border,
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
    color: Colors.textSecondary,
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
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  presetCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.electricBlue + '12',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.electricBlue + '25',
  },
  presetTextBlock: {
    flex: 1,
  },
  presetName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  presetDescription: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  presetSummary: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  presetDate: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
  },
  renameInputs: {
    gap: Spacing.xs,
  },
  renameInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '40',
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
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.danger + '12',
    borderWidth: 1,
    borderColor: Colors.danger + '25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  applyButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionButtonPrimary: {
    backgroundColor: Colors.electricBlue + '15',
    borderColor: Colors.electricBlue + '40',
  },
  actionButtonText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
