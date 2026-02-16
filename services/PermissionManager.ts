import { Platform, Linking, AppState, NativeModules, PermissionsAndroid } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

const { VirtuCamSettings } = NativeModules;

export type PermissionStatus = 'granted' | 'denied' | 'pending' | 'checking';

export type PermissionCheckResult = {
  status: PermissionStatus;
  detail: string;
  canRequest: boolean;
};

export type AllPermissionsState = {
  rootAccess: PermissionCheckResult;
  lsposedModule: PermissionCheckResult;
  allFilesAccess: PermissionCheckResult;
  cameraPermission: PermissionCheckResult;
  overlayPermission: PermissionCheckResult;
};

/**
 * Check root access by actually executing su command
 */
export async function checkRootAccess(): Promise<PermissionCheckResult> {
  try {
    if (!VirtuCamSettings) {
      return {
        status: 'denied',
        detail: 'Native module not available',
        canRequest: false,
      };
    }

    const result = await VirtuCamSettings.checkRootAccess();
    
    if (result.granted) {
      return {
        status: 'granted',
        detail: 'Root access confirmed',
        canRequest: false,
      };
    } else {
      return {
        status: 'denied',
        detail: result.error || 'Root not available',
        canRequest: false,
      };
    }
  } catch (error) {
    return {
      status: 'denied',
      detail: 'Root check failed',
      canRequest: false,
    };
  }
}

/**
 * Check if LSPosed module is active
 */
export async function checkLSPosedModule(): Promise<PermissionCheckResult> {
  try {
    if (!VirtuCamSettings) {
      return {
        status: 'denied',
        detail: 'Native module not available',
        canRequest: false,
      };
    }

    const result = await VirtuCamSettings.checkXposedStatus();
    
    if (result.moduleActive) {
      return {
        status: 'granted',
        detail: 'Module active in LSPosed',
        canRequest: false,
      };
    } else if (result.lsposedInstalled) {
      return {
        status: 'denied',
        detail: 'Activate module in LSPosed Manager and reboot',
        canRequest: true,
      };
    } else {
      return {
        status: 'denied',
        detail: 'LSPosed not installed',
        canRequest: false,
      };
    }
  } catch (error) {
    return {
      status: 'denied',
      detail: 'LSPosed check failed',
      canRequest: false,
    };
  }
}

/**
 * Check MANAGE_EXTERNAL_STORAGE permission (All Files Access)
 */
export async function checkAllFilesAccess(): Promise<PermissionCheckResult> {
  try {
    if (Platform.OS !== 'android') {
      return {
        status: 'granted',
        detail: 'Not required on this platform',
        canRequest: false,
      };
    }

    if (!VirtuCamSettings) {
      return {
        status: 'denied',
        detail: 'Native module not available',
        canRequest: false,
      };
    }

    const granted = await VirtuCamSettings.checkAllFilesAccess();
    
    if (granted) {
      return {
        status: 'granted',
        detail: 'All files access granted',
        canRequest: false,
      };
    } else {
      return {
        status: 'denied',
        detail: 'Grant in system settings',
        canRequest: true,
      };
    }
  } catch (error) {
    return {
      status: 'denied',
      detail: 'Permission check failed',
      canRequest: true,
    };
  }
}

/**
 * Check camera permission
 */
export async function checkCameraPermission(): Promise<PermissionCheckResult> {
  try {
    const { status } = await ImagePicker.getCameraPermissionsAsync();
    
    if (status === 'granted') {
      return {
        status: 'granted',
        detail: 'Camera access granted',
        canRequest: false,
      };
    } else if (status === 'denied') {
      return {
        status: 'denied',
        detail: 'Camera access denied',
        canRequest: true,
      };
    } else {
      return {
        status: 'pending',
        detail: 'Camera permission required',
        canRequest: true,
      };
    }
  } catch (error) {
    return {
      status: 'denied',
      detail: 'Permission check failed',
      canRequest: true,
    };
  }
}

/**
 * Check overlay permission (SYSTEM_ALERT_WINDOW)
 */
export async function checkOverlayPermission(): Promise<PermissionCheckResult> {
  try {
    if (Platform.OS !== 'android') {
      return {
        status: 'granted',
        detail: 'Not required on this platform',
        canRequest: false,
      };
    }

    // Android doesn't provide a direct API to check this
    // We'll use a heuristic: try to check via Settings.canDrawOverlays if available
    // For now, we'll assume it needs to be granted manually
    return {
      status: 'pending',
      detail: 'Overlay permission required',
      canRequest: true,
    };
  } catch (error) {
    return {
      status: 'pending',
      detail: 'Permission check failed',
      canRequest: true,
    };
  }
}

/**
 * Check all permissions at once
 */
export async function checkAllPermissions(): Promise<AllPermissionsState> {
  const [rootAccess, lsposedModule, allFilesAccess, cameraPermission, overlayPermission] =
    await Promise.all([
      checkRootAccess(),
      checkLSPosedModule(),
      checkAllFilesAccess(),
      checkCameraPermission(),
      checkOverlayPermission(),
    ]);

  return {
    rootAccess,
    lsposedModule,
    allFilesAccess,
    cameraPermission,
    overlayPermission,
  };
}

/**
 * Request camera permission
 */
export async function requestCameraPermission(): Promise<PermissionStatus> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  } catch (error) {
    return 'denied';
  }
}

/**
 * Request all files access permission
 */
export async function requestAllFilesAccess(): Promise<void> {
  if (Platform.OS !== 'android') return;

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
}

/**
 * Request overlay permission
 */
export async function requestOverlayPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.MANAGE_OVERLAY_PERMISSION
    );
  } catch {
    await Linking.openSettings();
  }
}

/**
 * Open LSPosed Manager
 */
export async function openLSPosedManager(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    // Try to open LSPosed Manager via package name
    await Linking.openURL('package:org.lsposed.manager');
  } catch {
    // Fallback to settings
    try {
      await Linking.openSettings();
    } catch {
      // Silent fail
    }
  }
}

/**
 * Open app settings
 */
export async function openAppSettings(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        {
          data: 'package:com.briefplantrain.virtucam',
        }
      );
    } else {
      await Linking.openSettings();
    }
  } catch {
    await Linking.openSettings();
  }
}

/**
 * Check if all required permissions are granted
 */
export function areAllPermissionsGranted(state: AllPermissionsState): boolean {
  return (
    state.rootAccess.status === 'granted' &&
    state.lsposedModule.status === 'granted' &&
    state.allFilesAccess.status === 'granted' &&
    state.cameraPermission.status === 'granted' &&
    state.overlayPermission.status === 'granted'
  );
}
