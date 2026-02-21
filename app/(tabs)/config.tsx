import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
  Dimensions,
  Switch,
  NativeModules,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import { resolveMediaPath, type ResolvedPath } from '@/services/PathResolver';
import { writeBridgeConfig } from '@/services/ConfigBridge';
import HUDViewfinder from '@/components/media-studio/HUDViewfinder';
import SpanScalePanel from '@/components/media-studio/SpanScalePanel';
import PositionControl from '@/components/media-studio/PositionControl';

const { VirtuCamSettings } = NativeModules;

type ScaleMode = 'fit' | 'fill' | 'stretch';

type MediaItem = {
  uri: string;
  type: 'image' | 'video';
  name: string;
  timestamp: number;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_HEIGHT = SCREEN_WIDTH * 0.6;

export default function StudioScreen() {
  const insets = useSafeAreaInsets();
  const { lightImpact, heavyImpact, success } = useHaptics();

  // Hook enabled state for floating overlay
  const [hookEnabled] = useStorage(STORAGE_KEYS.HOOK_ENABLED, false);

  // Floating overlay state
  const [floatingBubbleEnabled, setFloatingBubbleEnabled] = useStorage(
    STORAGE_KEYS.FLOATING_BUBBLE,
    false
  );

  // Media state
  const [selectedMedia, setSelectedMedia] = useStorage<string | null>(
    STORAGE_KEYS.SELECTED_MEDIA,
    null
  );
  const [recentFiles, setRecentFiles] = useStorage<MediaItem[]>(STORAGE_KEYS.RECENT_FILES, []);
  const [selectedType, setSelectedType] = useState<'image' | 'video' | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvedPath, setResolvedPath] = useState<ResolvedPath | null>(null);

  // Transform state
  const [rotation, setRotation] = useStorage(STORAGE_KEYS.ROTATION, 0);
  const [mirrored, setMirrored] = useStorage(STORAGE_KEYS.MIRRORED, false);
  const [flippedVertical, setFlippedVertical] = useStorage(STORAGE_KEYS.FLIPPED_VERTICAL, false);
  const [scaleMode, setScaleMode] = useStorage<ScaleMode>(STORAGE_KEYS.SCALE_MODE, 'fit');
  const [offsetX, setOffsetX] = useStorage(STORAGE_KEYS.OFFSET_X, 0);
  const [offsetY, setOffsetY] = useStorage(STORAGE_KEYS.OFFSET_Y, 0);

  useEffect(() => {
    if (selectedMedia && recentFiles.length > 0) {
      const found = recentFiles.find(f => f.uri === selectedMedia);
      if (found) {
        setSelectedType(found.type);
      }
    }
    // Resolve path whenever media changes
    if (selectedMedia) {
      resolveMediaPath(selectedMedia)
        .then(resolved => {
          setResolvedPath(resolved);
          // Update bridge config with resolved absolute path
          writeBridgeConfig({ mediaSourcePath: resolved.absolutePath }).catch(() => {});
        })
        .catch(() => setResolvedPath(null));
    } else {
      setResolvedPath(null);
    }
  }, [selectedMedia, recentFiles]);

  const addToRecent = useCallback(
    (item: MediaItem) => {
      setRecentFiles((prev: MediaItem[]) => {
        const filtered = prev.filter(f => f.uri !== item.uri);
        return [item, ...filtered].slice(0, 20);
      });
    },
    [setRecentFiles]
  );

  const pickImage = useCallback(async () => {
    try {
      setLoading(true);
      lightImpact();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const item: MediaItem = {
          uri: asset.uri,
          type: 'image',
          name: asset.fileName || `Image_${Date.now()}`,
          timestamp: Date.now(),
        };
        setSelectedMedia(asset.uri);
        setSelectedType('image');
        addToRecent(item);
        success();
      }
    } catch {
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [lightImpact, success, setSelectedMedia, addToRecent]);

  const pickVideo = useCallback(async () => {
    try {
      setLoading(true);
      lightImpact();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 1,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const item: MediaItem = {
          uri: asset.uri,
          type: 'video',
          name: asset.fileName || `Video_${Date.now()}`,
          timestamp: Date.now(),
        };
        setSelectedMedia(asset.uri);
        setSelectedType('video');
        addToRecent(item);
        success();
      }
    } catch {
      Alert.alert('Error', 'Failed to pick video. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [lightImpact, success, setSelectedMedia, addToRecent]);

  const selectRecent = useCallback(
    (item: MediaItem) => {
      lightImpact();
      setSelectedMedia(item.uri);
      setSelectedType(item.type);
      addToRecent(item);
    },
    [lightImpact, setSelectedMedia, addToRecent]
  );

  const clearSelection = useCallback(() => {
    lightImpact();
    setSelectedMedia(null);
    setSelectedType(null);
  }, [lightImpact, setSelectedMedia]);

  const handleScaleModeChange = useCallback(
    (mode: ScaleMode) => {
      setScaleMode(mode);
      writeBridgeConfig({ scaleMode: mode }).catch(() => {});
    },
    [setScaleMode]
  );

  const handleMirrorToggle = useCallback(() => {
    setMirrored((prev: boolean) => {
      const newVal = !prev;
      writeBridgeConfig({ mirrored: newVal }).catch(() => {});
      return newVal;
    });
  }, [setMirrored]);

  const handleFlipToggle = useCallback(() => {
    setFlippedVertical((prev: boolean) => !prev);
  }, [setFlippedVertical]);

  const handleOffsetChange = useCallback(
    (x: number, y: number) => {
      setOffsetX(x);
      setOffsetY(y);
      writeBridgeConfig({ offsetX: x, offsetY: y }).catch(() => {});
    },
    [setOffsetX, setOffsetY]
  );

  const handleResetAll = useCallback(() => {
    Alert.alert(
      'Reset All Settings',
      'This will reset all media transformation settings to their defaults. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            heavyImpact();
            setRotation(0);
            setMirrored(false);
            setFlippedVertical(false);
            setScaleMode('fit');
            setOffsetX(0);
            setOffsetY(0);
            writeBridgeConfig({
              rotation: 0,
              mirrored: false,
              scaleMode: 'fit',
              offsetX: 0,
              offsetY: 0,
            }).catch(() => {});
            success();
          },
        },
      ]
    );
  }, [
    heavyImpact,
    success,
    setRotation,
    setMirrored,
    setFlippedVertical,
    setScaleMode,
    setOffsetX,
    setOffsetY,
  ]);

  // Request overlay permission
  const requestOverlayPermission = useCallback(async () => {
    if (!VirtuCamSettings) {
      Alert.alert('Error', 'Native module not available');
      return;
    }

    try {
      await VirtuCamSettings.requestOverlayPermission();
    } catch (err: unknown) {
      if (__DEV__) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Failed to request overlay permission:', message);
      }
    }
  }, []);

  // Handle floating overlay toggle
  const handleFloatingToggle = useCallback(
    async (value: boolean) => {
      if (!VirtuCamSettings) {
        Alert.alert('Error', 'Native module not available');
        return;
      }

      try {
        // 1. Check overlay permission FIRST
        if (value) {
          const hasPermission = await VirtuCamSettings.checkOverlayPermission();
          if (!hasPermission) {
            Alert.alert(
              'Permission Required',
              'Overlay permission is needed to display floating controls over other apps.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Grant Permission', onPress: () => requestOverlayPermission() },
              ]
            );
            return; // Don't enable if no permission
          }
        }

        // 2. Update state
        setFloatingBubbleEnabled(value);
        lightImpact();

        // 3. If disabling, stop the service immediately
        if (!value) {
          try {
            await VirtuCamSettings.stopFloatingOverlay();
          } catch (err: unknown) {
            if (__DEV__) {
              const message = err instanceof Error ? err.message : String(err);
              console.warn('Failed to stop overlay:', message);
            }
          }
        }
      } catch (err: unknown) {
        if (__DEV__) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('Error toggling floating overlay:', message);
        }
        Alert.alert('Error', 'Failed to toggle floating overlay. Please try again.');
      }
    },
    [setFloatingBubbleEnabled, lightImpact, requestOverlayPermission]
  );


  const renderRecentItem = ({ item }: { item: MediaItem }) => (
    <RecentFileCard
      item={item}
      isSelected={selectedMedia === item.uri}
      onPress={() => selectRecent(item)}
    />
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(50).duration(500)} style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <View>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons
                name="monitor-cellphone"
                size={22}
                color={Colors.electricBlue}
              />
              <Text style={styles.screenTitle}>Studio</Text>
            </View>
            <Text style={styles.screenSubtitle}>Media selection & transformation controls</Text>
          </View>
          <Pressable style={styles.resetAllButton} onPress={handleResetAll}>
            <MaterialCommunityIcons name="restore" size={14} color={Colors.textSecondary} />
            <Text style={styles.resetAllText}>RESET</Text>
          </Pressable>
        </View>

        {/* Status Bar */}
        <View style={styles.statusBar}>
          <LinearGradient
            colors={[Colors.electricBlue + '08', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.statusGradient}
          >
            <StatusChip
              label="Media"
              value={selectedMedia ? 'LOADED' : 'NONE'}
              color={selectedMedia ? Colors.success : Colors.warning}
            />
            <View style={styles.statusDivider} />
            <StatusChip label="Scale" value={scaleMode.toUpperCase()} color={Colors.cyan} />
            <View style={styles.statusDivider} />
            <StatusChip
              label="Offset"
              value={offsetX === 0 && offsetY === 0 ? 'CENTER' : 'CUSTOM'}
              color={offsetX === 0 && offsetY === 0 ? Colors.success : Colors.electricBlue}
            />
          </LinearGradient>
        </View>
      </Animated.View>

      {/* Floating Overlay Toggle */}
      <Animated.View entering={FadeInDown.delay(75).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons
            name="picture-in-picture-top-right"
            size={18}
            color={Colors.electricBlue}
          />
          <Text style={styles.sectionTitle}>Floating Tools</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.floatingToggleRow}>
            <View style={styles.floatingToggleInfo}>
              <Text style={styles.floatingToggleLabel}>Enable Floating Overlay</Text>
              <Text style={styles.floatingToggleDesc}>
                Show floating controls when you leave the app to adjust scale & position in
                real-time
              </Text>
            </View>
            <Switch
              value={floatingBubbleEnabled}
              onValueChange={handleFloatingToggle}
              trackColor={{ false: Colors.inactive, true: Colors.electricBlue + '60' }}
              thumbColor={floatingBubbleEnabled ? Colors.electricBlue : Colors.textTertiary}
            />
          </View>
          {/* Status indicator */}
          {floatingBubbleEnabled && (
            <View style={styles.floatingStatus}>
              <View style={styles.floatingStatusDot} />
              <Text style={styles.floatingStatusText}>
                Overlay will appear when you leave the app
              </Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* Media Library Section */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="images" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Media Library</Text>
        </View>

        {/* Live Preview */}
        <View style={styles.previewCard}>
          {selectedMedia ? (
            <View style={styles.previewContainer}>
              {selectedType === 'video' ? (
                <Video
                  source={{ uri: selectedMedia }}
                  style={styles.previewVideo}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={false}
                  isLooping
                  useNativeControls
                  isMuted={false}
                />
              ) : (
                <Image
                  source={{ uri: selectedMedia }}
                  style={styles.previewImage}
                  contentFit="contain"
                  transition={300}
                />
              )}
              <View style={styles.previewOverlay}>
                <View style={styles.previewBadge}>
                  <Ionicons
                    name={selectedType === 'video' ? 'videocam' : 'image'}
                    size={12}
                    color={Colors.textPrimary}
                  />
                  <Text style={styles.previewBadgeText}>
                    {selectedType === 'video' ? 'VIDEO' : 'IMAGE'}
                  </Text>
                </View>
                <Pressable onPress={clearSelection} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={20} color={Colors.textPrimary} />
                </Pressable>
              </View>
              {/* Floating OBS-style LIVE indicator when hook is enabled */}
              {hookEnabled && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </Animated.View>
              )}
            </View>
          ) : (
            <View style={styles.emptyPreview}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="eye-off-outline" size={32} color={Colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>No Media Selected</Text>
              <Text style={styles.emptySubtitle}>Pick an image or video below to preview</Text>
            </View>
          )}
        </View>

        {/* Media Picker */}
        <View style={styles.pickerGrid}>
          <PickerButton
            icon="image-outline"
            label="Pick Image"
            sublabel="JPG, PNG, WEBP"
            onPress={pickImage}
            loading={loading}
            color={Colors.accent}
          />
          <PickerButton
            icon="videocam-outline"
            label="Pick Video"
            sublabel="MP4, MOV, MKV"
            onPress={pickVideo}
            loading={loading}
            color={Colors.accentLight}
          />
        </View>

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <>
            <View style={styles.recentHeader}>
              <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.recentTitle}>Recent Files</Text>
              <Text style={styles.fileCount}>{recentFiles.length}</Text>
            </View>
            <FlatList
              data={recentFiles}
              renderItem={renderRecentItem}
              keyExtractor={item => item.uri + item.timestamp}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentList}
              scrollEnabled={true}
            />
          </>
        )}

        {/* Media Info */}
        {selectedMedia && resolvedPath && (
          <Animated.View entering={FadeIn.delay(200).duration(400)} style={styles.mediaInfoCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Type</Text>
              <Text style={styles.detailValue}>
                {selectedType === 'video' ? 'Video File' : 'Static Image'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>MIME</Text>
              <Text style={styles.detailValue}>{resolvedPath?.mimeType || 'Unknown'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Hook Status</Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: resolvedPath?.isAccessible ? Colors.electricBlue : Colors.warningAmber },
                ]}
              >
                {resolvedPath?.isAccessible ? 'Accessible' : 'Inaccessible'}
              </Text>
            </View>
            {resolvedPath && resolvedPath.fileSize > 0 && (
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.detailLabel}>File Size</Text>
                <Text style={styles.detailValue}>
                  {(resolvedPath.fileSize / 1024).toFixed(1)} KB
                </Text>
              </View>
            )}
          </Animated.View>
        )}
      </Animated.View>

      {/* Live Viewfinder */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="monitor-eye" size={18} color={Colors.electricBlue} />
          <Text style={styles.sectionTitle}>Live Viewfinder</Text>
        </View>
        <HUDViewfinder
          mediaUri={selectedMedia}
          rotation={rotation}
          mirrored={mirrored}
          flippedVertical={flippedVertical}
          scaleMode={scaleMode}
          offsetX={offsetX}
          offsetY={offsetY}
          aiOptimize={false}
          aiSubjectLock={false}
          aiLoading={false}
          engineActive={false}
        />
      </Animated.View>

      {/* Span & Scale */}
      <SpanScalePanel
        scaleMode={scaleMode}
        mirrored={mirrored}
        flippedVertical={flippedVertical}
        onScaleModeChange={handleScaleModeChange}
        onMirrorToggle={handleMirrorToggle}
        onFlipToggle={handleFlipToggle}
      />

      {/* Position Control */}
      <PositionControl offsetX={offsetX} offsetY={offsetY} onOffsetChange={handleOffsetChange} />

      {/* Footer spacer */}
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

function StatusChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statusChip}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <View>
        <Text style={styles.statusChipLabel}>{label}</Text>
        <Text style={[styles.statusChipValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

function PickerButton({
  icon,
  label,
  sublabel,
  onPress,
  loading,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  onPress: () => void;
  loading: boolean;
  color: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.pickerButtonWrapper, animStyle]}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.96);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        onPress={onPress}
        disabled={loading}
        style={[styles.pickerButton, { borderColor: color + '40' }]}
      >
        {loading ? (
          <ActivityIndicator color={color} size="small" />
        ) : (
          <View style={[styles.pickerIconCircle, { backgroundColor: color + '20' }]}>
            <Ionicons name={icon} size={24} color={color} />
          </View>
        )}
        <Text style={styles.pickerLabel}>{label}</Text>
        <Text style={styles.pickerSublabel}>{sublabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

function RecentFileCard({
  item,
  isSelected,
  onPress,
}: {
  item: MediaItem;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.recentCard, isSelected && styles.recentCardSelected]}
    >
      <Image
        source={{ uri: item.uri }}
        style={styles.recentThumb}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.recentInfo}>
        <Text style={styles.recentName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.recentMeta}>
          <Ionicons
            name={item.type === 'video' ? 'videocam' : 'image'}
            size={10}
            color={Colors.textTertiary}
          />
          <Text style={styles.recentType}>{item.type === 'video' ? 'VID' : 'IMG'}</Text>
        </View>
      </View>
      {isSelected && (
        <View style={styles.recentCheck}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  headerContainer: {
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  screenTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  screenSubtitle: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
    marginLeft: 30,
    letterSpacing: 0.5,
  },
  resetAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resetAllText: {
    color: Colors.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBar: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  statusDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  statusChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipLabel: {
    color: Colors.textTertiary,
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusChipValue: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  previewCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  previewContainer: {
    width: '100%',
    height: PREVIEW_HEIGHT,
    backgroundColor: Colors.surfaceLight,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewVideo: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.md,
  },
  previewOverlay: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.overlay,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  previewBadgeText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  clearButton: {
    backgroundColor: Colors.overlay,
    borderRadius: BorderRadius.full,
    padding: 4,
  },
  emptyPreview: {
    height: PREVIEW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
  },
  pickerGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  pickerButtonWrapper: {
    flex: 1,
  },
  pickerButton: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
  },
  pickerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  pickerSublabel: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  recentTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  fileCount: {
    color: Colors.accent,
    fontSize: FontSize.xs,
    fontWeight: '700',
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  recentList: {
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  recentCard: {
    width: 120,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.md,
  },
  recentCardSelected: {
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  recentThumb: {
    width: '100%',
    height: 80,
    backgroundColor: Colors.surfaceLight,
  },
  recentInfo: {
    padding: Spacing.sm,
  },
  recentName: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  recentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  recentType: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
  },
  recentCheck: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
  },
  mediaInfoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  detailValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  // Video play overlay styles
  videoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  videoPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.textPrimary,
  },
  videoPlayText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  // Live indicator styles (OBS-style)
  liveIndicator: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textPrimary,
  },
  liveText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  // Floating overlay toggle styles
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  floatingToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  floatingToggleInfo: {
    flex: 1,
  },
  floatingToggleLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  floatingToggleDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  floatingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  floatingStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.electricBlue,
  },
  floatingStatusText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
});
