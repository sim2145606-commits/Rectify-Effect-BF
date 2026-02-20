import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';
import { writeBridgeConfig } from './ConfigBridge';
import { logger } from './LogService';

export const DEFAULT_VALUES: Record<string, string | null> = {
  [STORAGE_KEYS.HOOK_ENABLED]: 'false',
  [STORAGE_KEYS.FRONT_CAMERA]: 'true',
  [STORAGE_KEYS.BACK_CAMERA]: 'false',
  [STORAGE_KEYS.SELECTED_MEDIA]: null,
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
  [STORAGE_KEYS.TARGET_MODE]: 'whitelist',
  [STORAGE_KEYS.INJECTION_METHOD]: 'camera2',
  [STORAGE_KEYS.CAMERA2_HOOK]: 'true',
  [STORAGE_KEYS.CAMERA1_HOOK]: 'true',
  [STORAGE_KEYS.VIRTUAL_LOOPBACK]: 'false',
  [STORAGE_KEYS.COMPATIBILITY_MODE]: 'auto',
  [STORAGE_KEYS.BATTERY_OPTIMIZED]: 'false',
  [STORAGE_KEYS.ADAPTIVE_LAYOUT_RATIO]: '1.0',
};

const DEFAULT_TARGET_APPS = [
  { id: '1', name: 'WhatsApp', packageName: 'com.whatsapp', enabled: true, icon: 'whatsapp' },
  { id: '2', name: 'Telegram', packageName: 'org.telegram.messenger', enabled: true, icon: 'send' },
  { id: '3', name: 'Instagram', packageName: 'com.instagram.android', enabled: false, icon: 'instagram' },
  { id: '4', name: 'Snapchat', packageName: 'com.snapchat.android', enabled: false, icon: 'snapchat' },
  { id: '5', name: 'Google Meet', packageName: 'com.google.android.apps.meetings', enabled: true, icon: 'google' },
  { id: '6', name: 'Zoom', packageName: 'us.zoom.videomeetings', enabled: true, icon: 'video' },
  { id: '7', name: 'Skype', packageName: 'com.skype.raider', enabled: false, icon: 'skype' },
  { id: '8', name: 'Discord', packageName: 'com.discord', enabled: false, icon: 'message-text' },
  { id: '9', name: 'Signal', packageName: 'org.thoughtcrime.securesms', enabled: false, icon: 'chat' },
  { id: '10', name: 'Facebook', packageName: 'com.facebook.katana', enabled: false, icon: 'facebook' },
  { id: '11', name: 'TikTok', packageName: 'com.zhiliaoapp.musically', enabled: false, icon: 'music-note' },
  { id: '12', name: 'Teams', packageName: 'com.microsoft.teams', enabled: true, icon: 'microsoft-teams' },
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
      targetMode: 'whitelist',
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

  for (const key of Object.keys(DEFAULT_VALUES)) {
    settings[key] = await AsyncStorage.getItem(key);
  }

  settings[STORAGE_KEYS.TARGET_APPS] = await AsyncStorage.getItem(STORAGE_KEYS.TARGET_APPS);

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
      return await AsyncStorage.setItem(key, String(value));
    });

    await Promise.all(importPromises);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to import settings';
    return { success: false, error: message };
  }
}
