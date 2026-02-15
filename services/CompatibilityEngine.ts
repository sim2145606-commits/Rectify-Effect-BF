import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';
import { Camera } from 'expo-camera';

export type CameraHardwareInfo = {
  hasPermission: boolean;
  isAvailable: boolean;
  cameraCount: number;
  supportedTypes: Camera['props']['type'][];
};

export type CameraAPIMode = 'camera2' | 'camera1' | 'auto';

export type AndroidVersionInfo = {
  sdkVersion: number;
  versionName: string;
  codename: string;
  requiresScopedStorage: boolean;
  requiresPostNotificationPermission: boolean;
  requiresMediaProjectionForeground: boolean;
  requiresExactAlarmPermission: boolean;
  supportsCamera2: boolean;
  recommendedCameraAPI: CameraAPIMode;
};

export type CompatibilityReport = {
  androidVersion: AndroidVersionInfo;
  recommendedMode: CameraAPIMode;
  batteryOptimizationExempt: boolean;
  permissionsRequired: PermissionRequirement[];
  compatibilityScore: number;
  timestamp: number;
};

export type PermissionRequirement = {
  id: string;
  name: string;
  description: string;
  required: boolean;
  minSdkVersion: number;
  status: 'granted' | 'denied' | 'not_required' | 'unknown';
  intentAction?: string;
};

// Android version mapping
const ANDROID_VERSIONS: Record<number, { name: string; codename: string }> = {
  28: { name: '9.0', codename: 'Pie' },
  29: { name: '10', codename: 'Q' },
  30: { name: '11', codename: 'R' },
  31: { name: '12', codename: 'S' },
  32: { name: '12L', codename: 'S_V2' },
  33: { name: '13', codename: 'Tiramisu' },
  34: { name: '14', codename: 'Upside Down Cake' },
  35: { name: '15', codename: 'Vanilla Ice Cream' },
  36: { name: '16', codename: 'Baklava' },
};

export function getAndroidSDKVersion(): number {
  if (Platform.OS !== 'android') return 0;
  return Platform.Version as number || 0;
}

export function getAndroidVersionInfo(): AndroidVersionInfo {
  const sdkVersion = getAndroidSDKVersion();
  const versionData = ANDROID_VERSIONS[sdkVersion] || { name: `API ${sdkVersion}`, codename: 'Unknown' };

  return {
    sdkVersion,
    versionName: versionData.name,
    codename: versionData.codename,
    requiresScopedStorage: sdkVersion >= 30, // Android 11+
    requiresPostNotificationPermission: sdkVersion >= 33, // Android 13+
    requiresMediaProjectionForeground: sdkVersion >= 34, // Android 14+
    requiresExactAlarmPermission: sdkVersion >= 31, // Android 12+
    supportsCamera2: sdkVersion >= 21, // Android 5.0+ (Lollipop)
    recommendedCameraAPI: sdkVersion >= 21 ? 'camera2' : 'camera1',
  };
}

