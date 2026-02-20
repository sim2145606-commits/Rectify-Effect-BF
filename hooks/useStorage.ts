import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);

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

  const updateValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValue(prev => {
        const resolved =
          typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue;
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
