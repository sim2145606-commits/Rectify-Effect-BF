import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

export type ResolvedPath = {
  absolutePath: string;
  fileName: string;
  fileExtension: string;
  mimeType: string;
  fileSize: number;
  isAccessible: boolean;
};

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
  };

  try {
    // Check if it's already a file:// path
    if (uri.startsWith('file://')) {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) {
        return {
          ...defaultResult,
          absolutePath: uri.replace('file://', ''),
          fileSize: info.exists ? info.size : 0,
          isAccessible: true,
        };
      }
    }

    // Handle content:// URIs (Android)
    if (uri.startsWith('content://') && Platform.OS === 'android') {
      return await resolveContentUri(uri);
    }

    // Handle ph:// URIs (iOS Photos)
    if (uri.startsWith('ph://')) {
      return await resolvePhotoUri(uri);
    }

    // Handle regular http/https URLs (already cached by expo-image-picker)
    if (uri.startsWith('http')) {
      return await downloadAndResolve(uri);
    }

    // Try to get info about the URI directly
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      return {
        ...defaultResult,
        absolutePath: info.uri.replace('file://', ''),
        fileSize: info.exists ? info.size : 0,
        isAccessible: true,
      };
    }

    return defaultResult;
  } catch {
    return defaultResult;
  }
}

async function resolveContentUri(uri: string): Promise<ResolvedPath> {
  try {
    // Copy the file to our cache directory for reliable access
    const fileName = `vc_media_${Date.now()}.${extractExtension(uri) || 'jpg'}`;
    const destPath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.copyAsync({
      from: uri,
      to: destPath,
    });

    const info = await FileSystem.getInfoAsync(destPath);

    return {
      absolutePath: destPath.replace('file://', ''),
      fileName,
      fileExtension: extractExtension(fileName),
      mimeType: guessMimeType(fileName),
      fileSize: info.exists ? info.size : 0,
      isAccessible: true,
    };
  } catch {
    return {
      absolutePath: uri,
      fileName: extractFileName(uri),
      fileExtension: extractExtension(uri),
      mimeType: guessMimeType(uri),
      fileSize: 0,
      isAccessible: false,
    };
  }
}

async function resolvePhotoUri(uri: string): Promise<ResolvedPath> {
  try {
    const assetId = uri.replace('ph://', '');
    const asset = await MediaLibrary.getAssetInfoAsync(assetId);

    if (asset.localUri) {
      const info = await FileSystem.getInfoAsync(asset.localUri);
      return {
        absolutePath: asset.localUri.replace('file://', ''),
        fileName: asset.filename,
        fileExtension: extractExtension(asset.filename),
        mimeType: guessMimeType(asset.filename),
        fileSize: info.exists ? info.size : 0,
        isAccessible: true,
      };
    }

    return {
      absolutePath: uri,
      fileName: asset.filename,
      fileExtension: extractExtension(asset.filename),
      mimeType: guessMimeType(asset.filename),
      fileSize: 0,
      isAccessible: false,
    };
  } catch {
    return {
      absolutePath: uri,
      fileName: extractFileName(uri),
      fileExtension: extractExtension(uri),
      mimeType: guessMimeType(uri),
      fileSize: 0,
      isAccessible: false,
    };
  }
}

async function downloadAndResolve(url: string): Promise<ResolvedPath> {
  try {
    const ext = extractExtension(url) || 'jpg';
    const fileName = `vc_dl_${Date.now()}.${ext}`;
    const destPath = `${FileSystem.cacheDirectory}${fileName}`;

    const result = await FileSystem.downloadAsync(url, destPath);
    const info = await FileSystem.getInfoAsync(result.uri);

    return {
      absolutePath: result.uri.replace('file://', ''),
      fileName,
      fileExtension: ext,
      mimeType: result.headers?.['content-type'] || guessMimeType(fileName),
      fileSize: info.exists ? info.size : 0,
      isAccessible: true,
    };
  } catch {
    return {
      absolutePath: url,
      fileName: extractFileName(url),
      fileExtension: extractExtension(url),
      mimeType: guessMimeType(url),
      fileSize: 0,
      isAccessible: false,
    };
  }
}

/**
 * Save an AI-enhanced image to a temporary system directory
 * that the camera hook can read from
 */
export async function saveEnhancedMedia(
  sourceUri: string,
  filterName: string
): Promise<string | null> {
  try {
    const dir = `${FileSystem.documentDirectory}virtucam/enhanced/`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }

    const ext = extractExtension(sourceUri) || 'jpg';
    const fileName = `enhanced_${filterName}_${Date.now()}.${ext}`;
    const destPath = `${dir}${fileName}`;

    if (sourceUri.startsWith('http')) {
      const result = await FileSystem.downloadAsync(sourceUri, destPath);
      return result.uri;
    }

    await FileSystem.copyAsync({ from: sourceUri, to: destPath });
    return destPath;
  } catch {
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
  } catch {
    // Silent
  }
}

function extractFileName(uri: string): string {
  try {
    const parts = uri.split('/');
    const last = parts[parts.length - 1];
    return last.split('?')[0] || 'unknown';
  } catch {
    return 'unknown';
  }
}

function extractExtension(uri: string): string {
  try {
    const fileName = extractFileName(uri);
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  } catch {
    return '';
  }
}

function guessMimeType(uri: string): string {
  const ext = extractExtension(uri);
  const mimeMap: Record<string, string> = {
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
  return mimeMap[ext] || 'application/octet-stream';
}
