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
  rotation: number;
  scale_mode: string;
  ai_enhancement: string | null;
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
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.FRONT_CAMERA, JSON.stringify(preset.camera_front)],
    [STORAGE_KEYS.BACK_CAMERA, JSON.stringify(preset.camera_back)],
    [STORAGE_KEYS.MIRRORED, JSON.stringify(preset.mirrored)],
    [STORAGE_KEYS.ROTATION, JSON.stringify(preset.rotation)],
    [STORAGE_KEYS.SCALE_MODE, JSON.stringify(preset.scale_mode)],
    [STORAGE_KEYS.AI_ENHANCEMENT, JSON.stringify(preset.ai_enhancement)],
    [STORAGE_KEYS.TARGET_MODE, JSON.stringify(preset.target_mode)],
  ]);

  await updateLastSyncTime();
}

// Capture the current device config to create a preset
export async function captureCurrentConfig(): Promise<Omit<PresetConfig, 'name'>> {
  const keys = [
    STORAGE_KEYS.FRONT_CAMERA,
    STORAGE_KEYS.BACK_CAMERA,
    STORAGE_KEYS.MIRRORED,
    STORAGE_KEYS.ROTATION,
    STORAGE_KEYS.SCALE_MODE,
    STORAGE_KEYS.AI_ENHANCEMENT,
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
    rotation: parseJson(values[STORAGE_KEYS.ROTATION], 0),
    scale_mode: parseJson(values[STORAGE_KEYS.SCALE_MODE], 'fit'),
    ai_enhancement: parseJson(values[STORAGE_KEYS.AI_ENHANCEMENT], null),
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
