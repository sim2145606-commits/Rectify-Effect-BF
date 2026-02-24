import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { DarkColors, STORAGE_KEYS } from '@/constants/theme';

function getLogger() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./LogService') as typeof import('./LogService')).logger;
}

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

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
  moduleScoped: SystemCheck;
  hookConfigured: SystemCheck;
  storagePermission: SystemCheck;
  allFilesAccess: SystemCheck;
  cameraPermission: SystemCheck;
  overlayPermission: SystemCheck;
};

type XposedStatusResult = {
  hookReady?: boolean;
  lsposedInstalled?: boolean;
  moduleLoaded?: boolean;
  moduleScoped?: boolean;
  hookConfigured?: boolean;
  ipcConfigReady?: boolean;
  stagedMediaReady?: boolean;
  runtimeHookObserved?: boolean;
  detectionMethod?: string;
  markerSource?: string;
  scopeEvaluationReason?: string;
  configuredTargets?: string;
  broadScopeDetected?: boolean;
  broadScopePackages?: string;
};

type IpcStatusResult = {
  configJsonExists?: boolean;
  configJsonReadable?: boolean;
  companionStatus?: string;
  moduleMarkerSource?: string;
  moduleMarkerExistsIpc?: boolean;
  moduleMarkerExistsLegacy?: boolean;
  stagedMediaPath?: string;
  stagedMediaExists?: boolean;
  stagedMediaReadable?: boolean;
};

type MappingLogStatus = {
  hasMappingLog: boolean;
  latestMappedCount: number | null;
  latestZeroReason: string | null;
};

const CACHE_KEY = STORAGE_KEYS.SYSTEM_STATUS;

export const INITIAL_SYSTEM_STATE: SystemVerificationState = {
  overallReady: false,
  lastChecked: 0,
  rootAccess: { label: 'Root Access', detail: 'Checking...', status: 'loading' },
  xposedFramework: { label: 'LSPosed / Xposed', detail: 'Checking...', status: 'loading' },
  moduleActive: { label: 'VirtuCam Module', detail: 'Checking...', status: 'loading' },
  moduleScoped: { label: 'Module Scope', detail: 'Checking...', status: 'loading' },
  hookConfigured: { label: 'Hook Configuration', detail: 'Checking...', status: 'loading' },
  storagePermission: { label: 'Storage Permission', detail: 'Checking...', status: 'loading' },
  allFilesAccess: { label: 'All Files Access', detail: 'Checking...', status: 'loading' },
  cameraPermission: { label: 'Camera Permission', detail: 'Checking...', status: 'loading' },
  overlayPermission: { label: 'Overlay Permission', detail: 'Checking...', status: 'loading' },
};

export function getStatusColor(status: SystemCheckStatus): string {
  switch (status) {
    case 'ok':
      return DarkColors.success;
    case 'warning':
      return DarkColors.warningAmber;
    case 'error':
      return DarkColors.danger;
    case 'loading':
    default:
      return DarkColors.textTertiary;
  }
}

export function getStatusIcon(status: SystemCheckStatus): IoniconsName {
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

function parseMappingLogStatus(logs: string): MappingLogStatus {
  if (!logs) {
    return {
      hasMappingLog: false,
      latestMappedCount: null,
      latestZeroReason: null,
    };
  }

  const lines = logs.split(/\r?\n/);
  let latestMappedCount: number | null = null;
  let latestZeroReason: string | null = null;

  for (const line of lines) {
    const mappedMatch = line.match(/mapped=(\d+)/);
    if (!mappedMatch) continue;
    const mapped = Number(mappedMatch[1]);
    if (!Number.isFinite(mapped)) continue;

    latestMappedCount = mapped;
    if (mapped === 0) {
      const reasonMatch = line.match(/reason=\{([^}]*)\}/);
      if (reasonMatch && reasonMatch[1]) {
        latestZeroReason = reasonMatch[1];
      }
    }
  }

  return {
    hasMappingLog: latestMappedCount !== null,
    latestMappedCount,
    latestZeroReason,
  };
}

