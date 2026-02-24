import { PermissionsAndroid, Platform, NativeModules } from 'react-native';

const { VirtuCamSettings } = NativeModules;

type XposedStatusResult = {
  lsposedInstalled?: boolean;
  xposedActive?: boolean;
  moduleLoaded?: boolean;
  moduleScoped?: boolean;
  hookConfigured?: boolean;
  hookReady?: boolean;
  detectionMethod?: string;
  scopeEvaluationReason?: string;
  lsposedPath?: string;
  configuredTargets?: string;
  scopedTargets?: string;
  configuredTargetsCount?: number;
  scopedTargetsCount?: number;
  broadScopeDetected?: boolean;
  broadScopePackages?: string;
};

type IpcStatusResult = {
  ipcRootExists?: boolean;
  configJsonExists?: boolean;
  configJsonReadable?: boolean;
  configXmlExists?: boolean;
  configXmlReadable?: boolean;
  mediaDirExists?: boolean;
  moduleMarkerExists?: boolean;
  companionStatus?: string;
  stagedMediaPath?: string;
  stagedMediaExists?: boolean;
  stagedMediaReadable?: boolean;
};

type MappingLogStatus = {
  hasMappingLog: boolean;
  latestMappedCount: number | null;
  sawZeroMapping: boolean;
  sawPositiveMapping: boolean;
  latestZeroReason: string | null;
};

export type DiagnosticCheckResult = {
  name: string;
  description: string;
  status: 'pass' | 'fail' | 'warn' | 'checking';
  detail: string;
};

export type DiagnosticsReport = {
  checks: DiagnosticCheckResult[];
  passCount: number;
  failCount: number;
  warnCount: number;
  timestamp: number;
};

export type RawXposedDebugInfo = {
  detectionMethod: string;
  scopeEvaluationReason: string;
  lsposedPath: string;
  configuredTargets: string;
  scopedTargets: string;
  moduleLoaded: boolean;
  moduleScoped: boolean;
  hookConfigured: boolean;
  hookReady: boolean;
  configuredTargetsCount: number;
  scopedTargetsCount: number;
  broadScopeDetected: boolean;
  broadScopePackages: string;
  latestMappedCount: number | null;
  mappingHint: string;
};

function parseMappingLogStatus(logs: string): MappingLogStatus {
  if (!logs) {
    return {
      hasMappingLog: false,
      latestMappedCount: null,
      sawZeroMapping: false,
      sawPositiveMapping: false,
      latestZeroReason: null,
    };
  }

  const lines = logs.split(/\r?\n/);
  let latestMappedCount: number | null = null;
  let sawZeroMapping = false;
  let sawPositiveMapping = false;
  let latestZeroReason: string | null = null;

  for (const line of lines) {
    const mappedMatch = line.match(/mapped=(\d+)/);
    if (!mappedMatch) continue;

    const mapped = Number(mappedMatch[1]);
    if (!Number.isFinite(mapped)) continue;

    latestMappedCount = mapped;
    if (mapped > 0) {
      sawPositiveMapping = true;
      continue;
    }

    sawZeroMapping = true;
    const reasonMatch = line.match(/reason=\{([^}]*)\}/);
    if (reasonMatch && reasonMatch[1]) {
      latestZeroReason = reasonMatch[1];
    }
  }

  return {
    hasMappingLog: latestMappedCount !== null,
    latestMappedCount,
    sawZeroMapping,
    sawPositiveMapping,
    latestZeroReason,
  };
}

function readScopeMismatchHint(scopeReason: string): string {
  switch (scopeReason) {
    case 'whitelist_no_targets_configured':
      return 'Whitelist mode has no local target apps selected.';
    case 'whitelist_targets_not_in_scope':
      return 'Local whitelist apps are not present in LSPosed scope.';
    case 'configured_targets_scoped':
      return 'Local targets are present in LSPosed scope.';
    case 'non_whitelist_mode':
      return 'Non-whitelist mode: LSPosed scope is treated as external authority.';
    default:
      return scopeReason || 'Unknown scope state';
  }
}

async function fetchXposedStatus(): Promise<XposedStatusResult | null> {
  try {
    if (!VirtuCamSettings?.checkXposedStatus) return null;
    return (await VirtuCamSettings.checkXposedStatus()) as XposedStatusResult;
  } catch {
    return null;
  }
}

