/**
 * Lightweight reset stub — replaces the original 165-line ResetService.
 * Settings screen calls resetToDefaults() for factory reset functionality.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import { syncAllSettings } from './ConfigBridge';
import { logger } from './LogService';

const { VirtuCamSettings } = NativeModules;

export async function resetToDefaults(): Promise<{ success: boolean; error?: string }> {
  try {
    // Clear all AsyncStorage
    await AsyncStorage.clear();

    // Write disabled config to bridge
    if (VirtuCamSettings) {
      await syncAllSettings(true);
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Reset failed', 'ResetService', err);
    return { success: false, error: message };
  }
}
