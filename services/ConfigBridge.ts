import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';

const { VirtuCamSettings } = NativeModules;

export type CameraTarget = 'front' | 'back' | 'both' | 'none';
export type MediaSourceType = 'file' | 'stream';

export type BridgeConfig = {
  enabled: boolean;
  mediaSourcePath: string | null;
  mediaSourceType: MediaSourceType;
  cameraTarget: CameraTarget;
  mirrored: boolean;
  rotation: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  scaleMode: string;
  targetMode: 'whitelist' | 'blacklist';
  targetPackages: string[];
};

/**
 * Write configuration to SharedPreferences (world-readable for Xposed)
 */
export async function writeBridgeConfig(config: Partial<BridgeConfig>): Promise<void> {
  if (!VirtuCamSettings) {
    console.warn('VirtuCamSettings native module not available');
    throw new Error('Native module not available');
  }

  try {
    await VirtuCamSettings.writeConfig({
      enabled: config.enabled ?? false,
      mediaSourcePath: config.mediaSourcePath ?? null,
      mediaSourceType: config.mediaSourceType ?? 'file',
      cameraTarget: config.cameraTarget ?? 'front',
      mirrored: config.mirrored ?? false,
      rotation: config.rotation ?? 0,
      scaleX: config.scaleX ?? 1.0,
      scaleY: config.scaleY ?? 1.0,
      offsetX: config.offsetX ?? 0.0,
      offsetY: config.offsetY ?? 0.0,
      scaleMode: config.scaleMode ?? 'fit',
      targetMode: config.targetMode ?? 'whitelist',
      targetPackages: config.targetPackages ?? [],
    });
  } catch (error) {
    console.error('ConfigBridge: Failed to write config', error);
    throw error;
  }
}

/**
 * Read configuration from SharedPreferences
 */
export async function readBridgeConfig(): Promise<BridgeConfig> {
  const defaultConfig: BridgeConfig = {
    enabled: false,
    mediaSourcePath: null,
    mediaSourceType: 'file',
    cameraTarget: 'front',
    mirrored: false,
    rotation: 0,
    scaleX: 1.0,
    scaleY: 1.0,
    offsetX: 0.0,
    offsetY: 0.0,
    scaleMode: 'fit',
    targetMode: 'whitelist',
    targetPackages: [],
  };

  if (!VirtuCamSettings) {
    console.warn('VirtuCamSettings native module not available');
    return defaultConfig;
  }

  try {
    const config = await VirtuCamSettings.readConfig();

    // Parse targetPackages string to array
    const targetPackages = config.targetPackages
      ? config.targetPackages.split(',').filter((p: string) => p.length > 0)
      : [];

    return {
      ...defaultConfig,
      ...config,
      scaleX: config.scaleX ?? 1.0,
      scaleY: config.scaleY ?? 1.0,
      offsetX: config.offsetX ?? 0.0,
      offsetY: config.offsetY ?? 0.0,
      targetPackages,
    };
  } catch (error) {
    console.error('ConfigBridge: Failed to read config', error);
    return defaultConfig;
  }
}

/**
 * Get the path to the SharedPreferences file (for debugging)
 */
export async function getConfigPath(): Promise<string | null> {
  if (!VirtuCamSettings) {
    return null;
  }
  
  try {
    return await VirtuCamSettings.getConfigPath();
  } catch (error) {
    console.error('ConfigBridge: Failed to get config path', error);
    return null;
  }
}

/**
 * Sync all settings from AsyncStorage to SharedPreferences
 */
export async function syncAllSettings(): Promise<void> {
  try {
    // Read current settings from AsyncStorage
    const [
      enabled,
      mediaPath,
      frontCamera,
      backCamera,
      mirrored,
      rotation,
      scaleX,
      scaleY,
      offsetX,
      offsetY,
    ] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.HOOK_ENABLED),
      AsyncStorage.getItem(STORAGE_KEYS.SELECTED_MEDIA),
      AsyncStorage.getItem(STORAGE_KEYS.FRONT_CAMERA),
      AsyncStorage.getItem(STORAGE_KEYS.BACK_CAMERA),
      AsyncStorage.getItem(STORAGE_KEYS.MIRRORED),
      AsyncStorage.getItem(STORAGE_KEYS.ROTATION),
      AsyncStorage.getItem(STORAGE_KEYS.SCALE_X),
      AsyncStorage.getItem(STORAGE_KEYS.SCALE_Y),
      AsyncStorage.getItem(STORAGE_KEYS.OFFSET_X),
      AsyncStorage.getItem(STORAGE_KEYS.OFFSET_Y),
    ]);

    // Determine camera target
    const front = frontCamera === 'true';
    const back = backCamera === 'true';
    let cameraTarget: CameraTarget = 'none';
    if (front && back) {
      cameraTarget = 'both';
    } else if (front) {
      cameraTarget = 'front';
    } else if (back) {
      cameraTarget = 'back';
    }

    // Build config
    const config: Partial<BridgeConfig> = {
      enabled: enabled === 'true',
      mediaSourcePath: mediaPath,
      cameraTarget,
      mirrored: mirrored === 'true',
      rotation: rotation ? parseInt(rotation, 10) : 0,
      scaleX: scaleX ? parseFloat(scaleX) : 1.0,
      scaleY: scaleY ? parseFloat(scaleY) : 1.0,
      offsetX: offsetX ? parseFloat(offsetX) : 0.0,
      offsetY: offsetY ? parseFloat(offsetY) : 0.0,
    };

    await writeBridgeConfig(config);
  } catch (error) {
    console.error('ConfigBridge: Failed to sync settings', error);
    throw error;
  }
}

/**
 * Get bridge status (for debugging)
 */
export async function getBridgeStatus(): Promise<{
  available: boolean;
  path: string | null;
  version: number;
  readable: boolean;
}> {
  try {
    const path = await getConfigPath();

    // Verify config is readable
    let readable = false;
    if (VirtuCamSettings && VirtuCamSettings.verifyConfigReadable) {
      try {
        const verifyResult = await VirtuCamSettings.verifyConfigReadable();
        readable = verifyResult.readable && verifyResult.exists;
      } catch {
        readable = false;
      }
    }

    return {
      available: !!VirtuCamSettings,
      path,
      version: Date.now(), // Use timestamp as version
      readable,
    };
  } catch {
    return {
      available: false,
      path: null,
      version: 0,
      readable: false,
    };
  }
}

/**
 * Verify that the bridge is working correctly
 */
export async function verifyBridge(): Promise<{
  success: boolean;
  error?: string;
  details?: any;
}> {
  if (!VirtuCamSettings) {
    return {
      success: false,
      error: 'Native module not available',
    };
  }

  try {
    // Try to write and read back a test config
    const testConfig: Partial<BridgeConfig> = {
      enabled: false,
      cameraTarget: 'front',
    };

    await writeBridgeConfig(testConfig);
    const readBack = await readBridgeConfig();

    if (readBack.cameraTarget !== 'front') {
      return {
        success: false,
        error: 'Config read/write mismatch',
      };
    }

    // Verify file is readable
    const verifyResult = await VirtuCamSettings.verifyConfigReadable();

    return {
      success: verifyResult.exists && verifyResult.readable,
      details: verifyResult,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}
