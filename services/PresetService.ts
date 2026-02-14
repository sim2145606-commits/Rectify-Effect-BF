import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';

export type CloudPreset = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  camera_front: boolean;
  camera_back: boolean;
  mirrored: boolean;
  rotation: number;
  scale_mode: string;
  ai_enhancement: string | null;
  target_apps: string[];
  target_mode: string;
  is_public: boolean;
  downloads: number;
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
  ai_enhancement: string | null;
  ai_optimize: boolean;
  ai_subject_lock: boolean;
  loop_enabled: boolean;
  loop_start: number;
  loop_end: number;
  target_apps: string[];
  target_mode: string;
};

export type SyncStatus = {
  state: 'idle' | 'syncing' | 'synced' | 'error';
  lastSynced: string | null;
  presetCount: number;
  cloudVerifiedApps: string[];
  error?: string;
};

const LAST_SYNC_KEY = 'virtucam_last_sync_time';

// Fetch all presets for the current user
export async function fetchPresets(): Promise<CloudPreset[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('creator_presets')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []) as CloudPreset[];
}

// Save a new preset capturing current device configuration
export async function savePreset(config: PresetConfig): Promise<CloudPreset> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('creator_presets')
    .insert({
      user_id: user.id,
      name: config.name,
      description: config.description || null,
      camera_front: config.camera_front,
      camera_back: config.camera_back,
      mirrored: config.mirrored,
      rotation: config.rotation,
      scale_mode: config.scale_mode,
      ai_enhancement: config.ai_enhancement,
      target_apps: config.target_apps,
      target_mode: config.target_mode,
    })
    .select()
    .single();

  if (error) throw error;

  // Update sync status
  await updateLastSyncTime();

  return data as CloudPreset;
}

// Delete a preset
export async function deletePreset(presetId: string): Promise<void> {
  const { error } = await supabase
    .from('creator_presets')
    .delete()
    .eq('id', presetId);

  if (error) throw error;
  await updateLastSyncTime();
}

// Apply a preset — writes values to AsyncStorage so all screens pick them up
export async function applyPreset(preset: CloudPreset): Promise<void> {
  const pairs: [string, string][] = [
    [STORAGE_KEYS.FRONT_CAMERA, JSON.stringify(preset.camera_front)],
    [STORAGE_KEYS.BACK_CAMERA, JSON.stringify(preset.camera_back)],
    [STORAGE_KEYS.MIRRORED, JSON.stringify(preset.mirrored)],
    [STORAGE_KEYS.ROTATION, JSON.stringify(preset.rotation)],
    [STORAGE_KEYS.SCALE_MODE, JSON.stringify(preset.scale_mode)],
    [STORAGE_KEYS.AI_ENHANCEMENT, JSON.stringify(preset.ai_enhancement)],
    [STORAGE_KEYS.TARGET_MODE, JSON.stringify(preset.target_mode)],
  ];

  // Apply Media Studio extended fields if present in the preset metadata
  const meta = (preset as CloudPresetWithStudio);
  if (meta.flipped_vertical !== undefined) {
    pairs.push([STORAGE_KEYS.FLIPPED_VERTICAL, JSON.stringify(meta.flipped_vertical)]);
  }
  if (meta.offset_x !== undefined) {
    pairs.push([STORAGE_KEYS.OFFSET_X, JSON.stringify(meta.offset_x)]);
  }
  if (meta.offset_y !== undefined) {
    pairs.push([STORAGE_KEYS.OFFSET_Y, JSON.stringify(meta.offset_y)]);
  }
  if (meta.ai_optimize !== undefined) {
    pairs.push([STORAGE_KEYS.AI_OPTIMIZE, JSON.stringify(meta.ai_optimize)]);
  }
  if (meta.ai_subject_lock !== undefined) {
    pairs.push([STORAGE_KEYS.AI_SUBJECT_LOCK, JSON.stringify(meta.ai_subject_lock)]);
  }
  if (meta.loop_enabled !== undefined) {
    pairs.push([STORAGE_KEYS.LOOP_ENABLED, JSON.stringify(meta.loop_enabled)]);
  }
  if (meta.loop_start !== undefined) {
    pairs.push([STORAGE_KEYS.LOOP_START, JSON.stringify(meta.loop_start)]);
  }
  if (meta.loop_end !== undefined) {
    pairs.push([STORAGE_KEYS.LOOP_END, JSON.stringify(meta.loop_end)]);
  }

  await AsyncStorage.multiSet(pairs);
  await updateLastSyncTime();
}

