/**
 * Shared IPC field normalization utilities.
 * Consolidates camelCase/snake_case field resolution
 * used by SystemVerification, PermissionManager, and ConfigBridge.
 */

type IpcFields = Record<string, unknown>;

/** Resolve a boolean from camelCase or snake_case IPC fields. */
export function ipcBoolean(obj: IpcFields | null | undefined, camel: string, snake: string, fallback: boolean = false): boolean {
  if (!obj) return fallback;
  if (obj[camel] === true || obj[snake] === true) return true;
  if (obj[camel] === false || obj[snake] === false) return false;
  return fallback;
}

/** Resolve a string from camelCase or snake_case IPC fields. */
export function ipcString(obj: IpcFields | null | undefined, camel: string, snake: string, fallback: string = ''): string {
  if (!obj) return fallback;
  const val = obj[camel] ?? obj[snake];
  if (typeof val === 'string') return val.trim();
  return fallback;
}

/** Resolve a number from camelCase or snake_case IPC fields. */
export function ipcNumber(obj: IpcFields | null | undefined, camel: string, snake: string, fallback: number = 0): number {
  if (!obj) return fallback;
  const val = Number(obj[camel] ?? obj[snake] ?? fallback);
  return Number.isFinite(val) ? val : fallback;
}

/** Normalize a raw state string (trim + lowercase). */
export function normalizeState(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}