async function fetchIpcStatus(): Promise<IpcStatusResult | null> {
  try {
    if (!VirtuCamSettings?.getIpcStatus) return null;
    return (await VirtuCamSettings.getIpcStatus()) as IpcStatusResult;
  } catch {
    return null;
  }
}

async function fetchMappingLogStatus(): Promise<MappingLogStatus> {
  try {
    if (!VirtuCamSettings?.getXposedLogs) {
      return {
        hasMappingLog: false,
        latestMappedCount: null,
        sawZeroMapping: false,
        sawPositiveMapping: false,
        latestZeroReason: null,
      };
    }
    const logsResult = (await VirtuCamSettings.getXposedLogs()) as { logs?: string };
    return parseMappingLogStatus(String(logsResult?.logs ?? ''));
  } catch {
    return {
      hasMappingLog: false,
      latestMappedCount: null,
      sawZeroMapping: false,
      sawPositiveMapping: false,
      latestZeroReason: null,
    };
  }
}

export async function runDiagnostics(
  onProgress?: (check: DiagnosticCheckResult, index: number) => void
): Promise<DiagnosticsReport> {
  const checks: DiagnosticCheckResult[] = [];
  const pushCheck = (check: DiagnosticCheckResult) => {
    checks.push(check);
    onProgress?.(check, checks.length - 1);
  };

  // 1. Camera Permission
  try {
    if (Platform.OS !== 'android') {
      pushCheck({
        name: 'Camera Permission',
        description: 'android.permission.CAMERA',
        status: 'pass',
        detail: 'Not required on this platform',
      });
    } else {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      pushCheck({
        name: 'Camera Permission',
        description: 'android.permission.CAMERA',
        status: granted ? 'pass' : 'fail',
        detail: granted ? 'Granted' : 'Not granted - tap to request',
      });
    }
  } catch {
    pushCheck({
      name: 'Camera Permission',
      description: 'android.permission.CAMERA',
      status: 'fail',
      detail: 'Check failed - unable to query',
    });
  }

  // 2. Storage Permission
  try {
    let granted = false;
    if (Platform.OS === 'android' && Number(Platform.Version) >= 30) {
      if (VirtuCamSettings?.checkStoragePermission) {
        granted = Boolean(await VirtuCamSettings.checkStoragePermission());
      }
    } else if (Platform.OS === 'android') {
      granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
      );
    } else {
      granted = true;
    }
    pushCheck({
      name: 'Storage Permission',
      description: 'READ_EXTERNAL_STORAGE / MANAGE_EXTERNAL_STORAGE',
      status: granted ? 'pass' : 'fail',
      detail: granted ? 'Granted' : 'Not granted',
    });
  } catch {
    pushCheck({
      name: 'Storage Permission',
      description: 'READ_EXTERNAL_STORAGE / MANAGE_EXTERNAL_STORAGE',
      status: 'fail',
      detail: 'Check failed',
    });
  }

  // 3. All Files Access (MANAGE_EXTERNAL_STORAGE)
  try {
    let granted = false;
    if (VirtuCamSettings?.checkAllFilesAccess) {
      granted = Boolean(await VirtuCamSettings.checkAllFilesAccess());
    }
    pushCheck({
      name: 'All Files Access',
      description: 'MANAGE_EXTERNAL_STORAGE',
      status: granted ? 'pass' : 'fail',
      detail: granted ? 'Granted' : 'Not granted - required for injection',
    });
  } catch {
    pushCheck({
      name: 'All Files Access',
      description: 'MANAGE_EXTERNAL_STORAGE',
      status: 'warn',
      detail: 'Native module unavailable',
    });
  }

  // 4. Overlay Permission
  try {
    let granted = false;
    if (VirtuCamSettings?.checkOverlayPermission) {
      granted = Boolean(await VirtuCamSettings.checkOverlayPermission());
    }
    pushCheck({
      name: 'Overlay Permission',
      description: 'SYSTEM_ALERT_WINDOW',
      status: granted ? 'pass' : 'warn',
      detail: granted ? 'Granted' : 'Not granted - optional for status overlay',
    });
  } catch {
    pushCheck({
      name: 'Overlay Permission',
      description: 'SYSTEM_ALERT_WINDOW',
      status: 'warn',
      detail: 'Native module unavailable',
    });
  }

  // 5. Root Access
  try {
    let granted = false;
    if (VirtuCamSettings?.checkRootAccess) {
      const rootResult = await VirtuCamSettings.checkRootAccess();
      granted = rootResult?.granted === true;
    }
    pushCheck({
      name: 'Root Access',
      description: 'su binary / Magisk / KernelSU',
      status: granted ? 'pass' : 'fail',
      detail: granted ? 'Root detected' : 'No root - required for hook injection',
    });
  } catch {
    pushCheck({
      name: 'Root Access',
      description: 'su binary check',
      status: 'fail',
      detail: 'Check failed',
    });
  }

  const xposedStatus = await fetchXposedStatus();
  const ipcStatus = await fetchIpcStatus();
  const mappingStatus = await fetchMappingLogStatus();

  // 6. Xposed Framework
  if (!xposedStatus) {
    pushCheck({
      name: 'Xposed Framework',
      description: 'LSPosed / EdXposed / Xposed',
      status: 'fail',
      detail: 'Framework check unavailable',
    });
  } else {
    const detected =
      xposedStatus.lsposedInstalled === true || xposedStatus.xposedActive === true;
    pushCheck({
      name: 'Xposed Framework',
      description: 'LSPosed / EdXposed / Xposed',
      status: detected ? 'pass' : 'fail',
      detail: detected ? 'Framework detected' : 'Not detected - required for camera hook',
    });
  }

  // 7. Hook Ready
  if (!xposedStatus) {
    pushCheck({
      name: 'Hook Ready',
      description: 'Module loaded + scoped + configured',
      status: 'fail',
      detail: 'Hook status unavailable',
    });
  } else {
    const ready = xposedStatus.hookReady === true;
    const scopeHint = readScopeMismatchHint(String(xposedStatus.scopeEvaluationReason ?? ''));
    const baseDetail = ready
      ? 'Hook pipeline is ready'
      : 'Hook not fully ready (load/scope/config issue)';
    pushCheck({
      name: 'Hook Ready',
      description: 'Module loaded + scoped + configured',
      status: ready ? 'pass' : 'fail',
      detail: `${baseDetail} - ${scopeHint}`,
    });
  }

  // 8. Companion Status
  if (!ipcStatus) {
    pushCheck({
      name: 'Companion Status',
      description: '/dev/virtucam_ipc/state/companion_status',
      status: 'warn',
      detail: 'Companion status unavailable',
    });
  } else {
    const companionState = String(ipcStatus.companionStatus ?? '').trim().toLowerCase();
    if (companionState === 'ready') {
      pushCheck({
        name: 'Companion Status',
        description: '/dev/virtucam_ipc/state/companion_status',
        status: 'pass',
        detail: 'Companion ready',
      });
    } else if (!companionState) {
      pushCheck({
        name: 'Companion Status',
        description: '/dev/virtucam_ipc/state/companion_status',
        status: 'fail',
        detail: 'Companion status file missing/empty',
      });
    } else {
      pushCheck({
        name: 'Companion Status',
        description: '/dev/virtucam_ipc/state/companion_status',
        status: 'warn',
        detail: `Companion state: ${companionState}`,
      });
    }
  }

  // 9. IPC Config Visibility
  if (!ipcStatus) {
    pushCheck({
      name: 'IPC Config',
      description: '/dev/virtucam_ipc/config/virtucam_config.json',
      status: 'warn',
      detail: 'IPC diagnostics unavailable',
    });
  } else if (!ipcStatus.ipcRootExists) {
    pushCheck({
      name: 'IPC Config',
      description: '/dev/virtucam_ipc/config/virtucam_config.json',
      status: 'fail',
      detail: 'IPC root missing - companion module likely not active',
    });
  } else if (ipcStatus.configJsonExists && ipcStatus.configJsonReadable) {
    pushCheck({
      name: 'IPC Config',
      description: '/dev/virtucam_ipc/config/virtucam_config.json',
      status: 'pass',
      detail: 'Config JSON exists and is readable',
    });
  } else {
    pushCheck({
      name: 'IPC Config',
      description: '/dev/virtucam_ipc/config/virtucam_config.json',
      status: 'fail',
      detail: 'Config JSON missing or unreadable',
    });
  }

  // 10. Staged Media Readability
  if (!ipcStatus) {
    pushCheck({
      name: 'Staged Media',
      description: '/dev/virtucam_ipc/media/*',
      status: 'warn',
      detail: 'Staged media status unavailable',
    });
  } else {
    const stagedPath = String(ipcStatus.stagedMediaPath ?? '').trim();
    if (!stagedPath) {
      pushCheck({
        name: 'Staged Media',
        description: '/dev/virtucam_ipc/media/*',
        status: 'warn',
        detail: 'No staged media selected yet',
      });
    } else if (ipcStatus.stagedMediaExists && ipcStatus.stagedMediaReadable) {
      pushCheck({
        name: 'Staged Media',
        description: '/dev/virtucam_ipc/media/*',
        status: 'pass',
        detail: `Staged media readable: ${stagedPath}`,
      });
    } else {
      pushCheck({
        name: 'Staged Media',
        description: '/dev/virtucam_ipc/media/*',
        status: 'fail',
        detail: `Selected staged media path is missing or unreadable: ${stagedPath}`,
      });
    }
  }

  // 11. Camera Mapping Activity
  if (!mappingStatus.hasMappingLog) {
    pushCheck({
      name: 'Camera Mapping',
      description: 'createCaptureSession... mapped=<n>',
      status: 'warn',
      detail: 'No mapping log yet - open a scoped target camera app and retry',
    });
  } else if ((mappingStatus.latestMappedCount ?? 0) > 0 || mappingStatus.sawPositiveMapping) {
    pushCheck({
      name: 'Camera Mapping',
      description: 'createCaptureSession... mapped=<n>',
      status: 'pass',
      detail: `Mapped surfaces detected (latest=${mappingStatus.latestMappedCount ?? 0})`,
    });
  } else {
    const reason = mappingStatus.latestZeroReason
      ? ` Reason: ${mappingStatus.latestZeroReason}.`
      : '';
    pushCheck({
      name: 'Camera Mapping',
      description: 'createCaptureSession... mapped=<n>',
      status: 'fail',
      detail: `Mapped count is zero; hook loaded but camera outputs are not being replaced.${reason}`,
    });
  }

  // 12. LSPosed Scope Performance Safety
  if (xposedStatus?.broadScopeDetected) {
    const broadPackages = String(xposedStatus.broadScopePackages ?? '').trim();
    pushCheck({
      name: 'Scope Performance',
      description: 'Broad system entries in LSPosed scope',
      status: 'warn',
      detail: broadPackages
        ? `Broad scope entries detected: ${broadPackages}`
        : 'Broad scope entries detected; remove system-wide targets to reduce lag',
    });
  } else {
    pushCheck({
      name: 'Scope Performance',
      description: 'Broad system entries in LSPosed scope',
      status: 'pass',
      detail: 'No broad system scope entries detected',
    });
  }

  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;

  return { checks, passCount, failCount, warnCount, timestamp: Date.now() };
}

