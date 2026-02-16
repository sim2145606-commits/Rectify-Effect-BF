import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, STORAGE_KEYS } from '@/constants/theme';

const { VirtuCamSettings } = NativeModules;

export type SystemCheckStatus = 'ok' | 'warning' | 'error' | 'loading';

export type SystemCheck = {
  label: string;
  detail: string;
  status: SystemCheckStatus;
};

export type SystemInfo = {
  manufacturer: string;
  model: string;
  brand: string;
  product: string;
  device: string;
  androidVersion: string;
  sdkLevel: number;
  buildNumber: string;
  fingerprint: string;
  securityPatch: string;
  kernelVersion: string;
  selinuxStatus: string;
  abiList: string;
  storage: string;
  maxMemory: string;
  rootSolution: string;
  rootVersion: string;
};

export type SystemVerificationState = {
  overallReady: boolean;
  lastChecked: number;
  rootAccess: SystemCheck;
  xposedFramework: SystemCheck;
  moduleActive: SystemCheck;
  storagePermission: SystemCheck;
};

const CACHE_KEY = STORAGE_KEYS.SYSTEM_STATUS;

export const INITIAL_SYSTEM_STATE: SystemVerificationState = {
  overallReady: false,
  lastChecked: 0,
  rootAccess: {
    label: 'Root Access',
    detail: 'Checking...',
    status: 'loading',
  },
  xposedFramework: {
    label: 'LSPosed / Xposed',
    detail: 'Checking...',
    status: 'loading',
  },
  moduleActive: {
    label: 'VirtuCam Module',
    detail: 'Checking...',
    status: 'loading',
  },
  storagePermission: {
    label: 'Storage Permission',
    detail: 'Checking...',
    status: 'loading',
  },
};

export function getStatusColor(status: SystemCheckStatus): string {
  switch (status) {
    case 'ok':
      return Colors.success;
    case 'warning':
      return Colors.warningAmber;
    case 'error':
      return Colors.danger;
    case 'loading':
    default:
      return Colors.textTertiary;
  }
}

export function getStatusIcon(status: SystemCheckStatus): string {
  switch (status) {
    case 'ok':
      return 'checkmark-circle';
    case 'warning':
      return 'warning';
    case 'error':
      return 'close-circle';
    case 'loading':
    default:
      return 'hourglass';
  }
}

export async function getCachedSystemStatus(): Promise<SystemVerificationState | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    return JSON.parse(cached) as SystemVerificationState;
  } catch {
    return null;
  }
}

/**
 * Run full system check with REAL verification
 */
