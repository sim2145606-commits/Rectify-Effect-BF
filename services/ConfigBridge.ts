import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';
import { logger } from './LogService';

const { VirtuCamSettings } = NativeModules;

export type CameraTarget = 'front' | 'back' | 'both' | 'none';
export type MediaSourceType = 'file' | 'stream';
export type SourceMode = 'black' | 'file' | 'stream' | 'test';
export type BridgeSyncFailureCode =
  | 'native_unavailable'
  | 'unauthorized'
  | 'write_failed'
  | 'ipc_unready';

export type BridgeWriteWarningCode =
  | 'prefs_epoch_mismatch'
  | 'companion_refresh_deferred'
  | 'ipc_mirror_write_failed';
export type BridgeSyncState = {
  ok: boolean;
  code: BridgeSyncFailureCode | null;
  message: string;
  timestamp: number;
  attempts: number;
  warningCode?: BridgeWriteWarningCode | null;
  inFlight?: boolean;
  queuedWrites?: number;
  lastAppliedHash?: string;
  lastWriteAt?: number;
};


type StoredTargetApp = { enabled: boolean; packageName: string };

type BridgeSyncListener = (state: BridgeSyncState) => void;
type NativeWriteConfigResult = {
  prefsWritten?: boolean;
  prefsCommitted?: boolean;
  prefsEpochMatched?: boolean;
  ipcJsonWritten?: boolean;
  persistentFallbackWritten?: boolean;
  companionRefreshScheduled?: boolean;
  prefsPathResolved?: string;
  warningCode?: string | null;
  errorCode?: string | null;
};

type BridgeWriteWaiter = {
  resolve: () => void;
  reject: (error: Error & { bridgeCode?: BridgeSyncFailureCode }) => void;
};

const bridgeSyncListeners = new Set<BridgeSyncListener>();
let latestBridgeSyncState: BridgeSyncState = {
  ok: true,
  code: null,
  message: 'Waiting for first sync',
  timestamp: 0,
  attempts: 0,
  warningCode: null,
  inFlight: false,
  queuedWrites: 0,
  lastAppliedHash: '',
  lastWriteAt: 0,
};
let syncAllInFlight: Promise<void> | null = null;
let lastSyncCompletedAt = 0;
const MIN_SYNC_INTERVAL_MS = 500;
let queuedWritePatch: Partial<BridgeConfig> = {};
let queuedWriteWaiters: BridgeWriteWaiter[] = [];
let writeQueueInFlight: Promise<void> | null = null;
let writeQueueRunning = false;
let bridgeInFlight = false;
let bridgeLastAppliedHash = '';
let bridgeLastWriteAt = 0;
let bridgeLastWarning: BridgeWriteWarningCode | null = null;

function parseStoredJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return (raw as unknown as T) ?? fallback;
  }
}

