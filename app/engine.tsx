import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { writeBridgeConfig, readBridgeConfig, type BridgeConfig } from '@/services/ConfigBridge';
import Card from '@/components/Card';
import SectionHeader from '@/components/SectionHeader';

export default function SystemEngine() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [enabled, setEnabled] = useState(false);
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<'front' | 'back' | 'both'>('front');
  const [mirrored, setMirrored] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);

  // Load config on mount
  React.useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await readBridgeConfig();
      setEnabled(config.enabled);
      setMediaPath(config.mediaSourcePath);
      setCameraTarget(config.cameraTarget as 'front' | 'back' | 'both');
      setMirrored(config.mirrored);
      setRotation(config.rotation);
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const saveConfig = async (updates: Partial<BridgeConfig>) => {
    try {
      setLoading(true);
      await writeBridgeConfig({
        enabled,
        mediaSourcePath: mediaPath,
        cameraTarget,
        mirrored,
        rotation,
        scaleMode: 'fit',
        targetMode: 'whitelist',
        targetPackages: [],
        ...updates,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to save configuration');
      console.error('Save config error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (value: boolean) => {
    if (value && !mediaPath) {
      Alert.alert('No Media Selected', 'Please select a video or image first');
      return;
    }
    setEnabled(value);
    await saveConfig({ enabled: value });
  };

  const handleSelectMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setMediaPath(uri);
        await saveConfig({ mediaSourcePath: uri });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select media');
      console.error('Media selection error:', error);
    }
  };

  const handleCameraTargetChange = async (target: 'front' | 'back' | 'both') => {
    setCameraTarget(target);
    await saveConfig({ cameraTarget: target });
  };

  const handleMirrorToggle = async (value: boolean) => {
    setMirrored(value);
    await saveConfig({ mirrored: value });
  };

  const handleRotationChange = async (degrees: number) => {
    setRotation(degrees);
    await saveConfig({ rotation: degrees });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.lg },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={Colors.electricBlue} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>VIRTUCAM ENGINE</Text>
          <Text style={styles.headerSubtitle}>Virtual Camera Configuration</Text>
        </View>
      </View>

      {/* Enable/Disable */}
      <SectionHeader title="Engine Status" />
      <Card>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.label}>Enable Virtual Camera</Text>
            <Text style={styles.sublabel}>
              {enabled ? 'Hook is active' : 'Hook is disabled'}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggleEnabled}
            disabled={loading}
            trackColor={{ false: Colors.border, true: Colors.electricBlue + '40' }}
            thumbColor={enabled ? Colors.electricBlue : Colors.textTertiary}
          />
        </View>
      </Card>

      {/* Media Source */}
      <SectionHeader title="Media Source" />
      <Card>
        <Pressable onPress={handleSelectMedia} style={styles.mediaButton}>
          <View style={styles.mediaIconCircle}>
            <Ionicons
              name={mediaPath ? 'checkmark-circle' : 'add-circle-outline'}
              size={32}
              color={mediaPath ? Colors.success : Colors.electricBlue}
            />
          </View>
          <View style={styles.mediaContent}>
            <Text style={styles.label}>
              {mediaPath ? 'Media Selected' : 'Select Video or Image'}
            </Text>
            <Text style={styles.sublabel} numberOfLines={1}>
              {mediaPath ? mediaPath.split('/').pop() : 'Tap to choose from gallery'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
        </Pressable>
      </Card>

      {/* Camera Target */}
      <SectionHeader title="Camera Target" />
      <Card>
        <View style={styles.optionGroup}>
          {(['front', 'back', 'both'] as const).map((target) => (
            <Pressable
              key={target}
              onPress={() => handleCameraTargetChange(target)}
              style={[
                styles.optionButton,
                cameraTarget === target && styles.optionButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  cameraTarget === target && styles.optionTextActive,
                ]}
              >
                {target.charAt(0).toUpperCase() + target.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {/* Transformations */}
      <SectionHeader title="Transformations" />
      <Card>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.label}>Mirror Image</Text>
            <Text style={styles.sublabel}>Flip horizontally</Text>
          </View>
          <Switch
            value={mirrored}
            onValueChange={handleMirrorToggle}
            disabled={loading}
            trackColor={{ false: Colors.border, true: Colors.electricBlue + '40' }}
            thumbColor={mirrored ? Colors.electricBlue : Colors.textTertiary}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.rotationSection}>
          <Text style={styles.label}>Rotation</Text>
          <View style={styles.rotationButtons}>
            {[0, 90, 180, 270].map((degrees) => (
              <Pressable
                key={degrees}
                onPress={() => handleRotationChange(degrees)}
                style={[
                  styles.rotationButton,
                  rotation === degrees && styles.rotationButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.rotationText,
                    rotation === degrees && styles.rotationTextActive,
                  ]}
                >
                  {degrees}°
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Card>

      {/* Instructions */}
      <SectionHeader title="Setup Instructions" />
      <Card>
        <View style={styles.instructionStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <Text style={styles.instructionText}>
            Install LSPosed (Zygisk) on your rooted device
          </Text>
        </View>
        <View style={styles.instructionStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <Text style={styles.instructionText}>
            Enable VirtuCam module in LSPosed Manager
          </Text>
        </View>
        <View style={styles.instructionStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>3</Text>
          </View>
          <Text style={styles.instructionText}>
            Select target apps in LSPosed scope (e.g., Snapchat, Instagram)
          </Text>
        </View>
        <View style={styles.instructionStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>4</Text>
          </View>
          <Text style={styles.instructionText}>
            Reboot device to activate the module
          </Text>
        </View>
        <View style={styles.instructionStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>5</Text>
          </View>
          <Text style={styles.instructionText}>
            Select media source and enable the engine above
          </Text>
        </View>
      </Card>

      <View style={{ height: 40 }} />
    </ScrollView>
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
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    color: Colors.electricBlue,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: 2,
  },
  headerSubtitle: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rowContent: {
    flex: 1,
  },
  label: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  sublabel: {
    color: Colors.textTertiary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  mediaIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaContent: {
    flex: 1,
  },
  optionGroup: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  optionButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  optionButtonActive: {
    backgroundColor: Colors.electricBlue + '15',
    borderColor: Colors.electricBlue,
  },
  optionText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  optionTextActive: {
    color: Colors.electricBlue,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
  },
  rotationSection: {
    gap: Spacing.md,
  },
  rotationButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rotationButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  rotationButtonActive: {
    backgroundColor: Colors.electricBlue + '15',
    borderColor: Colors.electricBlue,
  },
  rotationText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  rotationTextActive: {
    color: Colors.electricBlue,
  },
  instructionStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.electricBlue + '15',
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: Colors.electricBlue,
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  instructionText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
