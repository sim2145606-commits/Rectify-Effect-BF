import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then(stored => {
        if (stored !== null) {
          try {
            setValue(JSON.parse(stored));
          } catch (error) {
            const sanitizedKey = String(key).replace(/[\r\n]/g, '');
            const errorMsg = error instanceof Error ? error.message.replace(/[\r\n]/g, '') : String(error).replace(/[\r\n]/g, '');
            console.error(`Failed to parse stored value for key "${sanitizedKey}": ${errorMsg}`);
            setValue(stored as unknown as T);
          }
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, [key]);

  const updateValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValue(prev => {
        const resolved =
          typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue;
        AsyncStorage.setItem(key, JSON.stringify(resolved)).catch(() => {});
        return resolved;
      });
    },
    [key]
  );

  return [value, updateValue, loaded] as const;
}
