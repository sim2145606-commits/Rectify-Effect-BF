import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { NativeModules, Platform } from 'react-native';

const { VirtuCamSettings } = NativeModules;

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov']);
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

export type StageStatus = 'staged' | 'fallback_public' | 'fallback_private' | 'failed';

export type ResolvedPath = {
  absolutePath: string;
  fileName: string;
  fileExtension: string;
  mimeType: string;
  fileSize: number;
  isAccessible: boolean;
  hookReadable: boolean;
  stageStatus: StageStatus;
  stageReason: string;
  stagedPath?: string | null;
  originalPath?: string | null;
};

type StageOutcome = Pick<
  ResolvedPath,
  'absolutePath' | 'isAccessible' | 'hookReadable' | 'stageStatus' | 'stageReason'
>;

function isPrivateAppPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return normalized.startsWith('/data/user/') || normalized.startsWith('/data/data/');
}

function toStageOutcome(originalPath: string, stagedPath: string | null): StageOutcome {
  if (stagedPath) {
    return {
      absolutePath: stagedPath,
      isAccessible: true,
      hookReadable: true,
      stageStatus: 'staged',
      stageReason: 'staged_to_ipc',
    };
  }

  if (!originalPath) {
    return {
      absolutePath: originalPath,
      isAccessible: false,
      hookReadable: false,
      stageStatus: 'failed',
      stageReason: 'stage_failed_empty_path',
    };
  }

  if (isPrivateAppPath(originalPath)) {
    return {
      absolutePath: originalPath,
      isAccessible: false,
      hookReadable: false,
      stageStatus: 'fallback_private',
      stageReason: 'stage_failed_private_path',
    };
  }

  return {
    absolutePath: originalPath,
    isAccessible: true,
    hookReadable: true,
    stageStatus: 'fallback_public',
    stageReason: 'stage_failed_public_fallback',
  };
}

/**
 * Convert a URI-based media selection to an absolute file path
 * that can be read by the system-level camera hook.
 */
export async function resolveMediaPath(uri: string): Promise<ResolvedPath> {
  const defaultResult: ResolvedPath = {
    absolutePath: uri,
    fileName: extractFileName(uri),
    fileExtension: extractExtension(uri),
    mimeType: guessMimeType(uri),
    fileSize: 0,
    isAccessible: false,
    hookReadable: false,
    stageStatus: 'failed',
    stageReason: 'source_unresolved',
    stagedPath: null,
    originalPath: null,
  };

  try {
    if (uri.startsWith('file://')) {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) {
        const absolutePath = uri.replace('file://', '');
        const stagedPath = await stageMediaForHook(absolutePath);
        const stageOutcome = toStageOutcome(absolutePath, stagedPath);
        return {
          ...defaultResult,
          ...stageOutcome,
          fileSize: info.exists && !info.isDirectory ? (info.size || 0) : 0,
          stagedPath,
          originalPath: absolutePath,
        };
      }
    }

    if (uri.startsWith('content://') && Platform.OS === 'android') {
      return await resolveContentUri(uri);
    }

    if (uri.startsWith('ph://')) {
      return await resolvePhotoUri(uri);
    }

    if (uri.startsWith('http')) {
      return await downloadAndResolve(uri);
    }

    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      const absolutePath = info.uri.replace('file://', '');
      const stagedPath = await stageMediaForHook(absolutePath);
      const stageOutcome = toStageOutcome(absolutePath, stagedPath);
      return {
        ...defaultResult,
        ...stageOutcome,
        fileSize: info.exists && !info.isDirectory ? (info.size || 0) : 0,
        stagedPath,
        originalPath: absolutePath,
      };
    }

    return defaultResult;
  } catch (err: unknown) {
    if (__DEV__) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('PathResolver: resolveMediaPath failed:', message);
    }
    return defaultResult;
  }
}

