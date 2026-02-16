import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, STORAGE_KEYS } from '@/constants/theme';

export type SystemCheckStatus = 'ok' | 'warning' | 'error' | 'loading';

export type SystemCheck = {
  label: string;
  detail: string;
  status: SystemCheckStatus;
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
    detail: 'Pending device check',
    status: 'loading',
  },
  xposedFramework: {
    label: 'LSPosed / Xposed',
    detail: 'Pending device check',
    status: 'loading',
  },
  moduleActive: {
    label: 'VirtuCam Module',
    detail: 'Pending device check',
    status: 'loading',
  },
  storagePermission: {
    label: 'Storage Permission',
    detail: 'Pending permission check',
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

export async function runFullSystemCheck(): Promise<SystemVerificationState> {
  // In the Expo dev client we cannot introspect root/LSPosed state.
  // Return a conservative status so UI still renders and cache it for fast loads.
  const result: SystemVerificationState = {
    rootAccess: {
      label: 'Root Access',
      detail: 'Requires Magisk / KernelSU on device',
      status: 'warning',
    },
    xposedFramework: {
      label: 'LSPosed / Xposed',
      detail: 'Enable module in LSPosed and reboot',
      status: 'warning',
    },
    moduleActive: {
      label: 'VirtuCam Module',
      detail: 'Activation pending device-side confirmation',
      status: 'warning',
    },
    storagePermission: {
      label: 'Storage Permission',
      detail: 'Grant media/storage so bridge can read media',
      status: 'warning',
    },
    overallReady: false,
    lastChecked: Date.now(),
  };

  result.overallReady = [
    result.rootAccess,
    result.xposedFramework,
    result.moduleActive,
    result.storagePermission,
  ].every((check) => check.status === 'ok');

  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // Cache failures are non-fatal
  }

  return result;
}
