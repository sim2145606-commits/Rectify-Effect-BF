import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';
import { checkCameraHardware } from './CompatibilityEngine';
import {
  checkAllFilesAccess as checkAllFilesAccessPerm,
  checkOverlayPermission as checkOverlayPerm,
  PermissionStatus,
} from './PermissionManager';


export type SystemCheckStatus = 'checking' | 'passed' | 'failed' | 'warning' | 'unavailable';

export type SystemCheckResult = {
  id: string;
  label: string;
  status: SystemCheckStatus;
  detail: string;
  timestamp: number;
};

export type SystemVerificationState = {
  rootAccess: SystemCheckResult;
  xposedFramework: SystemCheckResult;
  moduleActive: SystemCheckResult;
  storagePermission: SystemCheckResult;
  overlayPermission: SystemCheckResult;
  cameraService: SystemCheckResult;
  overallReady: boolean;
  lastChecked: number;
};

const createCheck = (
  id: string,
  label: string,
  status: SystemCheckStatus = 'checking',
  detail: string = 'Verifying...'
): SystemCheckResult => ({
  id,
  label,
  status,
  detail,
  timestamp: Date.now(),
});

export const INITIAL_SYSTEM_STATE: SystemVerificationState = {
  rootAccess: createCheck('root', 'Root Access'),
  xposedFramework: createCheck('xposed', 'Xposed Framework'),
  moduleActive: createCheck('module', 'VirtuCam Module'),
  storagePermission: createCheck('storage', 'Storage Access'),
  overlayPermission: createCheck('overlay', 'Overlay Permission'),
  cameraService: createCheck('camera', 'Camera Service'),
  overallReady: false,
  lastChecked: 0,
};

async function checkRootAccess(): Promise<SystemCheckResult> {
  const check = createCheck('root', 'Root Access');

  if (Platform.OS !== 'android') {
    return { ...check, status: 'unavailable', detail: 'Android only feature' };
  }

  try {
    // Check for common root indicators
    const rootPaths = [
      '/system/app/Superuser.apk',
      '/system/xbin/su',
      '/system/bin/su',
      '/sbin/su',
      '/data/local/xbin/su',
      '/data/local/bin/su',
      '/system/sd/xbin/su',
    ];

    let rootFound = false;
    for (const path of rootPaths) {
      try {
        const info = await FileSystem.getInfoAsync(`file://${path}`);
        if (info.exists) {
          rootFound = true;
          break;
        }
      } catch {
        // Path not accessible, continue checking
      }
    }

    // Also check build properties
    const buildTags = (Application.nativeBuildVersion || '').toLowerCase();
    const hasTestKeys = buildTags.includes('test-keys');

    if (rootFound || hasTestKeys) {
      return { ...check, status: 'passed', detail: 'Superuser access detected' };
    }

    // In Expo Go / development mode, simulate based on platform
    if (__DEV__) {
      return { ...check, status: 'warning', detail: 'Root not detected — grant SU access' };
    }

    return { ...check, status: 'warning', detail: 'Root access not detected' };
  } catch {
    return { ...check, status: 'warning', detail: 'Unable to verify root status' };
  }
}

async function checkXposedFramework(): Promise<SystemCheckResult> {
  const check = createCheck('xposed', 'Xposed Framework');

  if (Platform.OS !== 'android') {
    return { ...check, status: 'unavailable', detail: 'Android only feature' };
  }

  try {
    // Check for Xposed / LSPosed framework indicators
    const xposedPaths = [
      '/data/adb/lspd',
      '/data/adb/modules/zygisk_lsposed',
      '/data/adb/modules/riru_lsposed',
      '/system/framework/XposedBridge.jar',
      '/data/misc/riru/modules/lsposed',
    ];

    let frameworkFound = false;
    let frameworkType = 'Unknown';

    for (const path of xposedPaths) {
      try {
        const info = await FileSystem.getInfoAsync(`file://${path}`);
        if (info.exists) {
          frameworkFound = true;
          if (path.includes('lsposed') || path.includes('lspd')) {
            frameworkType = 'LSPosed';
          } else {
            frameworkType = 'Xposed';
          }
          break;
        }
      } catch {
        // Continue checking
      }
    }

    // Check for the manager app's data directory
    const xposedInstallerPaths = [
      '/data/data/org.lsposed.manager',
      '/data/data/de.robv.android.xposed.installer',
      '/data/user_de/0/org.lsposed.manager',
    ];

    if (!frameworkFound) {
      for (const path of xposedInstallerPaths) {
        try {
          const info = await FileSystem.getInfoAsync(`file://${path}`);
          if (info.exists) {
            frameworkFound = true;
            frameworkType = path.includes('lsposed') ? 'LSPosed' : 'Xposed';
            break;
          }
        } catch {
          // Continue
        }
      }
    }


    if (frameworkFound) {
      return { ...check, status: 'passed', detail: `${frameworkType} framework active` };
    }

    return { ...check, status: 'warning', detail: 'No Xposed/LSPosed framework detected' };
  } catch {
    return { ...check, status: 'warning', detail: 'Unable to detect Xposed framework' };
  }
}