// Extended CloudPreset type with Media Studio fields
type CloudPresetWithStudio = CloudPreset & {
  flipped_vertical?: boolean;
  offset_x?: number;
  offset_y?: number;
  ai_optimize?: boolean;
  ai_subject_lock?: boolean;
  loop_enabled?: boolean;
  loop_start?: number;
  loop_end?: number;
};

// Capture the current device config to create a preset
export async function captureCurrentConfig(): Promise<Omit<PresetConfig, 'name'>> {
  const keys = [
    STORAGE_KEYS.FRONT_CAMERA,
    STORAGE_KEYS.BACK_CAMERA,
    STORAGE_KEYS.MIRRORED,
    STORAGE_KEYS.FLIPPED_VERTICAL,
    STORAGE_KEYS.ROTATION,
    STORAGE_KEYS.SCALE_MODE,
    STORAGE_KEYS.OFFSET_X,
    STORAGE_KEYS.OFFSET_Y,
    STORAGE_KEYS.AI_ENHANCEMENT,
    STORAGE_KEYS.AI_OPTIMIZE,
    STORAGE_KEYS.AI_SUBJECT_LOCK,
    STORAGE_KEYS.LOOP_ENABLED,
    STORAGE_KEYS.LOOP_START,
    STORAGE_KEYS.LOOP_END,
    STORAGE_KEYS.TARGET_MODE,
    STORAGE_KEYS.TARGET_APPS,
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

  // Extract target app package names
  const targetApps = parseJson<{ packageName: string; enabled: boolean }[]>(
    values[STORAGE_KEYS.TARGET_APPS],
    []
  );
  const enabledPackages = targetApps
    .filter((a) => a.enabled)
    .map((a) => a.packageName);

  return {
    camera_front: parseJson(values[STORAGE_KEYS.FRONT_CAMERA], true),
    camera_back: parseJson(values[STORAGE_KEYS.BACK_CAMERA], false),
    mirrored: parseJson(values[STORAGE_KEYS.MIRRORED], false),
    flipped_vertical: parseJson(values[STORAGE_KEYS.FLIPPED_VERTICAL], false),
    rotation: parseJson(values[STORAGE_KEYS.ROTATION], 0),
    scale_mode: parseJson(values[STORAGE_KEYS.SCALE_MODE], 'fit'),
    offset_x: parseJson(values[STORAGE_KEYS.OFFSET_X], 0),
    offset_y: parseJson(values[STORAGE_KEYS.OFFSET_Y], 0),
    ai_enhancement: parseJson(values[STORAGE_KEYS.AI_ENHANCEMENT], null),
    ai_optimize: parseJson(values[STORAGE_KEYS.AI_OPTIMIZE], false),
    ai_subject_lock: parseJson(values[STORAGE_KEYS.AI_SUBJECT_LOCK], false),
    loop_enabled: parseJson(values[STORAGE_KEYS.LOOP_ENABLED], true),
    loop_start: parseJson(values[STORAGE_KEYS.LOOP_START], 0),
    loop_end: parseJson(values[STORAGE_KEYS.LOOP_END], 30),
    target_apps: enabledPackages,
    target_mode: parseJson(values[STORAGE_KEYS.TARGET_MODE], 'whitelist'),
  };
}

// Get cloud sync status
export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const lastSynced = await AsyncStorage.getItem(LAST_SYNC_KEY);
    const presets = await fetchPresets();

    // Collect all unique target app package names across all presets
    const cloudVerifiedApps = new Set<string>();
    presets.forEach((p) => {
      if (Array.isArray(p.target_apps)) {
        p.target_apps.forEach((app: string) => cloudVerifiedApps.add(app));
      }
    });

    return {
      state: 'synced',
      lastSynced,
      presetCount: presets.length,
      cloudVerifiedApps: Array.from(cloudVerifiedApps),
    };
  } catch (err) {
    return {
      state: 'error',
      lastSynced: null,
      presetCount: 0,
      cloudVerifiedApps: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// Update the last sync timestamp
async function updateLastSyncTime(): Promise<void> {
  const now = new Date().toISOString();
  await AsyncStorage.setItem(LAST_SYNC_KEY, now);
}

// Full cloud sync — re-fetch everything and update local cache
export async function performFullSync(): Promise<SyncStatus> {
  await updateLastSyncTime();
  return getSyncStatus();
}
