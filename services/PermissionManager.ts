import { Platform, Linking, NativeModules } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as ImagePicker from 'expo-image-picker';

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
      return { status: 'denied', detail: 'Native module not available', canRequest: false };
    }

    const result = await VirtuCamSettings.checkRootAccess();

    if (result.granted) {
      return { status: 'granted', detail: 'Root access confirmed', canRequest: false };
    } else {
      return {
        status: 'denied',
        detail: result.error || 'Root not available',
        canRequest: false,
      };
    }
  } catch {
    return { status: 'denied', detail: 'Root check failed', canRequest: false };
  }
}

/**
 * Check if LSPosed module is active
 */
export async function checkLSPosedModule(): Promise<PermissionCheckResult> {
  try {
    if (!VirtuCamSettings) {
      return { status: 'denied', detail: 'Native module not available', canRequest: false };
    }

    const result = await VirtuCamSettings.checkXposedStatus();

    const moduleLoaded = !!result.moduleLoaded;
    const moduleScoped = !!result.moduleScoped;
    const hookConfigured = !!result.hookConfigured;
    const hookReady = !!result.hookReady;
    const scopeReason = String(result.scopeEvaluationReason ?? '');

    if (hookReady) {
      return { status: 'granted', detail: 'Module active in LSPosed', canRequest: false };
    }

    if (moduleLoaded && moduleScoped) {
      return {
        status: 'granted',
        detail: hookConfigured
          ? 'Module loaded and scoped in LSPosed'
          : 'Module + scope detected. Finish hook configuration in VirtuCam app.',
        canRequest: false,
      };
    }

    if (moduleLoaded && !moduleScoped) {
      if (scopeReason === 'whitelist_no_targets_configured') {
        return {
          status: 'granted',
          detail: 'Module loaded. No local target list configured; LSPosed scope will be used.',
          canRequest: false,
        };
      }
      return {
        status: 'denied',
        detail: 'Module loaded, but scope missing for configured target app(s). Add scope in LSPosed and reboot.',
        canRequest: true,
      };
    }

    if (!moduleLoaded && moduleScoped) {
      return {
        status: 'pending',
        detail: 'Scope configured, but module not loaded in any hooked process yet. Open a target app after reboot.',
        canRequest: true,
      };
    }

    if (result.lsposedInstalled) {
      if (scopeReason === 'whitelist_no_targets_configured') {
        return {
          status: 'granted',
          detail: 'LSPosed detected. No local target list configured; LSPosed scope will be used.',
          canRequest: false,
        };
      }

      const detail = scopeReason === 'whitelist_targets_not_in_scope'
        ? 'LSPosed detected, but selected target app(s) are not scoped yet. Update LSPosed scope and reboot.'
        : 'LSPosed detected. Module is not loaded in any hooked process yet. Open a target app once after reboot.';

      return {
        status: 'denied',
        detail,
        canRequest: true,
      };
    }

    return { status: 'denied', detail: 'LSPosed not installed', canRequest: false };
  } catch {
    return { status: 'denied', detail: 'LSPosed check failed', canRequest: false };
  }
}
/**
 * Check MANAGE_EXTERNAL_STORAGE permission (All Files Access)
 */
export async function checkAllFilesAccess(): Promise<PermissionCheckResult> {
  try {
    if (Platform.OS !== 'android') {
      return { status: 'granted', detail: 'Not required on this platform', canRequest: false };
    }

    if (!VirtuCamSettings) {
      return { status: 'denied', detail: 'Native module not available', canRequest: false };
    }

    const granted = await VirtuCamSettings.checkAllFilesAccess();

    if (granted) {
      return { status: 'granted', detail: 'All files access granted', canRequest: false };
    } else {
      return { status: 'denied', detail: 'Grant in system settings', canRequest: true };
    }
  } catch {
    return { status: 'denied', detail: 'Permission check failed', canRequest: true };
  }
}

/**
 * Check camera permission
 */
export async function checkCameraPermission(): Promise<PermissionCheckResult> {
  try {
    const { status } = await ImagePicker.getCameraPermissionsAsync();

    if (status === 'granted') {
      return { status: 'granted', detail: 'Camera access granted', canRequest: false };
    } else if (status === 'denied') {
      return { status: 'denied', detail: 'Camera access denied', canRequest: true };
    } else {
      return { status: 'pending', detail: 'Camera permission required', canRequest: true };
    }
  } catch {
    return { status: 'denied', detail: 'Permission check failed', canRequest: true };
  }
}

/**
 * Check overlay permission (SYSTEM_ALERT_WINDOW)
 */
export async function checkOverlayPermission(): Promise<PermissionCheckResult> {
  try {
    if (Platform.OS !== 'android') {
      return { status: 'granted', detail: 'Not required on this platform', canRequest: false };
    }

    if (!VirtuCamSettings) {
      return { status: 'denied', detail: 'Native module not available', canRequest: false };
    }

    const granted = await VirtuCamSettings.checkOverlayPermission();

    if (granted) {
      return { status: 'granted', detail: 'Overlay permission granted', canRequest: false };
    } else {
      return { status: 'pending', detail: 'Overlay permission required', canRequest: true };
    }
  } catch {
    return { status: 'pending', detail: 'Permission check failed', canRequest: true };
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

  return { rootAccess, lsposedModule, allFilesAccess, cameraPermission, overlayPermission };
}

/**
 * Request camera permission
 */
export async function requestCameraPermission(): Promise<PermissionStatus> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  } catch {
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
      'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
      { data: 'package:com.briefplantrain.virtucam' }
    );
  } catch {
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION'
      );
    } catch {
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
          { data: 'package:com.briefplantrain.virtucam' }
        );
      } catch {
        await Linking.openSettings();
      }
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
      'android.settings.action.MANAGE_OVERLAY_PERMISSION',
      { data: 'package:com.briefplantrain.virtucam' }
    );
  } catch {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        { data: 'package:com.briefplantrain.virtucam' }
      );
    } catch {
      await Linking.openSettings();
    }
  }
}

/**
 * Open LSPosed Manager or the appropriate root manager
 */
export async function openLSPosedManager(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    if (!VirtuCamSettings) {
      await Linking.openSettings();
      return;
    }

    const managerInfo = await VirtuCamSettings.detectLSPosedManager();

    if (managerInfo.packageName && !managerInfo.isParasitic) {
      try {
        await Linking.openURL(`package:${managerInfo.packageName}`);
        return;
      } catch {
        // Fall through
      }
    }

    if (managerInfo.packageName && managerInfo.isParasitic) {
      try {
        await Linking.openURL(`package:${managerInfo.packageName}`);
        return;
      } catch {
        // Fall through
      }
    }

    const lsposedPackages = [
      'org.lsposed.manager',
      'io.github.lsposed.manager',
      'me.weishu.kernelsu',
      'com.topjohnwu.magisk',
    ];

    for (const pkg of lsposedPackages) {
      try {
        await Linking.openURL(`package:${pkg}`);
        return;
      } catch {
        // Continue to next package
      }
    }

    await Linking.openSettings();
  } catch {
    try {
      await Linking.openSettings();
    } catch {
      // Complete silent fail
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
        { data: 'package:com.briefplantrain.virtucam' }
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

