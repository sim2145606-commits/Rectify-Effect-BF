import { Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'limited';

export type PermissionState = {
  camera: PermissionStatus;
  mediaLibrary: PermissionStatus;
  allFilesAccess: PermissionStatus;
  overlayPermission: PermissionStatus;
};

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
  // MANAGE_EXTERNAL_STORAGE can't be directly checked in Expo
  // We track it via our state
  return 'undetermined';
}

async function checkOverlayPermission(): Promise<PermissionStatus> {
  return 'undetermined';
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

export async function requestAllFilesAccess(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      // Open MANAGE_ALL_FILES_ACCESS_PERMISSION settings
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.MANAGE_ALL_FILES_ACCESS_PERMISSION
      );
    } catch {
      // Fallback: open general app settings
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.APPLICATION_SETTINGS
        );
      } catch {
        await Linking.openSettings();
      }
    }
  } else {
    await Linking.openSettings();
  }
}

export async function requestOverlayPermission(): Promise<void> {
  if (Platform.OS === 'android') {
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
  } else {
    await Linking.openSettings();
  }
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
    case 'undetermined':
    default:
      return { label: 'REQUIRED', color: '#FFB800', icon: 'alert-circle' };
  }
}
