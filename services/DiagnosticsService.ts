/**
 * Lightweight diagnostics stub — replaces the original 923-line DiagnosticsService.
 * The full diagnostic runner was removed during the zero-lag optimization cleanup.
 * Settings screen uses these types/functions for backward compatibility.
 */

export type DiagnosticCheckResult = {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  description: string;
  detail?: string;
};

export type DiagnosticsReport = {
  checks: DiagnosticCheckResult[];
  passCount: number;
  failCount: number;
  warnCount: number;
  timestamp: number;
};

export type RawXposedDebugInfo = {
  hookStatus?: string;
  mappingLog?: string;
  configSnapshot?: string;
  error?: string;
};

export async function runDiagnostics(
  _onProgress?: (check: DiagnosticCheckResult, index: number) => void
): Promise<DiagnosticsReport> {
  return {
    checks: [],
    passCount: 0,
    failCount: 0,
    warnCount: 0,
    timestamp: Date.now(),
  };
}

export async function getRawXposedDebugInfo(): Promise<RawXposedDebugInfo> {
  return { hookStatus: 'stub', error: 'Full diagnostics removed — use adb logcat' };
}