export async function runFullSystemCheck(): Promise<SystemVerificationState> {
  const result: SystemVerificationState = {
    rootAccess: {
      label: 'Root Access',
      detail: 'Checking root access...',
      status: 'loading',
    },
    xposedFramework: {
      label: 'LSPosed / Xposed',
      detail: 'Checking framework...',
      status: 'loading',
    },
    moduleActive: {
      label: 'VirtuCam Module',
      detail: 'Checking module status...',
      status: 'loading',
    },
    storagePermission: {
      label: 'Storage Permission',
      detail: 'Checking permissions...',
      status: 'loading',
    },
    overallReady: false,
    lastChecked: Date.now(),
  };

  try {
    // Check root access
    if (VirtuCamSettings && VirtuCamSettings.checkRootAccess) {
      try {
        const rootResult = await VirtuCamSettings.checkRootAccess();
        if (rootResult.granted) {
          result.rootAccess = {
            label: 'Root Access',
            detail: 'Root access granted',
            status: 'ok',
          };
        } else {
          result.rootAccess = {
            label: 'Root Access',
            detail: rootResult.error || 'Root not available',
            status: 'error',
          };
        }
      } catch (error: any) {
        result.rootAccess = {
          label: 'Root Access',
          detail: 'Root check failed',
          status: 'error',
        };
      }
    } else {
      result.rootAccess = {
        label: 'Root Access',
        detail: 'Native module unavailable',
        status: 'error',
      };
    }

    // Check Xposed/LSPosed
    if (VirtuCamSettings && VirtuCamSettings.checkXposedStatus) {
      try {
        const xposedResult = await VirtuCamSettings.checkXposedStatus();
        if (xposedResult.xposedActive) {
          result.xposedFramework = {
            label: 'LSPosed / Xposed',
            detail: 'Framework active',
            status: 'ok',
          };
        } else if (xposedResult.lsposedInstalled) {
          result.xposedFramework = {
            label: 'LSPosed / Xposed',
            detail: 'Installed but not active',
            status: 'warning',
          };
        } else {
          result.xposedFramework = {
            label: 'LSPosed / Xposed',
            detail: 'Not installed',
            status: 'error',
          };
        }

        // Check module activation
        if (xposedResult.moduleActive) {
          result.moduleActive = {
            label: 'VirtuCam Module',
            detail: 'Module active',
            status: 'ok',
          };
        } else {
          result.moduleActive = {
            label: 'VirtuCam Module',
            detail: 'Activate in LSPosed Manager',
            status: 'error',
          };
        }
      } catch (error: any) {
        result.xposedFramework = {
          label: 'LSPosed / Xposed',
          detail: 'Check failed',
          status: 'error',
        };
        result.moduleActive = {
          label: 'VirtuCam Module',
          detail: 'Check failed',
          status: 'error',
        };
      }
    } else {
      result.xposedFramework = {
        label: 'LSPosed / Xposed',
        detail: 'Native module unavailable',
        status: 'error',
      };
      result.moduleActive = {
        label: 'VirtuCam Module',
        detail: 'Native module unavailable',
        status: 'error',
      };
    }

    // Check storage permission
    if (VirtuCamSettings && VirtuCamSettings.checkAllFilesAccess) {
      try {
        const storageGranted = await VirtuCamSettings.checkAllFilesAccess();
        if (storageGranted) {
          result.storagePermission = {
            label: 'Storage Permission',
            detail: 'All files access granted',
            status: 'ok',
          };
        } else {
          result.storagePermission = {
            label: 'Storage Permission',
            detail: 'Grant all files access',
            status: 'error',
          };
        }
      } catch (error: any) {
        result.storagePermission = {
          label: 'Storage Permission',
          detail: 'Permission check failed',
          status: 'error',
        };
      }
    } else {
      result.storagePermission = {
        label: 'Storage Permission',
        detail: 'Native module unavailable',
        status: 'error',
      };
    }
  } catch (error) {
    console.error('System check error:', error);
  }

  // Determine overall readiness
  result.overallReady = [
    result.rootAccess,
    result.xposedFramework,
    result.moduleActive,
    result.storagePermission,
  ].every((check) => check.status === 'ok');

  // Cache the result
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // Cache failures are non-fatal
  }

  return result;
}

/**
 * Get comprehensive system information
 */
export async function getSystemInfo(): Promise<SystemInfo | null> {
  try {
    if (!VirtuCamSettings || !VirtuCamSettings.getSystemInfo) {
      return null;
    }

    const info = await VirtuCamSettings.getSystemInfo();
    
    // Get root solution
    let rootSolution = 'None';
    let rootVersion = '';
    if (VirtuCamSettings.detectRootSolution) {
      try {
        const rootResult = await VirtuCamSettings.detectRootSolution();
        rootSolution = rootResult.solution || 'None';
        rootVersion = rootResult.version || '';
      } catch {
        // Silent
      }
    }

    return {
      manufacturer: info.manufacturer || 'Unknown',
      model: info.model || 'Unknown',
      brand: info.brand || 'Unknown',
      product: info.product || 'Unknown',
      device: info.device || 'Unknown',
      androidVersion: info.androidVersion || 'Unknown',
      sdkLevel: info.sdkLevel || 0,
      buildNumber: info.buildNumber || 'Unknown',
      fingerprint: info.fingerprint || 'Unknown',
      securityPatch: info.securityPatch || 'Unknown',
      kernelVersion: info.kernelVersion || 'Unknown',
      selinuxStatus: info.selinuxStatus || 'Unknown',
      abiList: info.abiList || 'Unknown',
      storage: info.storage || 'Unknown',
      maxMemory: info.maxMemory || 'Unknown',
      rootSolution,
      rootVersion,
    };
  } catch (error) {
    console.error('Failed to get system info:', error);
    return null;
  }
}