async function checkModuleActive(): Promise<SystemCheckResult> {
  const check = createCheck('module', 'VirtuCam Module');

  if (Platform.OS !== 'android') {
    return { ...check, status: 'unavailable', detail: 'Android only feature' };
  }

  try {
    // Check if the VirtuCam module config exists in the expected location
    const modulePaths = [
      '/data/adb/modules/virtucam',
      '/data/adb/lspd/config/virtucam',
    ];

    for (const path of modulePaths) {
      try {
        const info = await FileSystem.getInfoAsync(`file://${path}`);
        if (info.exists) {
          return { ...check, status: 'passed', detail: 'Module enabled in framework' };
        }
      } catch {
        // Continue
      }
    }

    // Check if our shared config file exists (indicates module was set up)
    try {
      const configPath = `${FileSystem.documentDirectory}virtucam_bridge.json`;
      const info = await FileSystem.getInfoAsync(configPath);
      if (info.exists) {
        return { ...check, status: 'passed', detail: 'Module configured via bridge' };
      }
    } catch {
      // Continue
    }

    return { ...check, status: 'warning', detail: 'Module not detected — enable in LSPosed' };
  } catch {
    return { ...check, status: 'warning', detail: 'Unable to verify module status' };
  }
}

function mapPermStatus(permStatus: PermissionStatus): SystemCheckStatus {
  switch (permStatus) {
    case 'granted':
      return 'passed';
    case 'denied':
    case 'undetermined':
      return 'warning';
    case 'unavailable':
    default:
      return 'unavailable';
  }
}

async function checkStoragePermission(): Promise<SystemCheckResult> {
  const check = createCheck('storage', 'Storage Access');
  const permStatus = await checkAllFilesAccessPerm();

  if (permStatus === 'unavailable') {
    return { ...check, status: 'unavailable', detail: 'Android only feature' };
  }

  const status = mapPermStatus(permStatus);
  return {
    ...check,
    status,
    detail: status === 'passed' ? 'All files access granted' : 'All files access not granted',
  };
}


async function checkOverlayPermission(): Promise<SystemCheckResult> {
  const check = createCheck('overlay', 'Overlay Permission');
  const permStatus = await checkOverlayPerm();

  if (permStatus === 'unavailable') {
    return { ...check, status: 'unavailable', detail: 'Android only feature' };
  }

  const status = mapPermStatus(permStatus);
  return {
    ...check,
    status,
    detail: status === 'passed' ? 'Overlay permission granted' : 'Overlay permission not confirmed',
  };
}


async function checkCameraService(): Promise<SystemCheckResult> {
  const check = createCheck('camera', 'Camera Service');

  try {
    const hardwareInfo = await checkCameraHardware();

    if (!hardwareInfo.hasPermission) {
      return { ...check, status: 'warning', detail: 'Camera permission not granted' };
    }

    if (!hardwareInfo.isAvailable) {
      return { ...check, status: 'failed', detail: 'No camera hardware available' };
    }

    if (hardwareInfo.cameraCount === 0) {
      return { ...check, status: 'failed', detail: 'No cameras found on this device' };
    }

    return { ...check, status: 'passed', detail: `Found ${hardwareInfo.cameraCount} cameras. Ready for stream.` };

  } catch (e) {
    return { ...check, status: 'failed', detail: `An error occurred while checking camera service.` };
  }
}

export async function runFullSystemCheck(): Promise<SystemVerificationState> {
  const [
    rootAccess,
    xposedFramework,
    moduleActive,
    storagePermission,
    overlayPermission,
    cameraService,
  ] = await Promise.all([
    checkRootAccess(),
    checkXposedFramework(),
    checkModuleActive(),
    checkStoragePermission(),
    checkOverlayPermission(),
    checkCameraService(),
  ]);

  const criticalChecks = [rootAccess, xposedFramework, moduleActive, storagePermission];
  const overallReady = criticalChecks.every(
    (c) => c.status === 'passed' || c.status === 'unavailable'
  );

  const state: SystemVerificationState = {
    rootAccess,
    xposedFramework,
    moduleActive,
    storagePermission,
    overlayPermission,
    cameraService,
    overallReady,
    lastChecked: Date.now(),
  };

  // Persist state
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SYSTEM_STATUS, JSON.stringify(state));
  } catch {
    // Silent fail
  }

  return state;
}

export async function getCachedSystemStatus(): Promise<SystemVerificationState | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.SYSTEM_STATUS);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Silent
  }
  return null;
}

export function getStatusColor(status: SystemCheckStatus): string {
  switch (status) {
    case 'passed':
      return '#00D4FF'; // Electric Blue
    case 'warning':
      return '#FFB800'; // Warning Amber
    case 'failed':
      return '#FF3B30'; // Danger Red
    case 'checking':
      return '#A0A0B0'; // Grey
    case 'unavailable':
      return '#5A5A6E'; // Muted
    default:
      return '#A0A0B0';
  }
}

export function getStatusIcon(status: SystemCheckStatus): string {
  switch (status) {
    case 'passed':
      return 'checkmark-circle';
    case 'warning':
      return 'alert-circle';
    case 'failed':
      return 'close-circle';
    case 'checking':
      return 'hourglass-outline';
    case 'unavailable':
      return 'remove-circle-outline';
    default:
      return 'help-circle-outline';
  }
}