export async function getRawXposedDebugInfo(): Promise<RawXposedDebugInfo | null> {
  try {
    const xposedStatus = await fetchXposedStatus();
    if (!xposedStatus) return null;

    const mappingStatus = await fetchMappingLogStatus();
    const mappingHint = !mappingStatus.hasMappingLog
      ? 'No mapping logs yet; open a scoped target camera app'
      : (mappingStatus.latestMappedCount ?? 0) > 0
        ? `Mapped surfaces active (latest=${mappingStatus.latestMappedCount ?? 0})`
        : `Mapped=0. ${
            mappingStatus.latestZeroReason
              ? `Reason: ${mappingStatus.latestZeroReason}`
              : 'Likely scope/config/surface classification mismatch'
          }`;

    return {
      detectionMethod: String(xposedStatus.detectionMethod ?? 'unknown'),
      scopeEvaluationReason: String(xposedStatus.scopeEvaluationReason ?? 'unknown'),
      lsposedPath: String(xposedStatus.lsposedPath ?? ''),
      configuredTargets: String(xposedStatus.configuredTargets ?? ''),
      scopedTargets: String(xposedStatus.scopedTargets ?? ''),
      moduleLoaded: xposedStatus.moduleLoaded === true,
      moduleScoped: xposedStatus.moduleScoped === true,
      hookConfigured: xposedStatus.hookConfigured === true,
      hookReady: xposedStatus.hookReady === true,
      configuredTargetsCount:
        typeof xposedStatus.configuredTargetsCount === 'number'
          ? xposedStatus.configuredTargetsCount
          : 0,
      scopedTargetsCount:
        typeof xposedStatus.scopedTargetsCount === 'number' ? xposedStatus.scopedTargetsCount : 0,
      broadScopeDetected: xposedStatus.broadScopeDetected === true,
      broadScopePackages: String(xposedStatus.broadScopePackages ?? ''),
      latestMappedCount: mappingStatus.latestMappedCount,
      mappingHint,
    };
  } catch {
    return null;
  }
}
