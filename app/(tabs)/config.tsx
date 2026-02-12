import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, FontSize, Spacing, BorderRadius, STORAGE_KEYS } from '@/constants/theme';
import { useStorage } from '@/hooks/useStorage';
import { useHaptics } from '@/hooks/useHaptics';
import { writeBridgeConfig } from '@/services/ConfigBridge';
import HUDViewfinder from '@/components/media-studio/HUDViewfinder';
import RotationDial from '@/components/media-studio/RotationDial';
import SpanScalePanel from '@/components/media-studio/SpanScalePanel';
import PositionControl from '@/components/media-studio/PositionControl';
import AIEnhancementSuite from '@/components/media-studio/AIEnhancementSuite';
import PlaybackControls from '@/components/media-studio/PlaybackControls';
import EngineOverlay from '@/components/media-studio/EngineOverlay';

type ScaleMode = 'fit' | 'fill' | 'stretch';

export default function MediaStudio() {
  const insets = useSafeAreaInsets();
  const { heavyImpact, mediumImpact } = useHaptics();

  // Core state
  const [selectedMedia] = useStorage<string | null>(STORAGE_KEYS.SELECTED_MEDIA, null);
  const [rotation, setRotation] = useStorage(STORAGE_KEYS.ROTATION, 0);
  const [mirrored, setMirrored] = useStorage(STORAGE_KEYS.MIRRORED, false);
  const [flippedVertical, setFlippedVertical] = useStorage(STORAGE_KEYS.FLIPPED_VERTICAL, false);
  const [scaleMode, setScaleMode] = useStorage<ScaleMode>(STORAGE_KEYS.SCALE_MODE, 'fit');
  const [offsetX, setOffsetX] = useStorage(STORAGE_KEYS.OFFSET_X, 0);
  const [offsetY, setOffsetY] = useStorage(STORAGE_KEYS.OFFSET_Y, 0);

  // AI state
  const [aiOptimize, setAiOptimize] = useStorage(STORAGE_KEYS.AI_OPTIMIZE, false);
  const [aiSubjectLock, setAiSubjectLock] = useStorage(STORAGE_KEYS.AI_SUBJECT_LOCK, false);
  const [enhancedUri, setEnhancedUri] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Playback state
  const [loopEnabled, setLoopEnabled] = useStorage(STORAGE_KEYS.LOOP_ENABLED, true);
  const [loopStart, setLoopStart] = useStorage(STORAGE_KEYS.LOOP_START, 0);
  const [loopEnd, setLoopEnd] = useStorage(STORAGE_KEYS.LOOP_END, 30);

  // Engine state
  const [engineActive, setEngineActive] = useStorage(STORAGE_KEYS.ENGINE_ACTIVE, false);

  // Display URI
  const displayUri = enhancedUri || selectedMedia;

  // Handlers
  const handleRotationChange = useCallback((angle: number) => {
    setRotation(angle);
    writeBridgeConfig({ rotation: angle }).catch(() => {});
  }, [setRotation]);

  const handleScaleModeChange = useCallback((mode: ScaleMode) => {
    setScaleMode(mode);
    writeBridgeConfig({ scaleMode: mode }).catch(() => {});
  }, [setScaleMode]);

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

  const handleOffsetChange = useCallback((x: number, y: number) => {
    setOffsetX(x);
    setOffsetY(y);
  }, [setOffsetX, setOffsetY]);

  const handleEngineToggle = useCallback((active: boolean) => {
    setEngineActive(active);
    writeBridgeConfig({ enabled: active }).catch(() => {});
  }, [setEngineActive]);

  const handleQuickPreset = useCallback((preset: string) => {
    mediumImpact();
    switch (preset) {
      case 'default':
        setRotation(0);
        setMirrored(false);
        setFlippedVertical(false);
        setScaleMode('fit');
        setOffsetX(0);
        setOffsetY(0);
        break;
      case 'mirror':
        setMirrored(true);
        setFlippedVertical(false);
        break;
      case 'portrait':
        setRotation(90);
        setScaleMode('fill');
        break;
      case 'cinematic':
        setScaleMode('fill');
        setRotation(0);
        break;
    }
  }, [mediumImpact, setRotation, setMirrored, setFlippedVertical, setScaleMode, setOffsetX, setOffsetY]);

  const handleResetAll = useCallback(() => {
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
    }).catch(() => {});
  }, [heavyImpact, setRotation, setMirrored, setFlippedVertical, setScaleMode, setOffsetX, setOffsetY]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.md },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(50).duration(500)} style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <View>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="monitor-cellphone" size={22} color={Colors.electricBlue} />
              <Text style={styles.screenTitle}>Media Studio</Text>
            </View>
            <Text style={styles.screenSubtitle}>
              OBS-style virtual camera control
            </Text>
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
              label="Engine"
              value={engineActive ? 'ON' : 'OFF'}
              color={engineActive ? Colors.success : Colors.inactive}
            />
            <View style={styles.statusDivider} />
            <StatusChip
              label="AI"
              value={aiOptimize || aiSubjectLock ? 'ON' : 'OFF'}
              color={aiOptimize || aiSubjectLock ? Colors.electricBlue : Colors.inactive}
            />
            <View style={styles.statusDivider} />
            <StatusChip
              label="Loop"
              value={loopEnabled ? 'ON' : 'OFF'}
              color={loopEnabled ? Colors.cyan : Colors.inactive}
            />
            <View style={styles.statusDivider} />
            <StatusChip
              label="Media"
              value={selectedMedia ? 'LOADED' : 'NONE'}
              color={selectedMedia ? Colors.success : Colors.warning}
            />
          </LinearGradient>
        </View>
      </Animated.View>

      {/* Live Viewfinder */}
      <HUDViewfinder
        mediaUri={displayUri}
        rotation={rotation}
        mirrored={mirrored}
        flippedVertical={flippedVertical}
        scaleMode={scaleMode}
        offsetX={offsetX}
        offsetY={offsetY}
        aiOptimize={aiOptimize}
        aiSubjectLock={aiSubjectLock}
        aiLoading={aiLoading}
        engineActive={engineActive}
      />

      {/* The Transformer - Rotation Dial */}
      <RotationDial
        rotation={rotation}
        onRotationChange={handleRotationChange}
      />

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
      <PositionControl
        offsetX={offsetX}
        offsetY={offsetY}
        onOffsetChange={handleOffsetChange}
      />

      {/* AI Enhancement Suite */}
      <AIEnhancementSuite
        selectedMedia={selectedMedia}
        aiOptimize={aiOptimize}
        aiSubjectLock={aiSubjectLock}
        onAiOptimizeChange={(val) => {
          setAiOptimize(val);
          setAiLoading(false);
        }}
        onAiSubjectLockChange={(val) => {
          setAiSubjectLock(val);
          setAiLoading(false);
        }}
        onEnhancedUriChange={setEnhancedUri}
      />

      {/* Playback Engine */}
      <PlaybackControls
        loopEnabled={loopEnabled}
        loopStart={loopStart}
        loopEnd={loopEnd}
        mediaDuration={30}
        onLoopEnabledChange={setLoopEnabled}
        onLoopStartChange={setLoopStart}
        onLoopEndChange={setLoopEnd}
      />

      {/* Android Integration */}
      <EngineOverlay
        engineActive={engineActive}
        onEngineToggle={handleEngineToggle}
        rotation={rotation}
        scaleMode={scaleMode}
        selectedMedia={selectedMedia}
        onQuickPreset={handleQuickPreset}
      />

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
});
