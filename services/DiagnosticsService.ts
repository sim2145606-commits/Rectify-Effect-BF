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
  markerSource?: string;
  scopeEvaluationReason?: string;
  lsposedPath?: string;
  configuredTargets?: string;
  scopedTargets?: string;
  configuredTargetsCount?: number;
  scopedTargetsCount?: number;
  broadScopeDetected?: boolean;
  broadScopePackages?: string;
  ipcConfigReady?: boolean;
  stagedMediaReady?: boolean;
  runtimeHookObserved?: boolean;
  markerRequired?: boolean;
  runtimeObservedAt?: number;
  mappingFailureReason?: string;
};

type IpcStatusResult = {
  ipcRootExists?: boolean;
  configJsonExists?: boolean;
  configJsonReadable?: boolean;
  configXmlExists?: boolean;
  configXmlReadable?: boolean;
  mediaDirExists?: boolean;
  moduleMarkerExists?: boolean;
  moduleMarkerExistsIpc?: boolean;
  moduleMarkerExistsLegacy?: boolean;
  moduleMarkerSource?: string;
  companionStatus?: string;
  configStatus?: string;
  markerStatus?: string;
  runtimeStatus?: string;
  stateReadSource?: string;
  companionVersion?: string;
  prefsPathResolved?: string;
  configStaged?: boolean;
  stagedMediaPath?: string;
  stagedMediaExists?: boolean;
  stagedMediaReadable?: boolean;
  stagedMediaHookReadable?: boolean;
};

type MappingLogStatus = {
  source: string;
  hasMappingLog: boolean;
  latestMappedCount: number | null;
  sawZeroMapping: boolean;
  sawPositiveMapping: boolean;
  latestZeroReason: string | null;
  latestFailureReason: string | null;
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
  markerSource: string;
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
  ipcConfigReady: boolean;
  stagedMediaReady: boolean;
  runtimeHookObserved: boolean;
  markerRequired: boolean;
  runtimeObservedAt: number;
  mappingFailureReason: string;
  mappingLogSource: string;
  latestMappedCount: number | null;
  latestZeroReason: string;
  mappingHint: string;
  quickFixHint: string;
};