function getScopeDetail(scopeReason: string, hasTargets: boolean): string {
  if (scopeReason === 'whitelist_no_targets_configured') {
    return 'Whitelist mode has no local target apps configured';
  }
  if (scopeReason === 'whitelist_targets_not_in_scope') {
    return 'Whitelist targets are not in LSPosed scope';
  }
  if (scopeReason === 'configured_targets_scoped') {
    return 'Configured targets found in LSPosed scope';
  }
  if (scopeReason === 'non_whitelist_mode') {
    return 'Scope accepted in non-whitelist mode';
  }
  if (!hasTargets) {
    return 'No local target app constraints configured';
  }
  return scopeReason || 'Scope status unclear';
}

function getMappingQuickFix(reason: string | null): string {
  const normalized = String(reason ?? '').toLowerCase();
  if (normalized.includes('enabled=false')) {
    return 'Enable Hook Enabled and run sync from dashboard';
  }
  if (normalized.includes('targeted=false')) {
    return 'Scope this package in LSPosed or relax local target mode';
  }
  if (normalized.includes('hasmedia=false') || normalized.includes('sourcemode=black')) {
    return 'Select media in Studio and keep source mode set to file or test';
  }
  return 'Open a scoped target camera app and check mapping again';
}

async function getMappingStatus(): Promise<MappingLogStatus> {
  try {
    if (!VirtuCamSettings?.getXposedLogs) {
      return { hasMappingLog: false, latestMappedCount: null, latestZeroReason: null };
    }
    const logsResult = (await VirtuCamSettings.getXposedLogs()) as { logs?: string };
    return parseMappingLogStatus(String(logsResult?.logs ?? ''));
  } catch {
    return { hasMappingLog: false, latestMappedCount: null, latestZeroReason: null };
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
    rootAccess: { label: 'Root Access', detail: 'Checking root access...', status: 'loading' },
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
    moduleScoped: {
      label: 'Module Scope',
      detail: 'Checking scope status...',
      status: 'loading',
    },
    hookConfigured: {
      label: 'Hook Configuration',
      detail: 'Checking hook configuration...',
      status: 'loading',
    },
    storagePermission: {
      label: 'Storage Permission',
      detail: 'Checking permissions...',
      status: 'loading',
    },
    allFilesAccess: {
      label: 'All Files Access',
      detail: 'Checking permissions...',
      status: 'loading',
    },
    cameraPermission: {
      label: 'Camera Permission',
      detail: 'Checking permissions...',
      status: 'loading',
    },
    overlayPermission: {
      label: 'Overlay Permission',
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
      } catch {
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

    // Check Xposed/LSPosed + IPC/mapping health
    if (VirtuCamSettings && VirtuCamSettings.checkXposedStatus) {
      try {
        const xposedResult = (await VirtuCamSettings.checkXposedStatus()) as XposedStatusResult;
        const ipcStatus = VirtuCamSettings.getIpcStatus
          ? ((await VirtuCamSettings.getIpcStatus()) as IpcStatusResult)
          : null;
        const mappingStatus = await getMappingStatus();

        const hasConfiguredTargets =
          String(xposedResult.configuredTargets ?? '')
            .trim()
            .length > 0;
        const scopeReason = String(xposedResult.scopeEvaluationReason ?? '');
        const scopeDetail = getScopeDetail(scopeReason, hasConfiguredTargets);
        const broadScopeDetected = xposedResult.broadScopeDetected === true;
        const broadScopePackages = String(xposedResult.broadScopePackages ?? '').trim();

        const configJsonReady = ipcStatus
          ? ipcStatus.configJsonExists === true && ipcStatus.configJsonReadable === true
          : null;
        const companionReady = ipcStatus
          ? String(ipcStatus.companionStatus ?? '').trim().toLowerCase() === 'ready'
          : null;
        const stagedMediaPath = String(ipcStatus?.stagedMediaPath ?? '').trim();
        const stagedMediaReadable =
          stagedMediaPath.length === 0
            ? null
            : ipcStatus?.stagedMediaExists === true && ipcStatus?.stagedMediaReadable === true;
        const moduleLoaded = xposedResult.moduleLoaded === true;
        const hookConfigured = xposedResult.hookConfigured === true;
        const ipcConfigReadyFlag = xposedResult.ipcConfigReady === true;
        const stagedMediaReadyFlag = xposedResult.stagedMediaReady === true;
        const runtimeHookObserved = xposedResult.runtimeHookObserved === true;
        const markerSource = String(
          xposedResult.markerSource ?? ipcStatus?.moduleMarkerSource ?? 'unknown'
        );
        const mappingFix = getMappingQuickFix(mappingStatus.latestZeroReason);

        if (xposedResult.hookReady) {
          result.xposedFramework = {
            label: 'LSPosed / Xposed',
            detail: 'Framework active',
            status: 'ok',
          };

          if (mappingStatus.hasMappingLog && (mappingStatus.latestMappedCount ?? 0) === 0) {
            const reasonSuffix = mappingStatus.latestZeroReason
              ? ` (${mappingStatus.latestZeroReason})`
              : '';
            result.moduleActive = {
              label: 'VirtuCam Module',
              detail: `Hook loaded but mapped=0${reasonSuffix}; ${mappingFix}`,
              status: 'warning',
            };
          } else if (
            mappingStatus.hasMappingLog &&
            typeof mappingStatus.latestMappedCount === 'number' &&
            mappingStatus.latestMappedCount > 0
          ) {
            result.moduleActive = {
              label: 'VirtuCam Module',
              detail: `Hook ready; mapped=${mappingStatus.latestMappedCount}`,
              status: 'ok',
            };
          } else {
            result.moduleActive = {
              label: 'VirtuCam Module',
              detail: `Hook ready (${xposedResult.detectionMethod || 'detected'}, ${markerSource})`,
              status: 'ok',
            };
          }

          if (broadScopeDetected) {
            result.moduleScoped = {
              label: 'Module Scope',
              detail: broadScopePackages
                ? `Broad scope entries detected: ${broadScopePackages}`
                : 'Broad system scope entries detected',
              status: 'warning',
            };
          } else {
            result.moduleScoped = {
              label: 'Module Scope',
              detail: scopeDetail,
              status: xposedResult.moduleScoped ? 'ok' : 'warning',
            };
          }

          let hookConfigStatus: SystemCheckStatus = hookConfigured ? 'ok' : 'warning';
          const hookConfigNotes: string[] = [];
          if (hookConfigured) {
            hookConfigNotes.push('Hook config valid');
          } else {
            hookConfigNotes.push('Enable hook and select media source');
          }
          if (configJsonReady === false) {
            hookConfigStatus = 'warning';
            hookConfigNotes.push(
              companionReady === true
                ? 'Companion ready but config not staged'
                : 'IPC config missing/unreadable'
            );
          }
          if (companionReady === false) {
            hookConfigStatus = 'error';
            hookConfigNotes.push('Companion not ready');
          }
          if (stagedMediaReadable === false) {
            hookConfigStatus = 'error';
            hookConfigNotes.push('Staged media missing/unreadable');
          }
          if (!ipcConfigReadyFlag) {
            hookConfigStatus = 'error';
            hookConfigNotes.push('IPC config not ready');
          }
          if (!stagedMediaReadyFlag) {
            hookConfigStatus = 'error';
            hookConfigNotes.push('Source media file is not readable by hook');
          }
          if (!runtimeHookObserved) {
            hookConfigStatus = hookConfigStatus === 'error' ? 'error' : 'warning';
            hookConfigNotes.push('Runtime hook not yet observed in target process');
          }
          result.hookConfigured = {
            label: 'Hook Configuration',
            detail: hookConfigNotes.join(' - '),
            status: hookConfigStatus,
          };
        } else if (xposedResult.lsposedInstalled) {
          result.xposedFramework = {
            label: 'LSPosed / Xposed',
            detail: 'Framework installed',
            status: 'ok',
          };
          result.moduleActive = {
            label: 'VirtuCam Module',
            detail: moduleLoaded && !hookConfigured
              ? 'Hook engine loaded but disabled by config'
              : moduleLoaded &&
                  hookConfigured &&
                  mappingStatus.hasMappingLog &&
                  (mappingStatus.latestMappedCount ?? 0) === 0
                ? `Hook configured but no mapped surfaces yet; ${mappingFix}`
                : moduleLoaded
                  ? 'Module loaded but not fully ready'
                  : 'Module not loaded in hooked process yet',
            status: 'warning',
          };

          if (broadScopeDetected) {
            result.moduleScoped = {
              label: 'Module Scope',
              detail: broadScopePackages
                ? `Broad scope entries detected: ${broadScopePackages}`
                : 'Broad system scope entries detected',
              status: 'warning',
            };
          } else {
            result.moduleScoped = {
              label: 'Module Scope',
              detail: scopeDetail,
              status: xposedResult.moduleScoped ? 'ok' : 'warning',
            };
          }

          const notes: string[] = [];
          if (hookConfigured) {
            notes.push('Hook config valid');
          } else {
            notes.push(moduleLoaded ? 'Hook engine loaded but disabled by config' : 'Enable hook and select media source');
          }
          if (configJsonReady === false) {
            notes.push(
              companionReady === true
                ? 'Companion ready but config not staged'
                : 'IPC config missing/unreadable'
            );
          }
          if (companionReady === false) {
            notes.push('Companion not ready');
          }
          if (stagedMediaReadable === false) {
            notes.push('Staged media missing/unreadable');
          }
          if (!ipcConfigReadyFlag) {
            notes.push('IPC config not ready');
          }
          if (!stagedMediaReadyFlag) {
            notes.push('Source media file is not readable by hook');
          }
          if (!runtimeHookObserved) {
            notes.push('Runtime hook not yet observed in target process');
          }
          result.hookConfigured = {
            label: 'Hook Configuration',
            detail: notes.join(' - '),
            status: hookConfigured && ipcConfigReadyFlag && stagedMediaReadyFlag
              ? runtimeHookObserved ? 'ok' : 'warning'
              : 'error',
          };
        } else {
          result.xposedFramework = {
            label: 'LSPosed / Xposed',
            detail: 'Not installed',
            status: 'error',
          };
          result.moduleActive = {
            label: 'VirtuCam Module',
            detail: 'Install LSPosed first',
            status: 'error',
          };
          result.moduleScoped = {
            label: 'Module Scope',
            detail: 'Unavailable until LSPosed is installed',
            status: 'error',
          };
          result.hookConfigured = {
            label: 'Hook Configuration',
            detail: 'Unavailable until LSPosed is installed',
            status: 'error',
          };
        }
      } catch {
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
        result.moduleScoped = {
          label: 'Module Scope',
          detail: 'Check failed',
          status: 'error',
        };
        result.hookConfigured = {
          label: 'Hook Configuration',
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
      result.moduleScoped = {
        label: 'Module Scope',
        detail: 'Native module unavailable',
        status: 'error',
      };
      result.hookConfigured = {
        label: 'Hook Configuration',
        detail: 'Native module unavailable',
        status: 'error',
      };
    }

    // Check storage permission with fallback
    if (VirtuCamSettings && VirtuCamSettings.checkStoragePermission) {
      try {
        let storageGranted = await VirtuCamSettings.checkStoragePermission();

        if (!storageGranted && Platform.OS === 'android') {
          try {
            const rnCheck = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
            );
            if (rnCheck) storageGranted = true;
          } catch {
            // silent fallback failure
          }
        }

        if (storageGranted) {
          result.storagePermission = {
            label: 'Storage Permission',
            detail: 'Storage access granted',
            status: 'ok',
          };
        } else {
          result.storagePermission = {
            label: 'Storage Permission',
            detail: 'Grant storage access in Settings',
            status: 'error',
          };
        }
      } catch (err: unknown) {
        getLogger().warn('Storage permission check failed', 'SystemVerification', err);
        result.storagePermission = {
          label: 'Storage Permission',
          detail: 'Permission check failed',
          status: 'error',
        };
      }
    } else {
      if (VirtuCamSettings && VirtuCamSettings.checkAllFilesAccess) {
        try {
          const allFilesGranted = await VirtuCamSettings.checkAllFilesAccess();
          result.storagePermission = {
            label: 'Storage Permission',
            detail: allFilesGranted ? 'All files access granted' : 'Grant storage access',
            status: allFilesGranted ? 'ok' : 'error',
          };
        } catch (err: unknown) {
          getLogger().warn('All files access check failed', 'SystemVerification', err);
          result.storagePermission = {
            label: 'Storage Permission',
            detail: 'Check method unavailable',
            status: 'error',
          };
        }
      } else {
        result.storagePermission = {
          label: 'Storage Permission',
          detail: 'Native module not loaded',
          status: 'error',
        };
      }
    }

    // Check All Files Access (MANAGE_EXTERNAL_STORAGE)
    if (VirtuCamSettings && VirtuCamSettings.checkAllFilesAccess) {
      try {
        const allFilesGranted = await VirtuCamSettings.checkAllFilesAccess();
        if (allFilesGranted) {
          result.allFilesAccess = {
            label: 'All Files Access',
            detail: 'MANAGE_EXTERNAL_STORAGE granted',
            status: 'ok',
          };
        } else {
          result.allFilesAccess = {
            label: 'All Files Access',
            detail: 'Grant all files access',
            status: 'warning',
          };
        }
      } catch {
        result.allFilesAccess = {
          label: 'All Files Access',
          detail: 'Permission check failed',
          status: 'error',
        };
      }
    } else {
      result.allFilesAccess = {
        label: 'All Files Access',
        detail: 'Native module unavailable',
        status: 'error',
      };
    }

    // Check camera permission
    if (Platform.OS === 'android') {
      try {
        const cameraGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        result.cameraPermission = {
          label: 'Camera Permission',
          detail: cameraGranted ? 'Camera access granted' : 'Camera permission required',
          status: cameraGranted ? 'ok' : 'error',
        };
      } catch {
        result.cameraPermission = {
          label: 'Camera Permission',
          detail: 'Check failed',
          status: 'error',
        };
      }
    } else {
      result.cameraPermission = {
        label: 'Camera Permission',
        detail: 'N/A on this platform',
        status: 'ok',
      };
    }

    // Check overlay permission
    if (VirtuCamSettings && VirtuCamSettings.checkOverlayPermission) {
      try {
        const overlayGranted = await VirtuCamSettings.checkOverlayPermission();
        result.overlayPermission = {
          label: 'Overlay Permission',
          detail: overlayGranted ? 'Overlay access granted' : 'Overlay permission not granted',
          status: overlayGranted ? 'ok' : 'warning',
        };
      } catch {
        result.overlayPermission = {
          label: 'Overlay Permission',
          detail: 'Check failed',
          status: 'warning',
        };
      }
    } else {
      result.overlayPermission = {
        label: 'Overlay Permission',
        detail: 'Check method unavailable',
        status: 'warning',
      };
    }
  } catch (err: unknown) {
    getLogger().error('System check error', 'SystemVerification', err);
  }

  result.overallReady = [
    result.rootAccess,
    result.xposedFramework,
    result.moduleActive,
    result.moduleScoped,
    result.hookConfigured,
    result.storagePermission,
    result.cameraPermission,
  ].every(check => check.status === 'ok');

  try {
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result)).catch(() => {});
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

    let rootSolution = 'None';
    let rootVersion = '';
    if (VirtuCamSettings.detectRootSolution) {
      try {
        const rootResult = await VirtuCamSettings.detectRootSolution();
        rootSolution = rootResult.solution || 'None';
        rootVersion = rootResult.version || '';
      } catch (err: unknown) {
        getLogger().warn('Root solution detection failed', 'SystemVerification', err);
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
  } catch (err: unknown) {
    getLogger().error('Failed to get system info', 'SystemVerification', err);
    return null;
  }
}
