import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';
import { writeBridgeConfig } from './ConfigBridge';
import { logger } from './LogService';

export const DEFAULT_VALUES: Record<string, string | null> = {
  [STORAGE_KEYS.HOOK_ENABLED]: 'false',
  [STORAGE_KEYS.FRONT_CAMERA]: 'true',
  [STORAGE_KEYS.BACK_CAMERA]: 'false',
  [STORAGE_KEYS.SELECTED_MEDIA]: null,
  [STORAGE_KEYS.HOOK_MEDIA_PATH]: null,
  [STORAGE_KEYS.SCALE_MODE]: 'fit',
  [STORAGE_KEYS.SCALE_X]: '1.0',
  [STORAGE_KEYS.SCALE_Y]: '1.0',
  [STORAGE_KEYS.ROTATION]: '0',
  [STORAGE_KEYS.MIRRORED]: 'false',
  [STORAGE_KEYS.FLIPPED_VERTICAL]: 'false',
  [STORAGE_KEYS.OFFSET_X]: '0.0',
  [STORAGE_KEYS.OFFSET_Y]: '0.0',
  [STORAGE_KEYS.LOOP_START]: '0',
  [STORAGE_KEYS.LOOP_END]: '0',
  [STORAGE_KEYS.LOOP_ENABLED]: 'false',
  [STORAGE_KEYS.AI_OPTIMIZE]: 'false',
  [STORAGE_KEYS.AI_SUBJECT_LOCK]: 'false',
  [STORAGE_KEYS.AI_ENHANCEMENT]: null,
  [STORAGE_KEYS.ENGINE_ACTIVE]: 'false',
  [STORAGE_KEYS.FLOATING_BUBBLE]: 'false',
  [STORAGE_KEYS.TARGET_MODE]: 'all',
  [STORAGE_KEYS.VCAM_COMPATIBILITY_MODE]: 'true',
  [STORAGE_KEYS.INJECTION_METHOD]: 'camera2',
  [STORAGE_KEYS.CAMERA2_HOOK]: 'true',
  [STORAGE_KEYS.CAMERA1_HOOK]: 'true',
  [STORAGE_KEYS.VIRTUAL_LOOPBACK]: 'false',
  [STORAGE_KEYS.COMPATIBILITY_MODE]: 'auto',
  [STORAGE_KEYS.BATTERY_OPTIMIZED]: 'false',
  [STORAGE_KEYS.ADAPTIVE_LAYOUT_RATIO]: '1.0',
};

const DEFAULT_TARGET_APPS = [
  { id: 'camera', name: 'Camera', packageName: 'com.android.camera', enabled: true, source: 'preset' },
  { id: 'whatsapp', name: 'WhatsApp', packageName: 'com.whatsapp', enabled: false, source: 'preset' },
  { id: 'telegram', name: 'Telegram', packageName: 'org.telegram.messenger', enabled: false, source: 'preset' },
  { id: 'messenger', name: 'Messenger', packageName: 'com.facebook.orca', enabled: false, source: 'preset' },
  { id: 'meet', name: 'Google Meet', packageName: 'com.google.android.apps.meetings', enabled: false, source: 'preset' },
  { id: 'zoom', name: 'Zoom', packageName: 'us.zoom.videomeetings', enabled: false, source: 'preset' },
];

export async function resetToDefaults(): Promise<{
  success: boolean;
  error?: string;
  verification?: {
    asyncStorageReset: boolean;
    bridgeConfigReset: boolean;
    valuesVerified: boolean;
  };
}> {
  try {
    const resetPromises = Object.entries(DEFAULT_VALUES).map(([key, value]) => {
      if (value === null) {
        return AsyncStorage.removeItem(key);
      }
      return AsyncStorage.setItem(key, value);
    });

    resetPromises.push(
      AsyncStorage.setItem(STORAGE_KEYS.TARGET_APPS, JSON.stringify(DEFAULT_TARGET_APPS))
    );

    await Promise.all(resetPromises).catch((err: unknown) => {
      const errorMsg =
        err instanceof Error
          ? String(err.message).replace(/[\r\n]/g, '')
          : 'Unknown error';
      logger.error(`Failed to reset AsyncStorage values: ${errorMsg}`, 'ResetService');
      throw new Error(`AsyncStorage reset failed: ${errorMsg}`);
    });

    await writeBridgeConfig({
      enabled: false,
      mediaSourcePath: null,
      cameraTarget: 'front',
      mirrored: false,
      rotation: 0,
      scaleX: 1.0,
      scaleY: 1.0,
      offsetX: 0.0,
      offsetY: 0.0,
      scaleMode: 'fit',
      targetMode: 'all',
      vcamCompatibilityMode: true,
      targetPackages: [],
    });

    const verificationPromises = Object.entries(DEFAULT_VALUES).map(
      async ([key, expectedValue]) => {
        const actualValue = await AsyncStorage.getItem(key);
        if (expectedValue === null) {
          return actualValue === null;
        }
        return actualValue === expectedValue;
      }
    );

    const verificationResults = await Promise.all(verificationPromises);
    const allVerified = verificationResults.every(result => result === true);

    return {
      success: true,
      verification: {
        asyncStorageReset: true,
        bridgeConfigReset: true,
        valuesVerified: allVerified,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during reset';
    logger.error('Reset to defaults failed', 'ResetService', err);
    return { success: false, error: message };
  }
}

export async function getCurrentSettings(): Promise<Record<string, string | null>> {
  const settings: Record<string, string | null> = {};
  const keys = [...Object.keys(DEFAULT_VALUES), STORAGE_KEYS.TARGET_APPS];
  const pairs = await AsyncStorage.multiGet(keys);

  for (const [key, value] of pairs) {
    settings[key] = value;
  }

  return settings;
}

export async function clearAllData(): Promise<void> {
  await AsyncStorage.clear();
}

export async function exportSettings(): Promise<string> {
  const settings = await getCurrentSettings();
  return JSON.stringify(settings, null, 2);
}

export async function importSettings(jsonString: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const settings = JSON.parse(jsonString) as Record<string, unknown>;

    const importPromises = Object.entries(settings).map(([key, value]) => {
      if (value === null) {
        return AsyncStorage.removeItem(key);
      }
      return AsyncStorage.setItem(key, String(value));
    });

    await Promise.all(importPromises);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to import settings';
    return { success: false, error: message };
  }
}
