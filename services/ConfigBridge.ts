import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';
import { logger } from './LogService';

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
    logger.warn('VirtuCamSettings native module not available', 'ConfigBridge');
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
  } catch (err: unknown) {
    logger.error('Failed to write config', 'ConfigBridge', err);
    throw err;
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
    logger.warn('VirtuCamSettings native module not available', 'ConfigBridge');
    return defaultConfig;
  }

  try {
    const config = await VirtuCamSettings.readConfig();

    let targetPackages: string[] = config.targetPackages
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
  } catch (err: unknown) {
    logger.error('Failed to read config', 'ConfigBridge', err);
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
  } catch (err: unknown) {
    logger.error('Failed to get config path', 'ConfigBridge', err);
    return null;
  }
}

/**
 * Sync all settings from AsyncStorage to SharedPreferences
 */
export async function syncAllSettings(): Promise<void> {
  try {
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
      targetModeRaw,
      targetAppsRaw,
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
      AsyncStorage.getItem(STORAGE_KEYS.TARGET_MODE),
      AsyncStorage.getItem(STORAGE_KEYS.TARGET_APPS),
    ]);

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

    const storedApps: Array<{packageName: string; enabled: boolean}> =
      targetAppsRaw ? JSON.parse(targetAppsRaw) : [];
    const enabledPackages = storedApps
      .filter(app => app.enabled)
      .map(app => app.packageName);

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
      targetMode: (targetModeRaw as 'whitelist' | 'blacklist') ?? 'whitelist',
      targetPackages: enabledPackages,
    };

    await writeBridgeConfig(config);
  } catch (err: unknown) {
    logger.error('Failed to sync settings', 'ConfigBridge', err);
    throw err;
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

    let readable = false;
    if (VirtuCamSettings && VirtuCamSettings.verifyConfigReadable) {
      try {
        const readableStatus = await VirtuCamSettings.verifyConfigReadable();
        readable = readableStatus.readable && readableStatus.exists;
      } catch {
        readable = false;
      }
    }

    const versionKey = 'virtucam_config_version';
    const stored = await AsyncStorage.getItem(versionKey);
    const version = stored ? parseInt(stored, 10) + 1 : 1;
    await AsyncStorage.setItem(versionKey, version.toString());

    return {
      available: !!VirtuCamSettings,
      path,
      version,
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
  details?: Record<string, unknown>;
}> {
  if (!VirtuCamSettings) {
    return {
      success: false,
      error: 'Native module not available',
    };
  }

  try {
    const originalConfig = await readBridgeConfig();

    const testConfig: Partial<BridgeConfig> = {
      enabled: false,
      cameraTarget: 'front',
    };

    await writeBridgeConfig(testConfig);
    const readBack = await readBridgeConfig();

    if (readBack.cameraTarget !== 'front') {
      await writeBridgeConfig(originalConfig);
      return {
        success: false,
        error: 'Config read/write mismatch',
      };
    }

    const readableStatus = await VirtuCamSettings.verifyConfigReadable();

    await writeBridgeConfig(originalConfig);

    return {
      success: readableStatus.exists && readableStatus.readable,
      details: readableStatus as Record<string, unknown>,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}