function parseStoredBoolean(raw: string | null, fallback: boolean): boolean {
  const parsed = parseStoredJson<unknown>(raw, fallback);
  if (typeof parsed === 'boolean') return parsed;
  if (typeof parsed === 'string') {
    const normalized = parsed.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function parseStoredNumber(raw: string | null, fallback: number): number {
  const parsed = parseStoredJson<unknown>(raw, fallback);
  if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed;
  if (typeof parsed === 'string') {
    const num = Number(parsed);
    if (Number.isFinite(num)) return num;
  }
  return fallback;
}

function parseStoredString(raw: string | null, fallback: string | null): string | null {
  const parsed = parseStoredJson<unknown>(raw, fallback);
  if (parsed === null || parsed === undefined) return fallback;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return fallback;
    return trimmed;
  }
  return fallback;
}

function isLikelyPrivateMediaPath(path: string | null): boolean {
  if (!path) return false;
  const normalized = path.replace(/\\/g, '/');
  return normalized.startsWith('/data/user/') || normalized.startsWith('/data/data/');
}

function safeParseTargetApps(targetAppsRaw: string | null): StoredTargetApp[] {
  if (!targetAppsRaw) return [];

  try {
    const parsedCandidate = parseStoredJson<unknown>(targetAppsRaw, []);
    const parsed =
      typeof parsedCandidate === 'string'
        ? parseStoredJson<unknown>(parsedCandidate, [])
        : parsedCandidate;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((app: unknown): app is StoredTargetApp => {
        if (!app || typeof app !== 'object') return false;
        const candidate = app as Partial<StoredTargetApp>;
        return typeof candidate.enabled === 'boolean' && typeof candidate.packageName === 'string';
      })
      .map(app => ({ enabled: app.enabled, packageName: app.packageName }));
  } catch (err: unknown) {
    logger.warn('Failed to parse target app list; using empty list', 'ConfigBridge', err);
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createBridgeError(
  message: string,
  code: BridgeSyncFailureCode
): Error & { bridgeCode?: BridgeSyncFailureCode } {
  const error = new Error(message) as Error & { bridgeCode?: BridgeSyncFailureCode };
  error.bridgeCode = code;
  (error as Error & { code?: string }).code = code;
  return error;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? 'Unknown error');
}

function normalizeBridgeError(err: unknown): { code: BridgeSyncFailureCode; message: string } {
  const message = getErrorMessage(err);
  const bridgeCode =
    typeof err === 'object' &&
    err !== null &&
    'bridgeCode' in err &&
    typeof (err as { bridgeCode?: unknown }).bridgeCode === 'string'
      ? (err as { bridgeCode: BridgeSyncFailureCode }).bridgeCode
      : null;
  if (bridgeCode) {
    return { code: bridgeCode, message };
  }
  const nativeCode =
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
      ? String((err as { code: string }).code)
      : '';

  if (!VirtuCamSettings || nativeCode === 'NOT_INITIALIZED') {
    return { code: 'native_unavailable', message: 'VirtuCamSettings native module not available' };
  }
  if (nativeCode === 'UNAUTHORIZED') {
    return { code: 'unauthorized', message: 'Native bridge rejected call (UNAUTHORIZED)' };
  }
  if (
    nativeCode === 'CONFIG_SYNC_FAILED' ||
    nativeCode === 'COMPANION_REFRESH_ERROR' ||
    nativeCode === 'IPC_STATUS_ERROR' ||
    nativeCode.startsWith('IPC_')
  ) {
    return { code: 'ipc_unready', message };
  }
  if (
    nativeCode === 'PREFS_WRITE_FAILED' ||
    nativeCode === 'PREFS_COMMIT_FALSE' ||
    nativeCode === 'WRITE_ERROR'
  ) {
    return { code: 'write_failed', message };
  }
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('ipc') || lowerMessage.includes('companion')) {
    return { code: 'ipc_unready', message };
  }

  return { code: 'write_failed', message };
}

function normalizeWarningCode(raw: unknown): BridgeWriteWarningCode | null {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'prefs_epoch_mismatch' ||
    normalized === 'prefs_unconfirmed' ||
    normalized === 'prefs_commit_unconfirmed'
  ) {
    return 'prefs_epoch_mismatch';
  }
  if (
    normalized === 'companion_refresh_deferred' ||
    normalized === 'companion_refresh_not_scheduled'
  ) {
    return 'companion_refresh_deferred';
  }
  if (normalized === 'ipc_mirror_write_failed') {
    return 'ipc_mirror_write_failed';
  }
  return null;
}

function toBridgeSyncState(base: BridgeSyncState): BridgeSyncState {
  return {
    ...base,
    warningCode: base.warningCode ?? bridgeLastWarning,
    inFlight: bridgeInFlight,
    queuedWrites: queuedWriteWaiters.length,
    lastAppliedHash: bridgeLastAppliedHash,
    lastWriteAt: bridgeLastWriteAt,
  };
}

