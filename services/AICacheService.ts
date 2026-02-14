import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/theme';

export type AICacheEntry = {
  key: string;
  mediaUri: string;
  resultUri: string | null;
  analysisResult: string | null;
  filterType: 'optimize' | 'subject_lock' | 'custom';
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
  sizeEstimate: number; // KB
};

export type AICacheStats = {
  totalEntries: number;
  totalSizeKB: number;
  hitRate: number;
  oldestEntry: number;
  newestEntry: number;
};

const MAX_CACHE_ENTRIES = 20;
const MAX_CACHE_SIZE_KB = 50 * 1024; // 50MB max
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateCacheKey(mediaUri: string, filterType: string): string {
  // Create a simple hash-like key from URI + filter
  const combined = `${mediaUri}::${filterType}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `ai_cache_${Math.abs(hash).toString(36)}`;
}

async function loadCache(): Promise<AICacheEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.AI_CACHE_DATA);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Corrupt cache - start fresh
  }
  return [];
}

async function saveCache(entries: AICacheEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.AI_CACHE_DATA, JSON.stringify(entries));
    await AsyncStorage.setItem(STORAGE_KEYS.AI_CACHE_TIMESTAMP, Date.now().toString());
  } catch {
    // Non-critical
  }
}

export async function getCachedResult(
  mediaUri: string,
  filterType: 'optimize' | 'subject_lock' | 'custom'
): Promise<AICacheEntry | null> {
  const cache = await loadCache();
  const key = generateCacheKey(mediaUri, filterType);

  const entry = cache.find(e => e.key === key);
  if (!entry) return null;

  // Check if entry is expired
  if (Date.now() - entry.createdAt > CACHE_EXPIRY_MS) {
    // Remove expired entry
    const filtered = cache.filter(e => e.key !== key);
    await saveCache(filtered);
    return null;
  }

  // Update access stats
  entry.accessCount += 1;
  entry.lastAccessed = Date.now();
  await saveCache(cache);

  return entry;
}

export async function setCacheResult(
  mediaUri: string,
  filterType: 'optimize' | 'subject_lock' | 'custom',
  resultUri: string | null,
  analysisResult: string | null,
  sizeEstimateKB: number = 500
): Promise<void> {
  const cache = await loadCache();
  const key = generateCacheKey(mediaUri, filterType);

  // Remove existing entry if present
  const existingIndex = cache.findIndex(e => e.key === key);
  if (existingIndex >= 0) {
    cache.splice(existingIndex, 1);
  }

  const newEntry: AICacheEntry = {
    key,
    mediaUri,
    resultUri,
    analysisResult,
    filterType,
    createdAt: Date.now(),
    accessCount: 1,
    lastAccessed: Date.now(),
    sizeEstimate: sizeEstimateKB,
  };

  cache.unshift(newEntry);

  // Enforce size limits
  let totalSize = cache.reduce((sum, e) => sum + e.sizeEstimate, 0);

  // Remove oldest entries if over size limit
  while (totalSize > MAX_CACHE_SIZE_KB && cache.length > 1) {
    const removed = cache.pop();
    if (removed) {
      totalSize -= removed.sizeEstimate;
    }
  }

  // Remove oldest if over count limit
  while (cache.length > MAX_CACHE_ENTRIES) {
    cache.pop();
  }

  // Remove expired entries
  const now = Date.now();
  const validEntries = cache.filter(e => now - e.createdAt < CACHE_EXPIRY_MS);

  await saveCache(validEntries);
}

export async function getCacheStats(): Promise<AICacheStats> {
  const cache = await loadCache();

  if (cache.length === 0) {
    return {
      totalEntries: 0,
      totalSizeKB: 0,
      hitRate: 0,
      oldestEntry: 0,
      newestEntry: 0,
    };
  }

  const totalSizeKB = cache.reduce((sum, e) => sum + e.sizeEstimate, 0);
  const totalAccesses = cache.reduce((sum, e) => sum + e.accessCount, 0);
  const hitRate = totalAccesses > 0 ? Math.min(100, Math.round((totalAccesses / (totalAccesses + cache.length)) * 100)) : 0;

  const timestamps = cache.map(e => e.createdAt);

  return {
    totalEntries: cache.length,
    totalSizeKB,
    hitRate,
    oldestEntry: Math.min(...timestamps),
    newestEntry: Math.max(...timestamps),
  };
}

export async function clearAICache(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.AI_CACHE_DATA);
  await AsyncStorage.removeItem(STORAGE_KEYS.AI_CACHE_TIMESTAMP);
}

export async function pruneExpiredEntries(): Promise<number> {
  const cache = await loadCache();
  const now = Date.now();
  const validEntries = cache.filter(e => now - e.createdAt < CACHE_EXPIRY_MS);
  const pruned = cache.length - validEntries.length;

  if (pruned > 0) {
    await saveCache(validEntries);
  }

  return pruned;
}