export function getPermissionRequirements(sdkVersion: number): PermissionRequirement[] {
  const permissions: PermissionRequirement[] = [
    {
      id: 'camera',
      name: 'Camera Access',
      description: 'Required for camera device enumeration and stream interception',
      required: true,
      minSdkVersion: 1,
      status: 'unknown',
    },
    {
      id: 'storage_read',
      name: 'Read Storage',
      description: 'Access media files for injection source',
      required: sdkVersion < 33,
      minSdkVersion: 1,
      status: sdkVersion >= 33 ? 'not_required' : 'unknown',
    },
    {
      id: 'media_images',
      name: 'Read Media Images',
      description: 'Granular media access for Android 13+',
      required: sdkVersion >= 33,
      minSdkVersion: 33,
      status: sdkVersion < 33 ? 'not_required' : 'unknown',
    },
    {
      id: 'media_video',
      name: 'Read Media Video',
      description: 'Granular video access for Android 13+',
      required: sdkVersion >= 33,
      minSdkVersion: 33,
      status: sdkVersion < 33 ? 'not_required' : 'unknown',
    },
    {
      id: 'all_files',
      name: 'All Files Access',
      description: 'Manage all files for system-level media injection',
      required: sdkVersion >= 30,
      minSdkVersion: 30,
      status: sdkVersion < 30 ? 'not_required' : 'unknown',
      intentAction: 'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION',
    },
    {
      id: 'overlay',
      name: 'System Overlay',
      description: 'Display over other apps for injection status overlay',
      required: true,
      minSdkVersion: 23,
      status: 'unknown',
      intentAction: 'android.settings.action.MANAGE_OVERLAY_PERMISSION',
    },
    {
      id: 'post_notifications',
      name: 'Post Notifications',
      description: 'Show persistent notification for foreground service (Android 13+)',
      required: sdkVersion >= 33,
      minSdkVersion: 33,
      status: sdkVersion < 33 ? 'not_required' : 'unknown',
    },
    {
      id: 'foreground_service_media_projection',
      name: 'Media Projection',
      description: 'Foreground service type required for screen capture (Android 14+)',
      required: sdkVersion >= 34,
      minSdkVersion: 34,
      status: sdkVersion < 34 ? 'not_required' : 'unknown',
    },
    {
      id: 'battery_optimization',
      name: 'Battery Unrestricted',
      description: 'Exempt from battery optimization for uninterrupted background injection',
      required: true,
      minSdkVersion: 23,
      status: 'unknown',
      intentAction: 'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    },
  ];

  return permissions;
}

export function determineOptimalCameraAPI(sdkVersion: number): {
  recommended: CameraAPIMode;
  reason: string;
  fallbackAvailable: boolean;
} {
  if (sdkVersion >= 28) {
    return {
      recommended: 'camera2',
      reason: `Android ${ANDROID_VERSIONS[sdkVersion]?.name || sdkVersion} fully supports Camera2 API. Recommended for best quality and modern app compatibility.`,
      fallbackAvailable: true,
    };
  }

  if (sdkVersion >= 21) {
    return {
      recommended: 'camera2',
      reason: 'Camera2 API is supported but some features may be limited. Legacy Camera1 fallback available.',
      fallbackAvailable: true,
    };
  }

  return {
    recommended: 'camera1',
    reason: 'Device does not support Camera2 API. Using Legacy Camera1 for maximum compatibility.',
    fallbackAvailable: false,
  };
}

export function calculateCompatibilityScore(
  sdkVersion: number,
  rootAccess: boolean,
  frameworkDetected: boolean,
  moduleActive: boolean
): number {
  let score = 0;

  // Android version compatibility (30 points)
  if (sdkVersion >= 28 && sdkVersion <= 36) {
    score += 30;
  } else if (sdkVersion >= 21 && sdkVersion < 28) {
    score += 20;
  } else {
    score += 5;
  }

  // Root access (25 points)
  if (rootAccess) score += 25;

  // Hooking framework (25 points)
  if (frameworkDetected) score += 25;

  // Module active (20 points)
  if (moduleActive) score += 20;

  return Math.min(100, score);
}

export async function runCompatibilityCheck(): Promise<CompatibilityReport> {
  const androidVersion = getAndroidVersionInfo();
  const cameraRecommendation = determineOptimalCameraAPI(androidVersion.sdkVersion);
  const permissions = getPermissionRequirements(androidVersion.sdkVersion);

  const report: CompatibilityReport = {
    androidVersion,
    recommendedMode: cameraRecommendation.recommended,
    batteryOptimizationExempt: false,
    permissionsRequired: permissions,
    compatibilityScore: 0,
    timestamp: Date.now(),
  };

  // Save to storage
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.COMPATIBILITY_MODE, cameraRecommendation.recommended);
    await AsyncStorage.setItem(STORAGE_KEYS.ANDROID_VERSION_DETECTED, JSON.stringify(androidVersion));
  } catch {
    // Non-critical
  }

  return report;
}

export function getBatteryOptimizationSteps(sdkVersion: number): {
  title: string;
  steps: string[];
  warning: string;
} {
  const baseName = ANDROID_VERSIONS[sdkVersion]?.name || `API ${sdkVersion}`;

  if (sdkVersion >= 33) {
    return {
      title: `Battery Settings — Android ${baseName}`,
      steps: [
        'Open Settings → Apps → VirtuCam',
        'Tap "Battery" or "App battery usage"',
        'Select "Unrestricted" to allow background activity',
        'Go to Settings → Battery → Battery optimization',
        'Find VirtuCam → Select "Don\'t optimize"',
        'For Samsung: Disable "Put app to sleep" and "Deep sleeping apps"',
      ],
      warning: 'Android 13+ aggressively kills background services. Unrestricted battery mode is critical for persistent injection.',
    };
  }

  if (sdkVersion >= 30) {
    return {
      title: `Battery Settings — Android ${baseName}`,
      steps: [
        'Open Settings → Apps → VirtuCam',
        'Tap "Battery" → Select "Unrestricted"',
        'Go to Settings → Battery → Battery optimization',
        'Find VirtuCam → Select "Don\'t optimize"',
        'For Xiaomi: Enable "Autostart" in Security app',
      ],
      warning: 'Scoped storage and background restrictions may interrupt injection if battery optimization is enabled.',
    };
  }

  return {
    title: `Battery Settings — Android ${baseName}`,
    steps: [
      'Open Settings → Battery → Battery optimization',
      'Select "All apps" from dropdown',
      'Find VirtuCam → Select "Don\'t optimize"',
      'For Huawei: Add to "Protected apps" list',
    ],
    warning: 'Disabling battery optimization ensures VirtuCam runs persistently in the background.',
  };
}

export async function checkCameraHardware(): Promise<CameraHardwareInfo> {
  const { status } = await Camera.getCameraPermissionsAsync();
  const hasPermission = status === 'granted';

  if (!hasPermission) {
    return {
      hasPermission: false,
      isAvailable: false,
      cameraCount: 0,
      supportedTypes: [],
    };
  }

  const isAvailable = await Camera.isAvailableAsync();
  if (!isAvailable) {
    return {
      hasPermission: true,
      isAvailable: false,
      cameraCount: 0,
      supportedTypes: [],
    };
  }

  // NOTE: getAvailableCameraTypesAsync is not available in expo-camera,
  // we will use a placeholder for now
  const supportedTypes = [Camera.Constants.Type.back, Camera.Constants.Type.front];
  const cameraCount = supportedTypes.length;

  return {
    hasPermission: true,
    isAvailable: true,
    cameraCount,
    supportedTypes,
  };
}