async function resolveContentUri(uri: string): Promise<ResolvedPath> {
  try {
    const fileName = `vc_media_${Date.now()}.${extractExtension(uri) || 'jpg'}`;
    const destPath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.copyAsync({ from: uri, to: destPath });

    const info = await FileSystem.getInfoAsync(destPath);
    const absolutePath = destPath.replace('file://', '');
    const stagedPath = await stageMediaForHook(absolutePath);
    const stageOutcome = toStageOutcome(absolutePath, stagedPath);

    return {
      ...stageOutcome,
      fileName,
      fileExtension: extractExtension(fileName),
      mimeType: guessMimeType(fileName),
      fileSize: info.exists && !info.isDirectory ? (info.size || 0) : 0,
      stagedPath,
      originalPath: absolutePath,
    };
  } catch (err: unknown) {
    if (__DEV__) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('PathResolver: resolveContentUri failed:', message);
    }
    return {
      absolutePath: uri,
      fileName: extractFileName(uri),
      fileExtension: extractExtension(uri),
      mimeType: guessMimeType(uri),
      fileSize: 0,
      isAccessible: false,
      hookReadable: false,
      stageStatus: 'failed',
      stageReason: 'content_uri_resolve_failed',
      stagedPath: null,
      originalPath: null,
    };
  }
}

async function resolvePhotoUri(uri: string): Promise<ResolvedPath> {
  try {
    const assetId = uri.replace('ph://', '');
    const asset = await MediaLibrary.getAssetInfoAsync(assetId);

    if (asset.localUri) {
      const info = await FileSystem.getInfoAsync(asset.localUri);
      const absolutePath = asset.localUri.replace('file://', '');
      const stagedPath = await stageMediaForHook(absolutePath);
      const stageOutcome = toStageOutcome(absolutePath, stagedPath);
      return {
        ...stageOutcome,
        fileName: asset.filename,
        fileExtension: extractExtension(asset.filename),
        mimeType: guessMimeType(asset.filename),
        fileSize: info.exists && !info.isDirectory ? (info.size || 0) : 0,
        stagedPath,
        originalPath: absolutePath,
      };
    }

    return {
      absolutePath: uri,
      fileName: asset.filename,
      fileExtension: extractExtension(asset.filename),
      mimeType: guessMimeType(asset.filename),
      fileSize: 0,
      isAccessible: false,
      hookReadable: false,
      stageStatus: 'failed',
      stageReason: 'photo_uri_missing_local_path',
      stagedPath: null,
      originalPath: null,
    };
  } catch (err: unknown) {
    if (__DEV__) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('PathResolver: resolvePhotoUri failed:', message);
    }
    return {
      absolutePath: uri,
      fileName: extractFileName(uri),
      fileExtension: extractExtension(uri),
      mimeType: guessMimeType(uri),
      fileSize: 0,
      isAccessible: false,
      hookReadable: false,
      stageStatus: 'failed',
      stageReason: 'photo_uri_resolve_failed',
      stagedPath: null,
      originalPath: null,
    };
  }
}

async function downloadAndResolve(url: string): Promise<ResolvedPath> {
  if (!isAllowedRemoteUrl(url)) {
    return {
      absolutePath: url,
      fileName: extractFileName(url),
      fileExtension: extractExtension(url),
      mimeType: guessMimeType(url),
      fileSize: 0,
      isAccessible: false,
      hookReadable: false,
      stageStatus: 'failed',
      stageReason: 'remote_url_blocked',
    };
  }

  try {
    const ext = validateExtension(extractExtension(url)) || 'jpg';
    const fileName = `vc_dl_${Date.now()}.${ext}`;
    const destPath = `${FileSystem.cacheDirectory}${fileName}`;

    const result = await FileSystem.downloadAsync(url, destPath);
    const info = await FileSystem.getInfoAsync(result.uri);
    const absolutePath = result.uri.replace('file://', '');
    const stagedPath = await stageMediaForHook(absolutePath);
    const stageOutcome = toStageOutcome(absolutePath, stagedPath);

    return {
      ...stageOutcome,
      fileName,
      fileExtension: ext,
      mimeType: result.headers?.['content-type'] || guessMimeType(fileName),
      fileSize: info.exists && !info.isDirectory ? (info.size || 0) : 0,
      stagedPath,
      originalPath: absolutePath,
    };
  } catch (err: unknown) {
    if (__DEV__) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('PathResolver: downloadAndResolve failed:', message);
    }
    return {
      absolutePath: url,
      fileName: extractFileName(url),
      fileExtension: extractExtension(url),
      mimeType: guessMimeType(url),
      fileSize: 0,
      isAccessible: false,
      hookReadable: false,
      stageStatus: 'failed',
      stageReason: 'download_resolve_failed',
      stagedPath: null,
      originalPath: null,
    };
  }
}

