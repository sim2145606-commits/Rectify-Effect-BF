import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type StorageListener = (value: unknown, sourceId: symbol) => void;

const storageListeners = new Map<string, Set<StorageListener>>();

function emitStorageChange(key: string, value: unknown, sourceId: symbol) {
  const listeners = storageListeners.get(key);
  if (!listeners) return;
  listeners.forEach(listener => listener(value, sourceId));
}

function subscribeToStorageKey(key: string, listener: StorageListener): () => void {
  const listeners = storageListeners.get(key) ?? new Set<StorageListener>();
  listeners.add(listener);
  storageListeners.set(key, listeners);

  return () => {
    const current = storageListeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) storageListeners.delete(key);
  };
}

export function useStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const sourceIdRef = useRef(Symbol(key));

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then(stored => {
        if (stored !== null) {
          try {
            setValue(JSON.parse(stored));
          } catch (err: unknown) {
            const sanitizedKey = String(key).replace(/[\r\n]/g, '');
            const errorMsg =
              err instanceof Error
                ? err.message.replace(/[\r\n]/g, '')
                : String(err).replace(/[\r\n]/g, '');
            console.error(`Failed to parse stored value for key "${sanitizedKey}": ${errorMsg}`);
            setValue(stored as unknown as T);
          }
        }
      })
      .catch((err: unknown) => {
        const sanitizedKey = String(key).replace(/[\r\n]/g, '');
        const errorMsg =
          err instanceof Error
            ? err.message.replace(/[\r\n]/g, '')
            : String(err).replace(/[\r\n]/g, '');
        console.error(`Failed to load value for key "${sanitizedKey}": ${errorMsg}`);
      });
  }, [key]);

  useEffect(() => {
    return subscribeToStorageKey(key, (nextValue, sourceId) => {
      if (sourceId === sourceIdRef.current) return;
      setValue(nextValue as T);
    });
  }, [key]);

  const updateValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValue(prev => {
        const resolved =
          typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue;
        let prevSerialized = '';
        let nextSerialized = '';
        try {
          prevSerialized = JSON.stringify(prev);
          nextSerialized = JSON.stringify(resolved);
        } catch {
          // Fallback to reference comparison when serialization fails.
        }
        if (
          (prevSerialized && nextSerialized && prevSerialized === nextSerialized) ||
          Object.is(prev, resolved)
        ) {
          return prev;
        }
        emitStorageChange(key, resolved, sourceIdRef.current);
        // Persist asynchronously as a side effect (fire-and-forget)
        AsyncStorage.setItem(key, JSON.stringify(resolved)).catch((err: unknown) => {
          const sanitizedKey = String(key).replace(/[\r\n]/g, '');
          const errorMsg =
            err instanceof Error
              ? err.message.replace(/[\r\n]/g, '')
              : String(err).replace(/[\r\n]/g, '');
          console.error(`Failed to save value for key "${sanitizedKey}": ${errorMsg}`);
        });
        return resolved;
      });
    },
    [key]
  );

  return [value, updateValue] as const;
}
