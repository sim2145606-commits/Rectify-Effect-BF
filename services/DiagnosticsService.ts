import { PermissionsAndroid, Platform, NativeModules } from 'react-native';

const { VirtuCamSettings } = NativeModules;

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

export async function runDiagnostics(
  onProgress?: (check: DiagnosticCheckResult, index: number) => void
): Promise<DiagnosticsReport> {
  const checks: DiagnosticCheckResult[] = [];

  // 1. Camera Permission
  try {
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    const result: DiagnosticCheckResult = {
      name: 'Camera Permission',
      description: 'android.permission.CAMERA',
      status: granted ? 'pass' : 'fail',
      detail: granted ? 'Granted' : 'Not granted — tap to request',
    };
    checks.push(result);
    onProgress?.(result, checks.length - 1);
  } catch {
    const result: DiagnosticCheckResult = {
      name: 'Camera Permission',
      description: 'android.permission.CAMERA',
      status: 'fail',
      detail: 'Check failed — unable to query',
    };
    checks.push(result);
    onProgress?.(result, checks.length - 1);
  }

  // 2. Storage Permission
  try {
    let granted = false;
    if (Platform.OS === 'android' && Number(Platform.Version) >= 30) {
      if (VirtuCamSettings?.checkStoragePermission) {
        granted = VirtuCamSettings.checkStoragePermission();
      }
    } else {
      granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
      );
    }
    const result: DiagnosticCheckResult = {
      name: 'Storage Permission',
      description: 'READ_EXTERNAL_STORAGE',
      status: granted ? 'pass' : 'fail',
      detail: granted ? 'Granted' : 'Not granted',
    };
    checks.push(result);
    onProgress?.(result, checks.length - 1);
  } catch {
    const result: DiagnosticCheckResult = {
      name: 'Storage Permission',
      description: 'READ_EXTERNAL_STORAGE',
      status: 'fail',
      detail: 'Check failed',
    };
    checks.push(result);
    onProgress?.(result, checks.length - 1);
  }

  // 3. All Files Access (MANAGE_EXTERNAL_STORAGE)
  try {
    let granted = false;
    if (VirtuCamSettings?.checkAllFilesAccess) {
      granted = VirtuCamSettings.checkAllFilesAccess();
    }
    const result: DiagnosticCheckResult = {
      name: 'All Files Access',
      description: 'MANAGE_EXTERNAL_STORAGE',
      status: granted ? 'pass' : 'fail',
      detail: granted ? 'Granted' : 'Not granted — required for injection',
    };
    checks.push(result);
    onProgress?.(result, checks.length - 1);
  } catch {
    const result: DiagnosticCheckResult = {
      name: 'All Files Access',
      description: 'MANAGE_EXTERNAL_STORAGE',
      status: 'warn',
      detail: 'Native module unavailable',
    };
    checks.push(result);
    onProgress?.(result, checks.length - 1);
  }

  // 4. Overlay Permission
  try {
    let granted = false;
    if (VirtuCamSettings?.checkOverlayPermission) {
      granted = await VirtuCamSettings.checkOverlayPermission();
    }
    const result: DiagnosticCheckResult = {
      name: 'Overlay Permission',
      description: 'SYSTEM_ALERT_WINDOW',
      status: granted ? 'pass' : 'warn',
      detail: granted ? 'Granted' : 'Not granted — optional for status overlay',
    };
    checks.push(result);
    onProgress?.(result, checks.length - 1);
  } catch {
    const result: DiagnosticCheckResult = {
      name: 'Overlay Permission',
      description: 'SYSTEM_ALERT_WINDOW',
      status: 'warn',
      detail: 'Native module unavailable',
    };
    checks.push(result);
    onProgress?.(result, checks.length - 1);
  }

  // 5. Root Access
  try {
    let granted = false;
    if (VirtuCamSettings?.checkRootAccess) {
      const result = await VirtuCamSettings.checkRootAccess();
      granted = result?.granted === true;
    }
    const r: DiagnosticCheckResult = {
      name: 'Root Access',
      description: 'su binary / Magisk / KernelSU',
      status: granted ? 'pass' : 'fail',
      detail: granted ? 'Root detected' : 'No root — required for hook injection',
    };
    checks.push(r);
    onProgress?.(r, checks.length - 1);
  } catch {
    const r: DiagnosticCheckResult = {
      name: 'Root Access',
      description: 'su binary check',
      status: 'fail',
      detail: 'Check failed',
    };
    checks.push(r);
    onProgress?.(r, checks.length - 1);
  }

  // 6. Xposed Framework
  try {
    let detected = false;
    if (VirtuCamSettings?.checkXposedStatus) {
      const result = await VirtuCamSettings.checkXposedStatus();
      detected = result?.lsposedInstalled === true || result?.xposedActive === true;
    }
    const r: DiagnosticCheckResult = {
      name: 'Xposed Framework',
      description: 'LSPosed / EdXposed / Xposed',
      status: detected ? 'pass' : 'fail',
      detail: detected ? 'Framework detected' : 'Not detected — required for camera hook',
    };
    checks.push(r);
    onProgress?.(r, checks.length - 1);
  } catch {
    const r: DiagnosticCheckResult = {
      name: 'Xposed Framework',
      description: 'Framework detection',
      status: 'fail',
      detail: 'Check failed',
    };
    checks.push(r);
    onProgress?.(r, checks.length - 1);
  }

  // 7. Hook Ready
  try {
    let active = false;
    if (VirtuCamSettings?.checkXposedStatus) {
      const result = await VirtuCamSettings.checkXposedStatus();
      active = result?.hookReady === true;
    }
    const r: DiagnosticCheckResult = {
      name: 'Hook Ready',
      description: 'Module loaded + scoped + configured',
      status: active ? 'pass' : 'fail',
      detail: active ? 'Hook pipeline is ready' : 'Hook not fully ready (load/scope/config issue)',
    };
    checks.push(r);
    onProgress?.(r, checks.length - 1);
  } catch {
    const r: DiagnosticCheckResult = {
      name: 'Hook Ready',
      description: 'Hook pipeline status',
      status: 'fail',
      detail: 'Check failed',
    };
    checks.push(r);
    onProgress?.(r, checks.length - 1);
  }

  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;

  return { checks, passCount, failCount, warnCount, timestamp: Date.now() };
}
