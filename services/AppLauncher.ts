import { Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncAllSettings } from './ConfigBridge';
import { STORAGE_KEYS } from '@/constants/theme';

export type LaunchResult = {
  success: boolean;
  message: string;
  packageName: string;
  timestamp: number;
};

/**
 * Launch a target app with the camera hook primed for injection.
 * Syncs all current settings to the bridge config before launching.
 */
export async function launchTargetApp(packageName: string, appName: string): Promise<LaunchResult> {
  const result: LaunchResult = {
    success: false,
    message: '',
    packageName,
    timestamp: Date.now(),
  };

  try {
    // Step 1: Sync all settings to bridge config
    await syncAllSettings();

    // Step 2: Log the launch session
    await logHookSession(packageName, appName);

    if (Platform.OS === 'android') {
      // Try to launch via openApplication
      try {
        IntentLauncher.openApplication(packageName);
        result.success = true;
        result.message = `Launched ${appName} with hook primed`;
        return result;
      } catch {
        // Fallback: try deep link schemes
      }

      // Fallback: Try common deep link schemes
      const schemeMap: Record<string, string> = {
        'com.whatsapp': 'whatsapp://',
        'com.instagram.android': 'instagram://',
        'com.snapchat.android': 'snapchat://',
        'com.facebook.katana': 'fb://',
        'org.telegram.messenger': 'tg://',
        'com.discord': 'discord://',
        'us.zoom.videomeetings': 'zoomus://',
        'com.skype.raider': 'skype://',
        'com.microsoft.teams': 'msteams://',
        'org.thoughtcrime.securesms': 'sgnl://',
        'com.zhiliaoapp.musically': 'snssdk1128://',
        'com.google.android.apps.meetings': 'meet://',
      };

      const scheme = schemeMap[packageName];
      if (scheme) {
        const canOpen = await Linking.canOpenURL(scheme);
        if (canOpen) {
          await Linking.openURL(scheme);
          result.success = true;
          result.message = `Launched ${appName} via deep link`;
          return result;
        }
      }

      // Last fallback: open in Play Store
      try {
        await Linking.openURL(`market://details?id=${packageName}`);
        result.success = false;
        result.message = `${appName} not installed — opened store page`;
        return result;
      } catch {
        result.message = `Unable to launch ${appName}`;
        return result;
      }
    } else {
      // iOS fallback
      result.message = 'Direct app launch requires Android';
      return result;
    }
  } catch (error) {
    result.message = `Launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return result;
  }
}

async function logHookSession(packageName: string, appName: string): Promise<void> {
  try {
    const logKey = STORAGE_KEYS.HOOK_SESSION_LOG;
    const existing = await AsyncStorage.getItem(logKey);
    const sessions = existing ? JSON.parse(existing) : [];

    sessions.unshift({
      packageName,
      appName,
      timestamp: Date.now(),
      hookEnabled: true,
    });

    // Keep last 50 sessions
    const trimmed = sessions.slice(0, 50);
    await AsyncStorage.setItem(logKey, JSON.stringify(trimmed));
  } catch {
    // Silent
  }
}

export async function getRecentSessions(): Promise<
  { packageName: string; appName: string; timestamp: number }[]
> {
  try {
    const logKey = STORAGE_KEYS.HOOK_SESSION_LOG;
    const existing = await AsyncStorage.getItem(logKey);
    return existing ? JSON.parse(existing) : [];
  } catch {
    return [];
  }
}
