import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';
import { logger } from './LogService';

const { VirtuCamSettings } = NativeModules;

export type CameraTarget = 'front' | 'back' | 'both' | 'none';
export type MediaSourceType = 'file' | 'stream';
export type SourceMode = 'black' | 'file' | 'stream' | 'test';


type StoredTargetApp = { enabled: boolean; packageName: string };

function parseStoredJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return (raw as unknown as T) ?? fallback;
  }
}

function parseStoredBoolean(raw: string | null, fallback: boolean): boolean {
  const parsed = parseStoredJson<unknown>(raw, fallback);
  if (typeof parsed === 'boolean') return parsed;
  if (typeof parsed === 'string') {
    const normalized = parsed.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function parseStoredNumber(raw: string | null, fallback: number): number {
  const parsed = parseStoredJson<unknown>(raw, fallback);
  if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed;
  if (typeof parsed === 'string') {
    const num = Number(parsed);
    if (Number.isFinite(num)) return num;
  }
  return fallback;
}

function parseStoredString(raw: string | null, fallback: string | null): string | null {
  const parsed = parseStoredJson<unknown>(raw, fallback);
  if (parsed === null || parsed === undefined) return fallback;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return fallback;
    return trimmed;
  }
  return fallback;
}

function safeParseTargetApps(targetAppsRaw: string | null): StoredTargetApp[] {
  if (!targetAppsRaw) return [];

  try {
    const parsedCandidate = parseStoredJson<unknown>(targetAppsRaw, []);
    const parsed =
      typeof parsedCandidate === 'string'
        ? parseStoredJson<unknown>(parsedCandidate, [])
        : parsedCandidate;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((app: unknown): app is StoredTargetApp => {
        if (!app || typeof app !== 'object') return false;
        const candidate = app as Partial<StoredTargetApp>;
        return typeof candidate.enabled === 'boolean' && typeof candidate.packageName === 'string';
      })
      .map(app => ({ enabled: app.enabled, packageName: app.packageName }));
  } catch (err: unknown) {
    logger.warn('Failed to parse target app list; using empty list', 'ConfigBridge', err);
    return [];
  }
}

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
  targetMode: 'all' | 'whitelist' | 'blacklist';
  sourceMode: SourceMode;
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
    const payload: Record<string, unknown> = {};

    // Keep partial updates truly partial to avoid wiping unrelated settings.
    if (Object.prototype.hasOwnProperty.call(config, 'enabled')) payload.enabled = config.enabled;
    if (Object.prototype.hasOwnProperty.call(config, 'mediaSourcePath')) payload.mediaSourcePath = config.mediaSourcePath;
    if (Object.prototype.hasOwnProperty.call(config, 'mediaSourceType')) payload.mediaSourceType = config.mediaSourceType;
    if (Object.prototype.hasOwnProperty.call(config, 'cameraTarget')) payload.cameraTarget = config.cameraTarget;
    if (Object.prototype.hasOwnProperty.call(config, 'mirrored')) payload.mirrored = config.mirrored;
    if (Object.prototype.hasOwnProperty.call(config, 'rotation')) payload.rotation = config.rotation;
    if (Object.prototype.hasOwnProperty.call(config, 'scaleX')) payload.scaleX = config.scaleX;
    if (Object.prototype.hasOwnProperty.call(config, 'scaleY')) payload.scaleY = config.scaleY;
    if (Object.prototype.hasOwnProperty.call(config, 'offsetX')) payload.offsetX = config.offsetX;
    if (Object.prototype.hasOwnProperty.call(config, 'offsetY')) payload.offsetY = config.offsetY;
    if (Object.prototype.hasOwnProperty.call(config, 'scaleMode')) payload.scaleMode = config.scaleMode;
    if (Object.prototype.hasOwnProperty.call(config, 'targetMode')) payload.targetMode = config.targetMode;
    if (Object.prototype.hasOwnProperty.call(config, 'sourceMode')) payload.sourceMode = config.sourceMode;
    if (Object.prototype.hasOwnProperty.call(config, 'targetPackages')) payload.targetPackages = config.targetPackages;

    if (Object.keys(payload).length === 0) return;

    await VirtuCamSettings.writeConfig(payload);
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
    targetMode: 'all',
    sourceMode: 'black',
    targetPackages: [],
  };

  if (!VirtuCamSettings) {
    logger.warn('VirtuCamSettings native module not available', 'ConfigBridge');
    return defaultConfig;
  }

  try {
    const config = await VirtuCamSettings.readConfig();

    const targetPackages: string[] = config.targetPackages
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
      mediaPathRaw,
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

    const enabledValue = parseStoredBoolean(enabled, false);
    const mediaPath = parseStoredString(mediaPathRaw, null);
    const front = parseStoredBoolean(frontCamera, true);
    const back = parseStoredBoolean(backCamera, false);
    const mirroredValue = parseStoredBoolean(mirrored, false);
    const rotationValue = parseStoredNumber(rotation, 0);
    const scaleXValue = parseStoredNumber(scaleX, 1.0);
    const scaleYValue = parseStoredNumber(scaleY, 1.0);
    const offsetXValue = parseStoredNumber(offsetX, 0.0);
    const offsetYValue = parseStoredNumber(offsetY, 0.0);

    let cameraTarget: CameraTarget = 'none';
    if (front && back) {
      cameraTarget = 'both';
    } else if (front) {
      cameraTarget = 'front';
    } else if (back) {
      cameraTarget = 'back';
    }

    const storedApps = safeParseTargetApps(targetAppsRaw);
    const enabledPackages = storedApps
      .filter(app => app.enabled)
      .map(app => app.packageName);

    const parsedTargetMode = parseStoredString(targetModeRaw, 'all');
    let effectiveTargetMode: 'all' | 'whitelist' | 'blacklist' =
      parsedTargetMode === 'all' || parsedTargetMode === 'whitelist' || parsedTargetMode === 'blacklist'
        ? parsedTargetMode
        : 'all';

    // Current UI no longer exposes target package management; when no targets are defined,
    // avoid impossible whitelist gating and let LSPosed scope drive targeting.
    if (effectiveTargetMode === 'whitelist' && enabledPackages.length === 0) {
      effectiveTargetMode = 'all';
    }

    const config: Partial<BridgeConfig> = {
      enabled: enabledValue,
      mediaSourcePath: mediaPath,
      cameraTarget,
      mirrored: mirroredValue,
      rotation: rotationValue,
      scaleX: scaleXValue,
      scaleY: scaleYValue,
      offsetX: offsetXValue,
      offsetY: offsetYValue,
      targetMode: effectiveTargetMode,
      sourceMode: mediaPath ? 'file' : 'black',
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
      } catch (err: unknown) {
        logger.warn('Failed to verify config readability', 'ConfigBridge', err);
        readable = false;
      }
    }

    const versionKey = 'virtucam_config_version';
    const stored = await AsyncStorage.getItem(versionKey);
    const version = stored ? parseInt(stored, 10) : 0;

    return {
      available: !!VirtuCamSettings,
      path,
      version,
      readable,
    };
  } catch (err: unknown) {
    logger.error('Failed to get bridge status', 'ConfigBridge', err);
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

    try {
      await writeBridgeConfig(testConfig);
      const readBack = await readBridgeConfig();

      if (readBack.cameraTarget !== 'front') {
        return {
          success: false,
          error: 'Config read/write mismatch',
        };
      }

      const readableStatus = await VirtuCamSettings.verifyConfigReadable();

      return {
        success: readableStatus.exists && readableStatus.readable,
        details: readableStatus as Record<string, unknown>,
      };
    } finally {
      await writeBridgeConfig(originalConfig);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}
