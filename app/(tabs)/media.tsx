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
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import { resolveMediaPath, type ResolvedPath } from '@/services/PathResolver';
import { writeBridgeConfig } from '@/services/ConfigBridge';
import Card from '@/components/Card';

type MediaItem = {
  uri: string;
  type: 'image' | 'video';
  name: string;
  timestamp: number;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_HEIGHT = SCREEN_WIDTH * 0.6;

export default function MediaLibrary() {
  const insets = useSafeAreaInsets();
  const { lightImpact, success } = useHaptics();

  const [selectedMedia, setSelectedMedia] = useStorage<string | null>(
    STORAGE_KEYS.SELECTED_MEDIA,
    null
  );
  const [recentFiles, setRecentFiles] = useStorage<MediaItem[]>(
    STORAGE_KEYS.RECENT_FILES,
    []
  );

  const [selectedType, setSelectedType] = useState<'image' | 'video' | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvedPath, setResolvedPath] = useState<ResolvedPath | null>(null);

  useEffect(() => {
    if (selectedMedia && recentFiles.length > 0) {
      const found = recentFiles.find((f) => f.uri === selectedMedia);
      if (found) {
        setSelectedType(found.type);
      }
    }
    // Resolve path whenever media changes
    if (selectedMedia) {
      resolveMediaPath(selectedMedia)
        .then((resolved) => {
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
        const filtered = prev.filter((f) => f.uri !== item.uri);
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
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.lg },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.screenTitle}>Media Library</Text>
        <Text style={styles.screenSubtitle}>
          Select source media for virtual camera injection
        </Text>
      </Animated.View>

      {/* Live Preview */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="monitor-eye" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Live Preview</Text>
          {selectedMedia && (
            <Pressable onPress={clearSelection} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
            </Pressable>
          )}
        </View>
        <Card
          glow={!!selectedMedia}
          glowColor={Colors.accentGlow}
          style={styles.previewCard}
        >
          {selectedMedia ? (
            <View style={styles.previewContainer}>
              <Image
                source={{ uri: selectedMedia }}
                style={styles.previewImage}
                contentFit="contain"
                transition={300}
              />
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
                <View style={styles.liveBadge}>
                  <View style={styles.liveIndicator} />
                  <Text style={styles.liveText}>PREVIEW</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.emptyPreview}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="eye-off-outline" size={32} color={Colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>No Media Selected</Text>
              <Text style={styles.emptySubtitle}>
                Pick an image or video below to preview
              </Text>
            </View>
          )}
        </Card>
      </Animated.View>

      {/* Media Picker */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="folder-open" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Media Picker</Text>
        </View>
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
      </Animated.View>

      {/* Recent Files */}
      <Animated.View entering={FadeInDown.delay(400).duration(500)}>
        <View style={styles.sectionHeader}>
          <Ionicons name="time-outline" size={18} color={Colors.accent} />
          <Text style={styles.sectionTitle}>Recent Files</Text>
          {recentFiles.length > 0 && (
            <Text style={styles.fileCount}>{recentFiles.length}</Text>
          )}
        </View>
        {recentFiles.length > 0 ? (
          <FlatList
            data={recentFiles}
            renderItem={renderRecentItem}
            keyExtractor={(item) => item.uri + item.timestamp}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentList}
            scrollEnabled={true}
          />
        ) : (
          <Card style={styles.emptyRecentCard}>
            <Ionicons name="folder-open-outline" size={24} color={Colors.textTertiary} />
            <Text style={styles.emptyRecentText}>
              No recent files. Pick media to get started.
            </Text>
          </Card>
        )}
      </Animated.View>

      {/* Media Info */}
      {selectedMedia && (
        <Animated.View entering={FadeIn.delay(200).duration(400)}>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.accent} />
            <Text style={styles.sectionTitle}>Media Details</Text>
          </View>
          <Card>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Type</Text>
              <Text style={styles.detailValue}>
                {selectedType === 'video' ? 'Video File' : 'Static Image'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>MIME</Text>
              <Text style={styles.detailValue}>
                {resolvedPath?.mimeType || 'Resolving...'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Hook Status</Text>
              <Text style={[styles.detailValue, { color: resolvedPath?.isAccessible ? Colors.electricBlue : Colors.warningAmber }]}>
                {resolvedPath?.isAccessible ? 'Accessible' : 'Resolving Path...'}
              </Text>
            </View>
            {resolvedPath && resolvedPath.fileSize > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>File Size</Text>
                <Text style={styles.detailValue}>
                  {(resolvedPath.fileSize / 1024).toFixed(1)} KB
                </Text>
              </View>
            )}
            <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.detailLabel}>Absolute Path</Text>
              <Text style={[styles.detailValue, { fontSize: FontSize.xs, maxWidth: '60%' }]} numberOfLines={2}>
                {resolvedPath?.absolutePath || 'Resolving...'}
              </Text>
            </View>
          </Card>
        </Animated.View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
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
      style={[
        styles.recentCard,
        isSelected && styles.recentCardSelected,
      ]}
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
          <Text style={styles.recentType}>
            {item.type === 'video' ? 'VID' : 'IMG'}
          </Text>
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
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
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
    marginBottom: Spacing.xxl,
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
  clearButton: {
    padding: Spacing.xs,
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
  previewCard: {
    padding: 0,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 212, 255, 0.85)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textPrimary,
  },
  liveText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
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
  recentList: {
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
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
  emptyRecentCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxl,
  },
  emptyRecentText: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  detailValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
