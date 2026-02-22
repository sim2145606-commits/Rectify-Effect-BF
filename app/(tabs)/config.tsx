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
import { FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import { useTheme } from '@/context/ThemeContext';
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
  const { colors, isPerformance } = useTheme();

  // Hook enabled state for floating overlay
  const [hookEnabled] = useStorage(STORAGE_KEYS.HOOK_ENABLED, false);

  // Floating overlay state
  const [floatingBubbleEnabled, setFloatingBubbleEnabled] = useStorage(
    STORAGE_KEYS.FLOATING_BUBBLE,
    false
  );
  const [overlayRuntimeState, setOverlayRuntimeState] = useState<'running' | 'stopped' | 'no_permission' | 'unknown'>('unknown');

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

  const refreshOverlayRuntimeState = useCallback(async () => {
    if (!VirtuCamSettings) {
      setOverlayRuntimeState('unknown');
      return;
    }

    try {
      const hasPermission = await VirtuCamSettings.checkOverlayPermission();
      if (!hasPermission) {
        setOverlayRuntimeState('no_permission');
        return;
      }

      const isRunning = await VirtuCamSettings.isOverlayRunning();
      setOverlayRuntimeState(isRunning ? 'running' : 'stopped');
    } catch {
      setOverlayRuntimeState('unknown');
    }
  }, []);

  useEffect(() => {
    void refreshOverlayRuntimeState();
    const timer = setInterval(() => {
      void refreshOverlayRuntimeState();
    }, 4000);

    return () => clearInterval(timer);
  }, [refreshOverlayRuntimeState]);

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

        // 3. Start/stop service to keep runtime in sync with toggle state
        if (value) {
          await VirtuCamSettings.startFloatingOverlay();
        }

        // If disabling, stop the service immediately
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

        void refreshOverlayRuntimeState();
      } catch (err: unknown) {
        if (__DEV__) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('Error toggling floating overlay:', message);
        }
        // Revert toggle if runtime action failed
        setFloatingBubbleEnabled(!value);
        const message = err instanceof Error ? err.message : String(err);
        Alert.alert('Error', `Failed to toggle floating overlay. ${message}`);
      }
    },
    [setFloatingBubbleEnabled, lightImpact, requestOverlayPermission, refreshOverlayRuntimeState]
  );


  const startOverlayNow = useCallback(async () => {
    if (!VirtuCamSettings) {
      Alert.alert('Error', 'Native module not available');
      return;
    }
    try {
      await VirtuCamSettings.startFloatingOverlay();
      setFloatingBubbleEnabled(true);
      lightImpact();
      void refreshOverlayRuntimeState();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert('Unable to start overlay', message);
      void refreshOverlayRuntimeState();
    }
  }, [setFloatingBubbleEnabled, lightImpact, refreshOverlayRuntimeState]);

  const stopOverlayNow = useCallback(async () => {
    if (!VirtuCamSettings) {
      Alert.alert('Error', 'Native module not available');
      return;
    }
    try {
      await VirtuCamSettings.stopFloatingOverlay();
      lightImpact();
      void refreshOverlayRuntimeState();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert('Unable to stop overlay', message);
      void refreshOverlayRuntimeState();
    }
  }, [lightImpact, refreshOverlayRuntimeState]);


  const renderRecentItem = ({ item }: { item: MediaItem }) => (
    <RecentFileCard
      item={item}
      isSelected={selectedMedia === item.uri}
      onPress={() => selectRecent(item)}
    />
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(50).duration(500)} style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <View>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="monitor-cellphone" size={22} color={colors.electricBlue} />
              <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Studio</Text>
            </View>
            <Text style={[styles.screenSubtitle, { color: colors.textTertiary }]}>
              Media selection &amp; transformation controls
            </Text>
          </View>
          <Pressable
            style={[styles.resetAllButton, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
            onPress={handleResetAll}
          >
            <MaterialCommunityIcons name="restore" size={14} color={colors.textSecondary} />
            <Text style={[styles.resetAllText, { color: colors.textSecondary }]}>RESET</Text>
          </Pressable>
        </View>

        {/* Status Bar */}
        <View style={[styles.statusBar, { borderColor: colors.border }]}>
          <LinearGradient
            colors={[colors.electricBlue + '08', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.statusGradient}
          >
            <StatusChip
              label="Media"
              value={selectedMedia ? 'LOADED' : 'NONE'}
              color={selectedMedia ? colors.success : colors.warningAmber}
            />
            <View style={[styles.statusDivider, { backgroundColor: colors.border }]} />
            <StatusChip label="Scale" value={scaleMode.toUpperCase()} color={colors.cyan} />
            <View style={[styles.statusDivider, { backgroundColor: colors.border }]} />
            <StatusChip
              label="Offset"
              value={offsetX === 0 && offsetY === 0 ? 'CENTER' : 'CUSTOM'}
              color={offsetX === 0 && offsetY === 0 ? colors.success : colors.electricBlue}
            />
          </LinearGradient>
        </View>
      </Animated.View>

      {/* Floating Overlay Toggle */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(75).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="picture-in-picture-top-right" size={16} color={colors.electricBlue} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Floating Tools</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <View style={styles.floatingToggleRow}>
            <View style={styles.floatingToggleInfo}>
              <Text style={[styles.floatingToggleLabel, { color: colors.textPrimary }]}>
                Enable Floating Overlay
              </Text>
              <Text style={[styles.floatingToggleDesc, { color: colors.textSecondary }]}>
                Show floating controls when you leave the app to adjust scale &amp; position in real-time
              </Text>
            </View>
            <Switch
              value={floatingBubbleEnabled}
              onValueChange={handleFloatingToggle}
              trackColor={{ false: colors.inactive, true: colors.electricBlue + '60' }}
              thumbColor={floatingBubbleEnabled ? colors.electricBlue : colors.textTertiary}
            />
          </View>
          {/* Status indicator */}
          {floatingBubbleEnabled && (
            <View style={[styles.floatingStatus, { borderTopColor: colors.separator }]}>
              <View
                style={[
                  styles.floatingStatusDot,
                  {
                    backgroundColor:
                      overlayRuntimeState === 'running'
                        ? colors.success
                        : overlayRuntimeState === 'no_permission'
                          ? colors.danger
                          : colors.warningAmber,
                  },
                ]}
              />
              <Text style={[styles.floatingStatusText, { color: colors.textSecondary }]}>
                {overlayRuntimeState === 'running'
                  ? 'Overlay is running now'
                  : overlayRuntimeState === 'stopped'
                    ? 'Overlay enabled, currently stopped'
                    : overlayRuntimeState === 'no_permission'
                      ? 'Overlay permission missing'
                      : 'Overlay status unknown'}
              </Text>
            </View>
          )}

          <View style={styles.floatingActionRow}>
            <Pressable
              style={[styles.floatingActionButton, { borderColor: colors.border, backgroundColor: colors.surfaceLight }]}
              onPress={startOverlayNow}
            >
              <Text style={[styles.floatingActionButtonText, { color: colors.textPrimary }]}>Start Now</Text>
            </Pressable>
            <Pressable
              style={[styles.floatingActionButton, { borderColor: colors.border, backgroundColor: colors.surfaceLight }]}
              onPress={stopOverlayNow}
            >
              <Text style={[styles.floatingActionButtonText, { color: colors.textPrimary }]}>Stop Now</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>

      {/* Media Library Section */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(100).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="images" size={16} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Media Library</Text>
        </View>

        {/* Live Preview */}
        <View style={[styles.previewCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          {selectedMedia ? (
            <View style={[styles.previewContainer, { backgroundColor: colors.surfaceLight }]}>
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
                    color="#FFFFFF"
                  />
                  <Text style={styles.previewBadgeText}>
                    {selectedType === 'video' ? 'VIDEO' : 'IMAGE'}
                  </Text>
                </View>
                <Pressable onPress={clearSelection} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={20} color="#FFFFFF" />
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
              <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceLight }]}>
                <Ionicons name="eye-off-outline" size={32} color={colors.textTertiary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No Media Selected</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
                Pick an image or video below to preview
              </Text>
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
            color={colors.accent}
          />
          <PickerButton
            icon="videocam-outline"
            label="Pick Video"
            sublabel="MP4, MOV, MKV"
            onPress={pickVideo}
            loading={loading}
            color={colors.accentLight}
          />
        </View>

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <>
            <View style={styles.recentHeader}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.recentTitle, { color: colors.textSecondary }]}>Recent Files</Text>
              <Text style={[styles.fileCount, { color: colors.accent, backgroundColor: colors.accent + '20' }]}>
                {recentFiles.length}
              </Text>
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
          <Animated.View
            entering={isPerformance ? undefined : FadeIn.delay(200).duration(400)}
            style={[styles.mediaInfoCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
          >
            <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Type</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                {selectedType === 'video' ? 'Video File' : 'Static Image'}
              </Text>
            </View>
            <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>MIME</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                {resolvedPath?.mimeType || 'Unknown'}
              </Text>
            </View>
            <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Hook Status</Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: resolvedPath?.isAccessible ? colors.electricBlue : colors.warningAmber },
                ]}
              >
                {resolvedPath?.isAccessible ? 'Accessible' : 'Inaccessible'}
              </Text>
            </View>
            {resolvedPath && resolvedPath.fileSize > 0 && (
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>File Size</Text>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                  {(resolvedPath.fileSize / 1024).toFixed(1)} KB
                </Text>
              </View>
            )}
          </Animated.View>
        )}
      </Animated.View>

      {/* Live Viewfinder */}
      <Animated.View entering={isPerformance ? undefined : FadeInDown.delay(200).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="monitor-eye" size={16} color={colors.electricBlue} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Live Viewfinder</Text>
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
  const { colors } = useTheme();
  return (
    <View style={styles.statusChip}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <View>
        <Text style={[styles.statusChipLabel, { color: colors.textTertiary }]}>{label}</Text>
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

  const { colors } = useTheme();
  return (
    <Animated.View style={[styles.pickerButtonWrapper, animStyle]}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.96); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={onPress}
        disabled={loading}
        style={[styles.pickerButton, { backgroundColor: colors.surfaceCard, borderColor: color + '40' }]}
      >
        {loading ? (
          <ActivityIndicator color={color} size="small" />
        ) : (
          <View style={[styles.pickerIconCircle, { backgroundColor: color + '20' }]}>
            <Ionicons name={icon} size={24} color={color} />
          </View>
        )}
        <Text style={[styles.pickerLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.pickerSublabel, { color: colors.textTertiary }]}>{sublabel}</Text>
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
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.recentCard,
        { backgroundColor: colors.surfaceCard, borderColor: colors.border },
        isSelected && { borderColor: colors.accent, borderWidth: 2 },
      ]}
    >
      <Image
        source={{ uri: item.uri }}
        style={[styles.recentThumb, { backgroundColor: colors.surfaceLight }]}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.recentInfo}>
        <Text style={[styles.recentName, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.recentMeta}>
          <Ionicons
            name={item.type === 'video' ? 'videocam' : 'image'}
            size={10}
            color={colors.textTertiary}
          />
          <Text style={[styles.recentType, { color: colors.textTertiary }]}>
            {item.type === 'video' ? 'VID' : 'IMG'}
          </Text>
        </View>
      </View>
      {isSelected && (
        <View style={styles.recentCheck}>
          <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  screenSubtitle: {
    fontSize: FontSize.xs,
    marginTop: 2,
    marginLeft: 30,
    letterSpacing: 0.5,
  },
  resetAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resetAllText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBar: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
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
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flex: 1,
  },
  previewCard: {
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.md,
  },
  previewContainer: {
    width: '100%',
    height: PREVIEW_HEIGHT,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  previewBadgeText: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  clearButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  emptySubtitle: {
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
    borderRadius: BorderRadius.card,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  pickerSublabel: {
    fontSize: FontSize.xs,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  recentTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  fileCount: {
    fontSize: FontSize.xs,
    fontWeight: '700',
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
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: Spacing.md,
  },
  recentThumb: {
    width: '100%',
    height: 80,
  },
  recentInfo: {
    padding: Spacing.sm,
  },
  recentName: {
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
    fontSize: FontSize.xs,
  },
  recentCheck: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
  },
  mediaInfoCard: {
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: {
    fontSize: FontSize.sm,
  },
  detailValue: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
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
    borderColor: '#FFFFFF',
  },
  videoPlayText: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
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
    backgroundColor: '#FFFFFF',
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  card: {
    borderRadius: BorderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
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
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  floatingToggleDesc: {
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  floatingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  floatingStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  floatingStatusText: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  floatingActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  floatingActionButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  floatingActionButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