function parseMappingLogStatus(logs: string, source: string): MappingLogStatus {
  if (!logs) {
    return {
      source,
      hasMappingLog: false,
      latestMappedCount: null,
      sawZeroMapping: false,
      sawPositiveMapping: false,
      latestZeroReason: null,
      latestFailureReason: null,
    };
  }

  const lines = logs.split(/\r?\n/);
  let latestMappedCount: number | null = null;
  let sawZeroMapping = false;
  let sawPositiveMapping = false;
  let latestZeroReason: string | null = null;
  let latestFailureReason: string | null = null;

  for (const line of lines) {
    if (line.includes('NoSuchMethodError: android.hardware.camera2.params.OutputConfiguration#setSurface')) {
      latestFailureReason = 'output_configuration_setsurface_missing';
    } else if (line.includes('failed to set mapped surface; rolled back')) {
      latestFailureReason = 'mapped_surface_mutation_failed';
    }

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
    source,
    hasMappingLog: latestMappedCount !== null,
    latestMappedCount,
    sawZeroMapping,
    sawPositiveMapping,
    latestZeroReason,
    latestFailureReason,
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

function getMappingQuickFixHint(reason: string | null): string {
  const normalized = String(reason ?? '').toLowerCase();
  if (normalized.includes('enabled=false')) {
    return 'Quick fix: enable Hook Enabled and trigger sync from the dashboard.';
  }
  if (normalized.includes('targeted=false')) {
    return 'Quick fix: add this package to LSPosed scope or adjust target mode.';
  }
  if (normalized.includes('hasmedia=false')) {
    return 'Quick fix: select media in Studio and keep source mode set to file.';
  }
  if (normalized.includes('sourcemode=black')) {
    return 'Quick fix: switch source mode from black to file or test.';
  }
  return 'Quick fix: open a scoped camera app, then rerun diagnostics.';
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
        source: 'unavailable',
        hasMappingLog: false,
        latestMappedCount: null,
        sawZeroMapping: false,
        sawPositiveMapping: false,
        latestZeroReason: null,
        latestFailureReason: null,
      };
    }
    const logsResult = (await VirtuCamSettings.getXposedLogs()) as { logs?: string; source?: string };
    const source = String(logsResult?.source ?? 'unknown');
    return parseMappingLogStatus(String(logsResult?.logs ?? ''), source);
  } catch {
    return {
      source: 'error',
      hasMappingLog: false,
      latestMappedCount: null,
      sawZeroMapping: false,
      sawPositiveMapping: false,
      latestZeroReason: null,
      latestFailureReason: null,
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
    const moduleLoaded = xposedStatus.moduleLoaded === true;
    const hookConfigured = xposedStatus.hookConfigured === true;
    const ipcConfigReady = xposedStatus.ipcConfigReady === true;
    const stagedMediaReady = xposedStatus.stagedMediaReady === true;
    const runtimeHookObserved = xposedStatus.runtimeHookObserved === true;
    const mappingFailureReason = String(xposedStatus.mappingFailureReason ?? '').trim();
    const scopeHint = readScopeMismatchHint(String(xposedStatus.scopeEvaluationReason ?? ''));
    let detailStatus: 'pass' | 'warn' | 'fail' = ready ? 'pass' : 'fail';
    let baseDetail = ready
      ? 'Hook pipeline is ready'
      : 'Hook not fully ready (load/scope/config issue)';

    if (!ready && moduleLoaded && !hookConfigured) {
      detailStatus = 'warn';
      baseDetail = 'Hook engine loaded but disabled by config';
    } else if (!ready && moduleLoaded && hookConfigured && !ipcConfigReady) {
      detailStatus = 'fail';
      baseDetail = 'Hook config exists but IPC config is not readable';
    } else if (!ready && moduleLoaded && hookConfigured && !stagedMediaReady) {
      detailStatus = 'fail';
      baseDetail = 'Hook config exists but staged media is not readable';
    } else if (!ready && moduleLoaded && hookConfigured && !runtimeHookObserved) {
      detailStatus = 'warn';
      baseDetail = 'Config is ready but runtime hook has not been observed yet';
    } else if (
      !ready &&
      hookConfigured &&
      mappingFailureReason === 'output_configuration_setsurface_missing'
    ) {
      detailStatus = 'fail';
      baseDetail = 'OutputConfiguration mutation is unsupported on this camera stack';
    } else if (!ready && hookConfigured && mappingFailureReason.length > 0) {
      detailStatus = 'warn';
      baseDetail = `Mapping pipeline reported runtime error (${mappingFailureReason})`;
    } else if (
      !ready &&
      hookConfigured &&
      mappingStatus.hasMappingLog &&
      (mappingStatus.latestMappedCount ?? 0) === 0
    ) {
      detailStatus = 'warn';
      baseDetail = 'Hook configured but no mapped surfaces yet';
    }

    pushCheck({
      name: 'Hook Ready',
      description: 'Module loaded + scoped + configured',
      status: detailStatus,
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
    const runtimeState = String(ipcStatus.runtimeStatus ?? '').trim().toLowerCase();
    const stateReadSource = String(ipcStatus.stateReadSource ?? '').trim().toLowerCase();
    const readSourceHint =
      stateReadSource === 'root_read' ? ' (state read via root fallback)' : '';
    const companionVersion = String(ipcStatus.companionVersion ?? '').trim();
    const configReady =
      (ipcStatus.configJsonExists === true && ipcStatus.configJsonReadable === true) ||
      String(ipcStatus.configStatus ?? '').trim().toLowerCase() === 'config_ready';
    if (companionState === 'ready') {
      pushCheck({
        name: 'Companion Status',
        description: '/dev/virtucam_ipc/state/companion_status',
        status: configReady ? 'pass' : 'fail',
        detail: configReady
          ? `Companion ready${readSourceHint}${companionVersion ? ` (${companionVersion})` : ''}`
          : `Companion ready but config not staged${readSourceHint}`,
      });
    } else if (companionState === 'waiting_runtime') {
      pushCheck({
        name: 'Companion Status',
        description: '/dev/virtucam_ipc/state/companion_status',
        status: 'warn',
        detail:
          runtimeState === 'runtime_observed'
            ? `Companion waiting state is stale; runtime hook is already observed${readSourceHint}`
            : `Companion config/scope ready; waiting for first runtime hook observation${readSourceHint}`,
      });
    } else if (companionState === 'marker_missing' && runtimeState === 'runtime_observed') {
      pushCheck({
        name: 'Companion Status',
        description: '/dev/virtucam_ipc/state/companion_status',
        status: 'warn',
        detail: `Marker missing, but runtime hook was observed in LSPosed logs${readSourceHint}`,
      });
    } else if (!companionState) {
      pushCheck({
        name: 'Companion Status',
        description: '/dev/virtucam_ipc/state/companion_status',
        status: 'fail',
        detail: `Companion status file missing/empty${readSourceHint}`,
      });
    } else {
      pushCheck({
        name: 'Companion Status',
        description: '/dev/virtucam_ipc/state/companion_status',
        status: 'fail',
        detail: `Companion state: ${companionState}${readSourceHint}`,
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
    const stateReadSource = String(ipcStatus.stateReadSource ?? '').trim().toLowerCase();
    const readSourceHint =
      stateReadSource === 'root_read' ? ' (state read via root fallback)' : '';
    pushCheck({
      name: 'IPC Config',
      description: '/dev/virtucam_ipc/config/virtucam_config.json',
      status: 'pass',
      detail: `Config JSON exists and is readable${readSourceHint}`,
    });
  } else if (String(ipcStatus.configStatus ?? '').trim().toLowerCase() === 'config_ready') {
    const stateReadSource = String(ipcStatus.stateReadSource ?? '').trim().toLowerCase();
    const readSourceHint =
      stateReadSource === 'root_read' ? ' (state read via root fallback)' : '';
    pushCheck({
      name: 'IPC Config',
      description: '/dev/virtucam_ipc/config/virtucam_config.json',
      status: 'pass',
      detail: `Companion reports config_ready even though JSON is not app-readable${readSourceHint}`,
    });
  } else {
    const companionState = String(ipcStatus.companionStatus ?? '').trim().toLowerCase();
    pushCheck({
      name: 'IPC Config',
      description: '/dev/virtucam_ipc/config/virtucam_config.json',
      status: 'fail',
      detail:
        companionState === 'ready'
          ? 'Companion ready but IPC config is missing/unreadable'
          : 'Config JSON missing or unreadable',
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
    const stagedHookReadable = ipcStatus.stagedMediaHookReadable === true;
    if (!stagedPath) {
      pushCheck({
        name: 'Staged Media',
        description: '/dev/virtucam_ipc/media/*',
        status: 'warn',
        detail: 'No staged media selected yet',
      });
    } else if (stagedHookReadable) {
      pushCheck({
        name: 'Staged Media',
        description: '/dev/virtucam_ipc/media/*',
        status: 'pass',
        detail: `Staged media is hook-readable: ${stagedPath}`,
      });
    } else if (ipcStatus.stagedMediaExists && ipcStatus.stagedMediaReadable) {
      pushCheck({
        name: 'Staged Media',
        description: '/dev/virtucam_ipc/media/*',
        status: 'fail',
        detail: `Media is app-readable but not hook-readable: ${stagedPath}`,
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
      detail: `No mapping log yet in ${mappingStatus.source} - open a scoped target camera app and retry`,
    });
  } else if (mappingStatus.latestFailureReason === 'output_configuration_setsurface_missing') {
    pushCheck({
      name: 'Camera Mapping',
      description: 'createCaptureSession... mapped=<n>',
      status: 'fail',
      detail:
        'Session output mutation failed (OutputConfiguration#setSurface unavailable). Compatibility fallback is required.',
    });
  } else if (mappingStatus.latestFailureReason === 'mapped_surface_mutation_failed') {
    pushCheck({
      name: 'Camera Mapping',
      description: 'createCaptureSession... mapped=<n>',
      status: 'warn',
      detail: 'Surface mutation failed in runtime logs; fallback path may still be initializing.',
    });
  } else if ((mappingStatus.latestMappedCount ?? 0) > 0 || mappingStatus.sawPositiveMapping) {
    pushCheck({
      name: 'Camera Mapping',
      description: 'createCaptureSession... mapped=<n>',
      status: 'pass',
      detail: `Mapped surfaces detected (latest=${mappingStatus.latestMappedCount ?? 0}, source=${mappingStatus.source})`,
    });
  } else {
    const reasonRaw = mappingStatus.latestZeroReason ?? '';
    const reason = reasonRaw ? ` Reason: ${reasonRaw}.` : '';
    const disabledByConfig = reasonRaw.toLowerCase().includes('enabled=false');
    const quickFix = getMappingQuickFixHint(reasonRaw);
    pushCheck({
      name: 'Camera Mapping',
      description: 'createCaptureSession... mapped=<n>',
      status: disabledByConfig ? 'warn' : 'fail',
      detail: disabledByConfig
        ? `Mapped=0 because hook config is disabled.${reason} ${quickFix}`
        : `Mapped count is zero; hook loaded but camera outputs are not being replaced.${reason} ${quickFix}`,
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
    const mappingFailureReason = String(xposedStatus.mappingFailureReason ?? '').trim();
    const quickFixHint = getMappingQuickFixHint(mappingStatus.latestZeroReason);
    const mappingHint =
      mappingFailureReason === 'output_configuration_setsurface_missing'
        ? 'OutputConfiguration#setSurface is unavailable; compatibility fallback needed'
        : !mappingStatus.hasMappingLog
          ? `No mapping logs yet in ${mappingStatus.source}; open a scoped target camera app`
          : (mappingStatus.latestMappedCount ?? 0) > 0
            ? `Mapped surfaces active (latest=${mappingStatus.latestMappedCount ?? 0})`
            : `Mapped=0. ${
                mappingStatus.latestZeroReason
                  ? `Reason: ${mappingStatus.latestZeroReason}`
                  : 'Likely scope/config/surface classification mismatch'
              }`;

    return {
      detectionMethod: String(xposedStatus.detectionMethod ?? 'unknown'),
      markerSource: String(xposedStatus.markerSource ?? 'unknown'),
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
      ipcConfigReady: xposedStatus.ipcConfigReady === true,
      stagedMediaReady: xposedStatus.stagedMediaReady === true,
      runtimeHookObserved: xposedStatus.runtimeHookObserved === true,
      markerRequired: xposedStatus.markerRequired === true,
      runtimeObservedAt:
        typeof xposedStatus.runtimeObservedAt === 'number' ? xposedStatus.runtimeObservedAt : 0,
      mappingFailureReason,
      mappingLogSource: mappingStatus.source,
      latestMappedCount: mappingStatus.latestMappedCount,
      latestZeroReason: String(mappingStatus.latestZeroReason ?? ''),
      mappingHint,
      quickFixHint,
    };
  } catch {
    return null;
  }
}
