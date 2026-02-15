import { Platform, Linking, AppState } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'limited';

export type PermissionState = {
  camera: PermissionStatus;
  mediaLibrary: PermissionStatus;
  allFilesAccess: PermissionStatus;
  overlayPermission: PermissionStatus;
};

// --- State management for permissions that require leaving the app ---

let AppStateListener: ((state: string) => void) | null = null;
let permissionPromiseResolve: ((status: PermissionStatus) => void) | null = null;

// Listen for the app to become active again
function setupAppStateListener(key: string) {
  if (AppStateListener) {
    AppState.removeEventListener('change', AppStateListener);
  }
  AppStateListener = async (nextAppState) => {
    if (nextAppState === 'active') {
      // Once the app is active, we assume the user has made their choice.
      // We can't *truly* know if they granted it, so we'll check a flag we set.
      const userConfirmed = await AsyncStorage.getItem(key);
      if (permissionPromiseResolve) {
        permissionPromiseResolve(userConfirmed === 'true' ? 'granted' : 'denied');
      }
      if (AppStateListener) {
        AppState.removeEventListener('change', AppStateListener);
        AppStateListener = null;
      }
      permissionPromiseResolve = null;
    }
  };
  AppState.addEventListener('change', AppStateListener);
}

export async function checkAllPermissions(): Promise<PermissionState> {
  const [camera, mediaLibrary, allFiles, overlay] = await Promise.all([
    checkCameraPermission(),
    checkMediaLibraryPermission(),
    checkAllFilesAccess(),
    checkOverlayPermission(),
  ]);

  return {
    camera,
    mediaLibrary,
    allFilesAccess: allFiles,
    overlayPermission: overlay,
  };
}

async function checkCameraPermission(): Promise<PermissionStatus> {
  try {
    const { status } = await ImagePicker.getCameraPermissionsAsync();
    return mapExpoStatus(status);
  } catch {
    return 'undetermined';
  }
}

async function checkMediaLibraryPermission(): Promise<PermissionStatus> {
  try {
    const { status } = await MediaLibrary.getPermissionsAsync();
    return mapExpoStatus(status);
  } catch {
    return 'undetermined';
  }
}

async function checkAllFilesAccess(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'unavailable';
  // MANAGE_EXTERNAL_STORAGE can't be directly checked in Expo/React Native.
  // We can only open settings and ask the user to grant it.
  // The actual verification must be based on user confirmation or by attempting a file operation.
  // For this wizard, we will rely on a confirmation step from the user.
  const storedStatus = await AsyncStorage.getItem(STORAGE_KEYS.ALL_FILES_ACCESS_STATUS);
  return storedStatus === 'granted' ? 'granted' : 'undetermined';
}

async function checkOverlayPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'unavailable';
  // SYSTEM_ALERT_WINDOW permission status also can't be directly checked.
  // We follow the same pattern as All Files Access.
  const storedStatus = await AsyncStorage.getItem(STORAGE_KEYS.OVERLAY_PERMISSION_STATUS);
  return storedStatus === 'granted' ? 'granted' : 'undetermined';
}

function mapExpoStatus(status: string): PermissionStatus {
  switch (status) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'undetermined':
      return 'undetermined';
    default:
      return 'undetermined';
  }
}

export async function requestCameraPermission(): Promise<PermissionStatus> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return mapExpoStatus(status);
  } catch {
    return 'denied';
  }
}

export async function requestMediaLibraryPermission(): Promise<PermissionStatus> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return mapExpoStatus(status);
  } catch {
    return 'denied';
  }
}

export async function requestAllFilesAccess(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'unavailable';

  return new Promise(async (resolve) => {
    permissionPromiseResolve = resolve;
    setupAppStateListener(STORAGE_KEYS.ALL_FILES_ACCESS_STATUS);

    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.MANAGE_ALL_FILES_ACCESS_PERMISSION
      );
    } catch {
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.APPLICATION_SETTINGS
        );
      } catch {
        await Linking.openSettings();
      }
    }
  });
}


export async function requestOverlayPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'unavailable';

  return new Promise(async (resolve) => {
    permissionPromiseResolve = resolve;
    setupAppStateListener(STORAGE_KEYS.OVERLAY_PERMISSION_STATUS);

    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.MANAGE_OVERLAY_PERMISSION
      );
    } catch {
      try {
        await Linking.openSettings();
      } catch {
        // Silent
      }
    }
  });
}


export async function openAppSettings(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        {
          data: `package:${Platform.select({ android: 'host.exp.exponent', default: '' })}`,
        }
      );
    } else {
      await Linking.openSettings();
    }
  } catch {
    await Linking.openSettings();
  }
}

export function getPermissionDisplayInfo(status: PermissionStatus): {
  label: string;
  color: string;
  icon: string;
} {
  switch (status) {
    case 'granted':
      return { label: 'GRANTED', color: '#00D4FF', icon: 'checkmark-circle' };
    case 'denied':
      return { label: 'DENIED', color: '#FF3B30', icon: 'close-circle' };
    case 'limited':
      return { label: 'LIMITED', color: '#FFB800', icon: 'alert-circle' };
    case 'unavailable':
      return { label: 'UNAVAILABLE', color: '#5A5A6E', icon: 'remove-circle-outline' };
    case 'undetermined':
    default:
      return { label: 'REQUIRED', color: '#FFB800', icon: 'alert-circle' };
  }
}
