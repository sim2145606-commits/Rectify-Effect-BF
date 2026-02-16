import { NativeModules } from 'react-native';

const { VirtuCamSettings } = NativeModules;

export type CameraTarget = 'front' | 'back' | 'both' | 'none';

export type BridgeConfig = {
  enabled: boolean;
  mediaSourcePath: string | null;
  cameraTarget: CameraTarget;
  mirrored: boolean;
  rotation: number;
  scaleMode: string;
  targetMode: 'whitelist' | 'blacklist';
  targetPackages: string[];
};

/**
 * Write configuration to SharedPreferences (world-readable for Xposed)
 */
export async function writeBridgeConfig(config: Partial<BridgeConfig>): Promise<void> {
  try {
    if (!VirtuCamSettings) {
      console.warn('VirtuCamSettings native module not available');
      return;
    }

    await VirtuCamSettings.writeConfig({
      enabled: config.enabled ?? false,
      mediaSourcePath: config.mediaSourcePath ?? null,
      cameraTarget: config.cameraTarget ?? 'front',
      mirrored: config.mirrored ?? false,
      rotation: config.rotation ?? 0,
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
    cameraTarget: 'front',
    mirrored: false,
    rotation: 0,
    scaleMode: 'fit',
    targetMode: 'whitelist',
    targetPackages: [],
  };

  try {
    if (!VirtuCamSettings) {
      console.warn('VirtuCamSettings native module not available');
      return defaultConfig;
    }

    const config = await VirtuCamSettings.readConfig();
    
    // Parse targetPackages string to array
    const targetPackages = config.targetPackages 
      ? config.targetPackages.split(',').filter((p: string) => p.length > 0)
      : [];

    return {
      ...defaultConfig,
      ...config,
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
  try {
    if (!VirtuCamSettings) {
      return null;
    }
    return await VirtuCamSettings.getConfigPath();
  } catch (error) {
    console.error('ConfigBridge: Failed to get config path', error);
    return null;
  }
}

/**
 * Sync all settings from AsyncStorage to SharedPreferences
 * This is a simplified version - just write the current config
 */
export async function syncAllSettings(config: Partial<BridgeConfig>): Promise<void> {
  await writeBridgeConfig(config);
}

/**
 * Get bridge status (for debugging)
 */
export async function getBridgeStatus(): Promise<{
  available: boolean;
  path: string | null;
}> {
  try {
    const path = await getConfigPath();
    return {
      available: !!VirtuCamSettings,
      path,
    };
  } catch {
    return {
      available: false,
      path: null,
    };
  }
}