function publishBridgeSyncState(state: BridgeSyncState): void {
  latestBridgeSyncState = toBridgeSyncState(state);
  bridgeSyncListeners.forEach(listener => {
    try {
      listener(latestBridgeSyncState);
    } catch (err: unknown) {
      logger.warn('Bridge sync listener threw', 'ConfigBridge', err);
    }
  });
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`).join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  return serialized ?? 'null';
}

function buildPayloadHash(payload: Record<string, unknown>): string {
  return stableSerialize(payload);
}

export function subscribeBridgeSyncState(listener: BridgeSyncListener): () => void {
  bridgeSyncListeners.add(listener);
  listener(latestBridgeSyncState);
  return () => {
    bridgeSyncListeners.delete(listener);
  };
}

export function getLatestBridgeSyncState(): BridgeSyncState {
  return toBridgeSyncState(latestBridgeSyncState);
}

async function bumpBridgeVersion(): Promise<number> {
  const versionKey = 'virtucam_config_version';
  const stored = await AsyncStorage.getItem(versionKey);
  const current = stored ? Number.parseInt(stored, 10) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;
  await AsyncStorage.setItem(versionKey, String(next));
  return next;
}

async function verifyIpcReadinessAfterWrite(): Promise<void> {
  if (!VirtuCamSettings?.getIpcStatus) return;

  let ipcStatus: Record<string, unknown> | null = null;
  try {
    ipcStatus = (await VirtuCamSettings.getIpcStatus()) as Record<string, unknown>;
  } catch (err: unknown) {
    throw new Error(`IPC status check failed: ${getErrorMessage(err)}`);
  }

  if (!ipcStatus) return;

  const ipcRootExists = ipcStatus.ipcRootExists === true;
  const companionState = String(ipcStatus.companionStatus ?? '').trim().toLowerCase();
  const configState = String(ipcStatus.configStatus ?? '').trim().toLowerCase();
  const configPrimaryReadable =
    ipcStatus.configPrimaryReadable === true || ipcStatus.config_primary_readable === true;
  const configJsonReady =
    (ipcStatus.configJsonExists === true && ipcStatus.configJsonReadable === true) ||
    configState === 'config_ready';

  if (!ipcRootExists) {
    throw new Error('IPC root missing after bridge write');
  }

  if (!configPrimaryReadable) {
    throw new Error('Primary config is missing/unreadable after bridge write');
  }

  if (!configJsonReady) {
    logger.warn('IPC mirror config is missing/unreadable after bridge write', 'ConfigBridge');
  }

  if (companionState === 'scope_mismatch') {
    throw new Error('IPC companion reports scope mismatch');
  }
}

export type BridgeConfig = {
  enabled: boolean;
  mediaSourcePath: string | null;
  mediaSourceType: MediaSourceType;
  cameraTarget: CameraTarget;
  mirrored: boolean;
  rotation: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  scaleMode: string;
  targetMode: 'all' | 'whitelist' | 'blacklist';
  sourceMode: SourceMode;
  allowBroadScope: boolean;
  vcamCompatibilityMode: boolean;
  targetPackages: string[];
};

function buildWritePayload(config: Partial<BridgeConfig>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(config, 'enabled')) payload.enabled = config.enabled;
  if (Object.prototype.hasOwnProperty.call(config, 'mediaSourcePath'))
    payload.mediaSourcePath = config.mediaSourcePath;
  if (Object.prototype.hasOwnProperty.call(config, 'mediaSourceType'))
    payload.mediaSourceType = config.mediaSourceType;
  if (Object.prototype.hasOwnProperty.call(config, 'cameraTarget'))
    payload.cameraTarget = config.cameraTarget;
  if (Object.prototype.hasOwnProperty.call(config, 'mirrored')) payload.mirrored = config.mirrored;
  if (Object.prototype.hasOwnProperty.call(config, 'rotation')) payload.rotation = config.rotation;
  if (Object.prototype.hasOwnProperty.call(config, 'scaleX')) payload.scaleX = config.scaleX;
  if (Object.prototype.hasOwnProperty.call(config, 'scaleY')) payload.scaleY = config.scaleY;
  if (Object.prototype.hasOwnProperty.call(config, 'offsetX')) payload.offsetX = config.offsetX;
  if (Object.prototype.hasOwnProperty.call(config, 'offsetY')) payload.offsetY = config.offsetY;
  if (Object.prototype.hasOwnProperty.call(config, 'scaleMode')) payload.scaleMode = config.scaleMode;
  if (Object.prototype.hasOwnProperty.call(config, 'targetMode'))
    payload.targetMode = config.targetMode;
  if (Object.prototype.hasOwnProperty.call(config, 'sourceMode')) payload.sourceMode = config.sourceMode;
  if (Object.prototype.hasOwnProperty.call(config, 'allowBroadScope'))
    payload.allowBroadScope = config.allowBroadScope;
  if (Object.prototype.hasOwnProperty.call(config, 'vcamCompatibilityMode'))
    payload.vcamCompatibilityMode = config.vcamCompatibilityMode;
  if (Object.prototype.hasOwnProperty.call(config, 'targetPackages'))
    payload.targetPackages = config.targetPackages;
  return payload;
}

function mergeWritePatch(
  base: Partial<BridgeConfig>,
  patch: Partial<BridgeConfig>
): Partial<BridgeConfig> {
  return {
    ...base,
    ...patch,
  };
}

async function performNativeWrite(payload: Record<string, unknown>): Promise<BridgeWriteWarningCode | null> {
  const nativeResult =
    (await VirtuCamSettings.writeConfig(payload)) as boolean | NativeWriteConfigResult;

  if (typeof nativeResult === 'object' && nativeResult !== null) {
    const prefsCommitted =
      nativeResult.prefsCommitted ?? nativeResult.prefsWritten ?? true;
    const prefsEpochMatched = nativeResult.prefsEpochMatched ?? true;
    const ipcJsonWritten = nativeResult.ipcJsonWritten === true;
    const persistentFallbackWritten = nativeResult.persistentFallbackWritten === true;
    const hasDurableConfig = ipcJsonWritten || persistentFallbackWritten;
    const nativeCode = String(nativeResult.errorCode ?? '').trim();

    if (!hasDurableConfig) {
      throw createBridgeError(
        nativeCode.length > 0
          ? `Native write incomplete (${nativeCode})`
          : 'Native write incomplete (no durable config)',
        nativeCode.startsWith('IPC_') ? 'ipc_unready' : 'write_failed'
      );
    }

    if (!prefsCommitted) {
      return normalizeWarningCode(nativeResult.warningCode) ?? 'prefs_epoch_mismatch';
    }

    if (!prefsEpochMatched) {
      return normalizeWarningCode(nativeResult.warningCode) ?? 'prefs_epoch_mismatch';
    }

    if (nativeResult.companionRefreshScheduled === false) {
      return normalizeWarningCode(nativeResult.warningCode) ?? 'companion_refresh_deferred';
    }

    return normalizeWarningCode(nativeResult.warningCode);
  }

  if (nativeResult !== true) {
    throw createBridgeError('Native write returned unexpected status', 'write_failed');
  }

  return null;
}

function resolveWriteWaiters(
  waiters: BridgeWriteWaiter[],
  err?: Error & { bridgeCode?: BridgeSyncFailureCode }
): void {
  waiters.forEach(waiter => {
    if (err) {
      waiter.reject(err);
      return;
    }
    waiter.resolve();
  });
}

async function runWriteQueue(): Promise<void> {
  if (writeQueueRunning) return;
  writeQueueRunning = true;
  bridgeInFlight = true;
  publishBridgeSyncState({
    ...latestBridgeSyncState,
    timestamp: Date.now(),
    attempts: latestBridgeSyncState.attempts,
  });

  try {
    while (queuedWriteWaiters.length > 0) {
      const patch = queuedWritePatch;
      const payload = buildWritePayload(patch);
      if (Object.keys(payload).length === 0) {
        const waiters = queuedWriteWaiters;
        queuedWriteWaiters = [];
        queuedWritePatch = {};
        resolveWriteWaiters(waiters);
        continue;
      }

      const waiters = queuedWriteWaiters;
      queuedWriteWaiters = [];
      queuedWritePatch = {};

      try {
        const warningCode = await performNativeWrite(payload);
        await bumpBridgeVersion();
        bridgeLastAppliedHash = buildPayloadHash(payload);
        bridgeLastWriteAt = Date.now();
        bridgeLastWarning = warningCode;
        publishBridgeSyncState({
          ok: true,
          code: null,
          message:
            warningCode === 'prefs_epoch_mismatch'
              ? 'Bridge write successful (prefs verification deferred)'
              : warningCode === 'companion_refresh_deferred'
                ? 'Bridge write successful (companion refresh deferred)'
                : warningCode === 'ipc_mirror_write_failed'
                  ? 'Bridge write successful (IPC mirror write failed)'
                : 'Bridge write successful',
          timestamp: Date.now(),
          attempts: 1,
          warningCode,
        });
        resolveWriteWaiters(waiters);
      } catch (err: unknown) {
        const normalized = normalizeBridgeError(err);
        logger.error(`Failed to write config (${normalized.code})`, 'ConfigBridge', err);
        publishBridgeSyncState({
          ok: false,
          code: normalized.code,
          message: normalized.message,
          timestamp: Date.now(),
          attempts: 1,
          warningCode: null,
        });
        resolveWriteWaiters(waiters, createBridgeError(normalized.message, normalized.code));
      }
    }
  } finally {
    bridgeInFlight = false;
    writeQueueRunning = false;
    publishBridgeSyncState({
      ...latestBridgeSyncState,
      timestamp: Date.now(),
      attempts: latestBridgeSyncState.attempts,
    });
  }
}

function ensureWriteQueueRunning(): void {
  if (writeQueueInFlight) return;
  writeQueueInFlight = runWriteQueue().finally(() => {
    writeQueueInFlight = null;
    if (queuedWriteWaiters.length > 0) {
      ensureWriteQueueRunning();
    }
  });
}

/**
 * Write configuration to SharedPreferences (world-readable for Xposed)
 */
export async function writeBridgeConfig(config: Partial<BridgeConfig>): Promise<void> {
  if (!VirtuCamSettings) {
    logger.warn('VirtuCamSettings native module not available', 'ConfigBridge');
    const state: BridgeSyncState = {
      ok: false,
      code: 'native_unavailable',
      message: 'VirtuCamSettings native module not available',
      timestamp: Date.now(),
      attempts: 1,
      warningCode: null,
    };
    publishBridgeSyncState(state);
    throw createBridgeError(state.message, 'native_unavailable');
  }

  const patch = config;
  if (Object.keys(buildWritePayload(patch)).length === 0) return;

  queuedWritePatch = mergeWritePatch(queuedWritePatch, patch);

  const waiterPromise = new Promise<void>((resolve, reject) => {
    queuedWriteWaiters.push({ resolve, reject });
  });
  publishBridgeSyncState({
    ...latestBridgeSyncState,
    timestamp: Date.now(),
    attempts: latestBridgeSyncState.attempts,
  });

  ensureWriteQueueRunning();

  await waiterPromise;
}

/**
 * Read configuration from SharedPreferences
 */
export async function readBridgeConfig(): Promise<BridgeConfig> {
  const defaultConfig: BridgeConfig = {
    enabled: false,
    mediaSourcePath: null,
    mediaSourceType: 'file',
    cameraTarget: 'front',
    mirrored: false,
    rotation: 0,
    scaleX: 1.0,
    scaleY: 1.0,
    offsetX: 0.0,
    offsetY: 0.0,
    scaleMode: 'fit',
    targetMode: 'all',
    sourceMode: 'black',
    allowBroadScope: false,
    vcamCompatibilityMode: false,
    targetPackages: [],
  };

  if (!VirtuCamSettings) {
    logger.warn('VirtuCamSettings native module not available', 'ConfigBridge');
    return defaultConfig;
  }

  try {
    const config = await VirtuCamSettings.readConfig();

    const targetPackages: string[] = config.targetPackages
      ? config.targetPackages.split(',').filter((p: string) => p.length > 0)
      : [];

    return {
      ...defaultConfig,
      ...config,
      scaleX: config.scaleX ?? 1.0,
      scaleY: config.scaleY ?? 1.0,
      offsetX: config.offsetX ?? 0.0,
      offsetY: config.offsetY ?? 0.0,
      targetPackages,
    };
  } catch (err: unknown) {
    logger.error('Failed to read config', 'ConfigBridge', err);
    return defaultConfig;
  }
}

/**
 * Get the path to the SharedPreferences file (for debugging)
 */
export async function getConfigPath(): Promise<string | null> {
  if (!VirtuCamSettings) {
    return null;
  }

  try {
    return await VirtuCamSettings.getConfigPath();
  } catch (err: unknown) {
    logger.error('Failed to get config path', 'ConfigBridge', err);
    return null;
  }
}

/**
 * Sync all settings from AsyncStorage to SharedPreferences
 */
export async function syncAllSettings(force = false): Promise<void> {
  if (syncAllInFlight) {
    return syncAllInFlight;
  }

  if (!force && Date.now() - lastSyncCompletedAt < MIN_SYNC_INTERVAL_MS) {
    return;
  }

  const run = (async () => {
  try {
    const [
      enabled,
      hookMediaPathRaw,
      frontCamera,
      backCamera,
      mirrored,
      rotation,
      scaleX,
      scaleY,
      offsetX,
      offsetY,
      targetModeRaw,
      targetAppsRaw,
      allowBroadScopeRaw,
      vcamCompatibilityModeRaw,
    ] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.HOOK_ENABLED),
      AsyncStorage.getItem(STORAGE_KEYS.HOOK_MEDIA_PATH),
      AsyncStorage.getItem(STORAGE_KEYS.FRONT_CAMERA),
      AsyncStorage.getItem(STORAGE_KEYS.BACK_CAMERA),
      AsyncStorage.getItem(STORAGE_KEYS.MIRRORED),
      AsyncStorage.getItem(STORAGE_KEYS.ROTATION),
      AsyncStorage.getItem(STORAGE_KEYS.SCALE_X),
      AsyncStorage.getItem(STORAGE_KEYS.SCALE_Y),
      AsyncStorage.getItem(STORAGE_KEYS.OFFSET_X),
      AsyncStorage.getItem(STORAGE_KEYS.OFFSET_Y),
      AsyncStorage.getItem(STORAGE_KEYS.TARGET_MODE),
      AsyncStorage.getItem(STORAGE_KEYS.TARGET_APPS),
      AsyncStorage.getItem(STORAGE_KEYS.ALLOW_BROAD_SCOPE),
      AsyncStorage.getItem(STORAGE_KEYS.VCAM_COMPATIBILITY_MODE),
    ]);

    const enabledValue = parseStoredBoolean(enabled, false);
    const parsedMediaPath = parseStoredString(hookMediaPathRaw, null);
    const mediaPath = isLikelyPrivateMediaPath(parsedMediaPath) ? null : parsedMediaPath;
    const front = parseStoredBoolean(frontCamera, true);
    const back = parseStoredBoolean(backCamera, false);
    const mirroredValue = parseStoredBoolean(mirrored, false);
    const rotationValue = parseStoredNumber(rotation, 0);
    const scaleXValue = parseStoredNumber(scaleX, 1.0);
    const scaleYValue = parseStoredNumber(scaleY, 1.0);
    const offsetXValue = parseStoredNumber(offsetX, 0.0);
    const offsetYValue = parseStoredNumber(offsetY, 0.0);
    const allowBroadScopeValue = parseStoredBoolean(allowBroadScopeRaw, false);
    const vcamCompatibilityModeValue = parseStoredBoolean(vcamCompatibilityModeRaw, false);

    let cameraTarget: CameraTarget = 'none';
    if (front && back) {
      cameraTarget = 'both';
    } else if (front) {
      cameraTarget = 'front';
    } else if (back) {
      cameraTarget = 'back';
    }

    const storedApps = safeParseTargetApps(targetAppsRaw);
    const enabledPackages = storedApps
      .filter(app => app.enabled)
      .map(app => app.packageName);

    const parsedTargetMode = parseStoredString(targetModeRaw, 'all');
    let effectiveTargetMode: 'all' | 'whitelist' | 'blacklist' =
      parsedTargetMode === 'all' || parsedTargetMode === 'whitelist' || parsedTargetMode === 'blacklist'
        ? parsedTargetMode
        : 'all';

    // Current UI no longer exposes target package management; when no targets are defined,
    // avoid impossible whitelist gating and let LSPosed scope drive targeting.
    if (effectiveTargetMode === 'whitelist' && enabledPackages.length === 0) {
      effectiveTargetMode = 'all';
    }

    const bridgeConfig = await readBridgeConfig();
    const currentSourceMode = bridgeConfig.sourceMode;
    const sourceMode: SourceMode = mediaPath
      ? currentSourceMode === 'stream' || currentSourceMode === 'test'
        ? currentSourceMode
        : 'file'
      : currentSourceMode === 'test'
        ? 'test'
        : 'black';

    const config: Partial<BridgeConfig> = {
      enabled: enabledValue,
      mediaSourcePath: mediaPath,
      cameraTarget,
      mirrored: mirroredValue,
      rotation: rotationValue,
      scaleX: scaleXValue,
      scaleY: scaleYValue,
      offsetX: offsetXValue,
      offsetY: offsetYValue,
      targetMode: effectiveTargetMode,
      sourceMode,
      allowBroadScope: allowBroadScopeValue,
      vcamCompatibilityMode: vcamCompatibilityModeValue,
      targetPackages: enabledPackages,
    };

    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await writeBridgeConfig(config);
        await verifyIpcReadinessAfterWrite();
        publishBridgeSyncState({
          ok: true,
          code: null,
          message: `Bridge sync successful (attempt ${attempt})`,
          timestamp: Date.now(),
          attempts: attempt,
          warningCode: getLatestBridgeSyncState().warningCode ?? null,
        });
        return;
      } catch (err: unknown) {
        lastError = err;
        const normalized = normalizeBridgeError(err);
        const retryable = normalized.code === 'ipc_unready';
        if (retryable && attempt < maxAttempts) {
          logger.warn(
            `Bridge sync attempt ${attempt} failed (${normalized.code}), retrying`,
            'ConfigBridge',
            err
          );
          await sleep(attempt * 300);
          continue;
        }

        publishBridgeSyncState({
          ok: false,
          code: normalized.code,
          message: normalized.message,
          timestamp: Date.now(),
          attempts: attempt,
          warningCode: null,
        });
        logger.error(`Failed to sync settings (${normalized.code})`, 'ConfigBridge', err);
        throw createBridgeError(normalized.message, normalized.code);
      }
    }

    if (lastError) {
      throw lastError;
    }
  } catch (err: unknown) {
    logger.error('Failed to sync settings', 'ConfigBridge', err);
    throw err;
  }
  })();

  syncAllInFlight = run;
  try {
    await run;
    lastSyncCompletedAt = Date.now();
  } finally {
    syncAllInFlight = null;
  }
}

/**
 * Get bridge status (for debugging)
 */
export async function getBridgeStatus(): Promise<{
  available: boolean;
  path: string | null;
  version: number;
  readable: boolean;
  syncState: BridgeSyncState;
}> {
  try {
    const path = await getConfigPath();

    let readable = false;
    if (VirtuCamSettings && VirtuCamSettings.verifyConfigReadable) {
      try {
        const readableStatus = await VirtuCamSettings.verifyConfigReadable();
        readable = readableStatus.readable && readableStatus.exists;
      } catch (err: unknown) {
        logger.warn('Failed to verify config readability', 'ConfigBridge', err);
        readable = false;
      }
    }

    const versionKey = 'virtucam_config_version';
    const stored = await AsyncStorage.getItem(versionKey);
    const version = stored ? parseInt(stored, 10) : 0;

    return {
      available: !!VirtuCamSettings,
      path,
      version,
      readable,
      syncState: getLatestBridgeSyncState(),
    };
  } catch (err: unknown) {
    logger.error('Failed to get bridge status', 'ConfigBridge', err);
    return {
      available: false,
      path: null,
      version: 0,
      readable: false,
      syncState: getLatestBridgeSyncState(),
    };
  }
}

/**
 * Verify that the bridge is working correctly
 */
export async function verifyBridge(): Promise<{
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
}> {
  if (!VirtuCamSettings) {
    return {
      success: false,
      error: 'Native module not available',
    };
  }

  try {
    const originalConfig = await readBridgeConfig();

    const testConfig: Partial<BridgeConfig> = {
      enabled: false,
      cameraTarget: 'front',
    };

    try {
      await writeBridgeConfig(testConfig);
      const readBack = await readBridgeConfig();

      if (readBack.cameraTarget !== 'front') {
        return {
          success: false,
          error: 'Config read/write mismatch',
        };
      }

      const readableStatus = await VirtuCamSettings.verifyConfigReadable();

      return {
        success: readableStatus.exists && readableStatus.readable,
        details: readableStatus as Record<string, unknown>,
      };
    } finally {
      await writeBridgeConfig(originalConfig);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}
