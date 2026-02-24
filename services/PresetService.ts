import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';
import { logger } from './LogService';
import { syncAllSettings } from './ConfigBridge';

export type LocalPreset = {
  id: string;
  name: string;
  description: string | null;
  camera_front: boolean;
  camera_back: boolean;
  mirrored: boolean;
  flipped_vertical: boolean;
  rotation: number;
  scale_mode: string;
  offset_x: number;
  offset_y: number;
  media_uri: string | null;
  created_at: string;
  updated_at: string;
};

export type PresetConfig = {
  name: string;
  description?: string;
  camera_front: boolean;
  camera_back: boolean;
  mirrored: boolean;
  flipped_vertical: boolean;
  rotation: number;
  scale_mode: string;
  offset_x: number;
  offset_y: number;
  media_uri: string | null;
};

const PRESETS_STORAGE_KEY = 'virtucam_local_presets';

export async function fetchPresets(): Promise<LocalPreset[]> {
  try {
    const presetsJson = await AsyncStorage.getItem(PRESETS_STORAGE_KEY);
    if (!presetsJson) return [];
    const presets = JSON.parse(presetsJson) as LocalPreset[];
    return presets.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  } catch (err: unknown) {
    logger.error('Failed to fetch presets', 'PresetService', err);
    return [];
  }
}

async function saveAllPresets(presets: LocalPreset[]): Promise<void> {
  AsyncStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets)).catch(() => {});
}

export async function savePreset(config: PresetConfig): Promise<LocalPreset> {
  try {
    const presets = await fetchPresets();
    const id = `preset_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const now = new Date().toISOString();

    const newPreset: LocalPreset = {
      id,
      name: config.name,
      description: config.description || null,
      camera_front: config.camera_front,
      camera_back: config.camera_back,
      mirrored: config.mirrored,
      flipped_vertical: config.flipped_vertical,
      rotation: config.rotation,
      scale_mode: config.scale_mode,
      offset_x: config.offset_x,
      offset_y: config.offset_y,
      media_uri: config.media_uri,
      created_at: now,
      updated_at: now,
    };

    presets.push(newPreset);
    await saveAllPresets(presets);
    return newPreset;
  } catch (err: unknown) {
    logger.error('Failed to save preset', 'PresetService', err);
    throw new Error('Failed to save preset to local storage');
  }
}

export async function deletePreset(presetId: string): Promise<void> {
  try {
    const presets = await fetchPresets();
    const filtered = presets.filter(p => p.id !== presetId);
    await saveAllPresets(filtered);
  } catch (err: unknown) {
    logger.error('Failed to delete preset', 'PresetService', err);
    throw new Error('Failed to delete preset');
  }
}

export async function renamePreset(
  presetId: string,
  newName: string,
  newDescription?: string
): Promise<void> {
  try {
    const presets = await fetchPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset) {
      logger.error('Preset not found', 'PresetService');
      return;
    }

    preset.name = newName;
    if (newDescription !== undefined) {
      preset.description = newDescription;
    }
    preset.updated_at = new Date().toISOString();

    await saveAllPresets(presets);
  } catch (err: unknown) {
    logger.error('Failed to rename preset', 'PresetService', err);
    throw new Error('Failed to rename preset');
  }
}

export async function applyPreset(preset: LocalPreset): Promise<void> {
  try {
    const pairs: [string, string][] = [
      [STORAGE_KEYS.FRONT_CAMERA, JSON.stringify(preset.camera_front)],
      [STORAGE_KEYS.BACK_CAMERA, JSON.stringify(preset.camera_back)],
      [STORAGE_KEYS.MIRRORED, JSON.stringify(preset.mirrored)],
      [STORAGE_KEYS.FLIPPED_VERTICAL, JSON.stringify(preset.flipped_vertical)],
      [STORAGE_KEYS.ROTATION, JSON.stringify(preset.rotation)],
      [STORAGE_KEYS.SCALE_MODE, JSON.stringify(preset.scale_mode)],
      [STORAGE_KEYS.OFFSET_X, JSON.stringify(preset.offset_x)],
      [STORAGE_KEYS.OFFSET_Y, JSON.stringify(preset.offset_y)],
    ];

    pairs.push([STORAGE_KEYS.SELECTED_MEDIA, JSON.stringify(preset.media_uri)]);
    pairs.push([STORAGE_KEYS.HOOK_MEDIA_PATH, JSON.stringify(null)]);

    await AsyncStorage.multiSet(pairs);
    await syncAllSettings();
  } catch (err: unknown) {
    logger.error('Failed to apply preset', 'PresetService', err);
    throw new Error('Failed to apply preset');
  }
}

export async function captureCurrentConfig(): Promise<Omit<PresetConfig, 'name'>> {
  try {
    const keys = [
      STORAGE_KEYS.FRONT_CAMERA,
      STORAGE_KEYS.BACK_CAMERA,
      STORAGE_KEYS.MIRRORED,
      STORAGE_KEYS.FLIPPED_VERTICAL,
      STORAGE_KEYS.ROTATION,
      STORAGE_KEYS.SCALE_MODE,
      STORAGE_KEYS.OFFSET_X,
      STORAGE_KEYS.OFFSET_Y,
      STORAGE_KEYS.SELECTED_MEDIA,
    ];

    const pairs = await AsyncStorage.multiGet(keys);
    const values: Record<string, string | null> = {};
    pairs.forEach(([key, val]) => {
      values[key] = val;
    });

    const parseJson = <T>(val: string | null | undefined, fallback: T): T => {
      if (!val) return fallback;
      try {
        return JSON.parse(val) as T;
      } catch {
        return fallback;
      }
    };

    return {
      camera_front: parseJson(values[STORAGE_KEYS.FRONT_CAMERA], true),
      camera_back: parseJson(values[STORAGE_KEYS.BACK_CAMERA], false),
      mirrored: parseJson(values[STORAGE_KEYS.MIRRORED], false),
      flipped_vertical: parseJson(values[STORAGE_KEYS.FLIPPED_VERTICAL], false),
      rotation: parseJson(values[STORAGE_KEYS.ROTATION], 0),
      scale_mode: parseJson(values[STORAGE_KEYS.SCALE_MODE], 'fit'),
      offset_x: parseJson(values[STORAGE_KEYS.OFFSET_X], 0),
      offset_y: parseJson(values[STORAGE_KEYS.OFFSET_Y], 0),
      media_uri: parseJson(values[STORAGE_KEYS.SELECTED_MEDIA], null),
    };
  } catch (err: unknown) {
    logger.error('Failed to capture config', 'PresetService', err);
    throw new Error('Failed to capture current configuration');
  }
}