/**
 * Save an AI-enhanced image to a temporary system directory
 */
export async function saveEnhancedMedia(
  sourceUri: string,
  filterName: string
): Promise<string | null> {
  try {
    const safeFilterName = filterName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
    const dir = `${FileSystem.documentDirectory}virtucam/enhanced/`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }

    const ext = validateExtension(extractExtension(sourceUri)) || 'jpg';
    const fileName = `enhanced_${safeFilterName}_${Date.now()}.${ext}`;
    const destPath = `${dir}${fileName}`;

    const normalizedDest = destPath.replace(/\\/g, '/').replace(/\/+/g, '/');
    const normalizedDir = dir.replace(/\\/g, '/').replace(/\/+/g, '/');
    if (!normalizedDest.startsWith(normalizedDir)) {
      throw new Error('Path traversal detected while creating enhanced media path');
    }

    if (sourceUri.startsWith('http')) {
      if (!isAllowedRemoteUrl(sourceUri)) {
        return null;
      }
      const result = await FileSystem.downloadAsync(sourceUri, destPath);
      return result.uri;
    }

    await FileSystem.copyAsync({ from: sourceUri, to: destPath });
    return destPath;
  } catch (err: unknown) {
    if (__DEV__) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('PathResolver: saveEnhancedMedia failed:', message);
    }
    return null;
  }
}

/**
 * Clean up temporary enhanced media files
 */
export async function cleanEnhancedCache(): Promise<void> {
  try {
    const dir = `${FileSystem.documentDirectory}virtucam/enhanced/`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch (err: unknown) {
    if (__DEV__) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('PathResolver: cleanEnhancedCache failed:', message);
    }
  }
}

function extractFileName(uri: string): string {
  const parts = uri.split('/');
  const last = parts[parts.length - 1];
  const questionMarkIndex = last.indexOf('?');
  return questionMarkIndex !== -1 ? last.substring(0, questionMarkIndex) : last || 'unknown';
}

function extractExtension(uri: string): string {
  const lastSlash = uri.lastIndexOf('/');
  const lastDot = uri.lastIndexOf('.');
  const queryIndex = uri.indexOf('?', lastSlash);

  if (lastDot > lastSlash && (queryIndex === -1 || lastDot < queryIndex)) {
    const end = queryIndex === -1 ? uri.length : queryIndex;
    return uri.substring(lastDot + 1, end).toLowerCase();
  }
  return '';
}

function validateExtension(ext: string): string | null {
  const lower = ext.toLowerCase();
  return ALLOWED_EXTENSIONS.has(lower) ? lower : null;
}

function isAllowedRemoteUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (BLOCKED_HOSTS.has(parsed.hostname)) return false;

    const ipv4 = parsed.hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
      if (
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function guessMimeType(uri: string): string {
  const ext = extractExtension(uri);
  return MIME_MAP[ext] || 'application/octet-stream';
}

async function stageMediaForHook(absolutePath: string): Promise<string | null> {
  if (!absolutePath || Platform.OS !== 'android') return null;
  if (!VirtuCamSettings?.stageMediaForHook) return null;

  try {
    const staged = await VirtuCamSettings.stageMediaForHook(absolutePath);
    return typeof staged === 'string' && staged.length > 0 ? staged : null;
  } catch (err: unknown) {
    if (__DEV__) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('PathResolver: stageMediaForHook failed:', message);
    }
    return null;
  }
}
