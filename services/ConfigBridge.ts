import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';

export type CameraTarget = 'front' | 'back' | 'both' | 'none';

export type BridgeConfig = {
  version: number;
  enabled: boolean;
  cameraTarget: CameraTarget;
  mirrored: boolean;
  rotation: number;
  scaleMode: string;
  mediaSourcePath: string | null;
  enhancedMediaPath: string | null;
  targetMode: 'whitelist' | 'blacklist';
  targetPackages: string[];
  aiFilterApplied: string | null;
  lastUpdated: number;
};

const BRIDGE_FILE = 'virtucam_bridge.json';
const BRIDGE_DIR = 'virtucam';
const TARGETS_FILE = 'virtucam_targets.json';

function getBridgePath(): string {
  return `${FileSystem.documentDirectory}${BRIDGE_DIR}/${BRIDGE_FILE}`;
}

function getTargetsPath(): string {
  return `${FileSystem.documentDirectory}${BRIDGE_DIR}/${TARGETS_FILE}`;
}

async function ensureBridgeDir(): Promise<void> {
  const dirPath = `${FileSystem.documentDirectory}${BRIDGE_DIR}`;
  const dirInfo = await FileSystem.getInfoAsync(dirPath);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  }
}

export async function writeBridgeConfig(config: Partial<BridgeConfig>): Promise<void> {
  try {
    await ensureBridgeDir();

    // Read existing config
    const existing = await readBridgeConfig();
    const updated: BridgeConfig = {
      ...existing,
      ...config,
      version: (existing?.version || 0) + 1,
      lastUpdated: Date.now(),
    };

    const path = getBridgePath();
    await FileSystem.writeAsStringAsync(path, JSON.stringify(updated, null, 2));

    // Also persist to AsyncStorage as backup
    await AsyncStorage.setItem(STORAGE_KEYS.CONFIG_BRIDGE, JSON.stringify(updated));
  } catch (error) {
    console.warn('ConfigBridge: Failed to write config', error);
    throw error;
  }
}

export async function readBridgeConfig(): Promise<BridgeConfig> {
  const defaultConfig: BridgeConfig = {
    version: 0,
    enabled: false,
    cameraTarget: 'front',
    mirrored: false,
    rotation: 0,
    scaleMode: 'fit',
    mediaSourcePath: null,
    enhancedMediaPath: null,
    targetMode: 'whitelist',
    targetPackages: [],
    aiFilterApplied: null,
    lastUpdated: 0,
  };

  try {
    const path = getBridgePath();
    const info = await FileSystem.getInfoAsync(path);

    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(path);
      return { ...defaultConfig, ...JSON.parse(content) };
    }

    // Try AsyncStorage fallback
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.CONFIG_BRIDGE);
    if (stored) {
      return { ...defaultConfig, ...JSON.parse(stored) };
    }
  } catch {
    // Return default
  }

  return defaultConfig;
}

export async function writeTargetList(
  mode: 'whitelist' | 'blacklist',
  packages: { packageName: string; enabled: boolean }[]
): Promise<void> {
  try {
    await ensureBridgeDir();

    const targetData = {
      mode,
      packages: packages.filter((p) => p.enabled).map((p) => p.packageName),
      allPackages: packages,
      lastUpdated: Date.now(),
    };

    const path = getTargetsPath();
    await FileSystem.writeAsStringAsync(path, JSON.stringify(targetData, null, 2));

    // Also update bridge config
    await writeBridgeConfig({
      targetMode: mode,
      targetPackages: targetData.packages,
    });
  } catch (error) {
    console.warn('ConfigBridge: Failed to write targets', error);
  }
}

export async function readTargetList(): Promise<{
  mode: string;
  packages: string[];
} | null> {
  try {
    const path = getTargetsPath();
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(path);
      return JSON.parse(content);
    }
  } catch {
    // Silent
  }
  return null;
}

export async function syncAllSettings(): Promise<void> {
  try {
    // Read all current settings from AsyncStorage
    const [
      hookEnabled,
      frontCamera,
      backCamera,
      mirrored,
      rotation,
      scaleMode,
      selectedMedia,
      aiEnhancement,
      targetMode,
      targetApps,
    ] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.HOOK_ENABLED),
      AsyncStorage.getItem(STORAGE_KEYS.FRONT_CAMERA),
      AsyncStorage.getItem(STORAGE_KEYS.BACK_CAMERA),
      AsyncStorage.getItem(STORAGE_KEYS.MIRRORED),
      AsyncStorage.getItem(STORAGE_KEYS.ROTATION),
      AsyncStorage.getItem(STORAGE_KEYS.SCALE_MODE),
      AsyncStorage.getItem(STORAGE_KEYS.SELECTED_MEDIA),
      AsyncStorage.getItem(STORAGE_KEYS.AI_ENHANCEMENT),
      AsyncStorage.getItem(STORAGE_KEYS.TARGET_MODE),
      AsyncStorage.getItem(STORAGE_KEYS.TARGET_APPS),
    ]);

    const front = frontCamera ? JSON.parse(frontCamera) : true;
    const back = backCamera ? JSON.parse(backCamera) : false;

    let cameraTarget: CameraTarget = 'none';
    if (front && back) cameraTarget = 'both';
    else if (front) cameraTarget = 'front';
    else if (back) cameraTarget = 'back';

    let parsedTargetApps: { packageName: string; enabled: boolean }[] = [];
    try {
      if (targetApps) {
        parsedTargetApps = JSON.parse(targetApps);
      }
    } catch {
      // Invalid JSON
    }

    await writeBridgeConfig({
      enabled: hookEnabled === 'true',
      cameraTarget,
      mirrored: mirrored ? JSON.parse(mirrored) : false,
      rotation: rotation ? JSON.parse(rotation) : 0,
      scaleMode: scaleMode ? JSON.parse(scaleMode) : 'fit',
      mediaSourcePath: selectedMedia ? JSON.parse(selectedMedia) : null,
      aiFilterApplied: aiEnhancement ? JSON.parse(aiEnhancement) : null,
      targetMode: targetMode ? JSON.parse(targetMode) : 'whitelist',
      targetPackages: parsedTargetApps
        .filter((a: { enabled: boolean }) => a.enabled)
        .map((a: { packageName: string }) => a.packageName),
    });
  } catch (error) {
    console.warn('ConfigBridge: Sync failed', error);
  }
}

export async function getBridgeStatus(): Promise<{
  exists: boolean;
  version: number;
  lastUpdated: number;
  fileSize: number;
}> {
  try {
    const path = getBridgePath();
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const config = await readBridgeConfig();
      return {
        exists: true,
        version: config.version,
        lastUpdated: config.lastUpdated,
        fileSize: info.exists ? info.size : 0,
      };
    }
  } catch {
    // Silent
  }
  return { exists: false, version: 0, lastUpdated: 0, fileSize: 0 };
}
