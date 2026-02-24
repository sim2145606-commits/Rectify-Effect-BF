import { useState, useEffect, useCallback, useRef } from 'react';
import {
  runFullSystemCheck,
  getCachedSystemStatus,
  SystemVerificationState,
  INITIAL_SYSTEM_STATE,
} from '@/services/SystemVerification';

export function useSystemStatus(autoRefreshMs: number = 0) {
  const [status, setStatus] = useState<SystemVerificationState>(INITIAL_SYSTEM_STATE);
  const [isChecking, setIsChecking] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runCheck = useCallback(async (heavy: boolean) => {
    setIsChecking(true);
    try {
      const result = await runFullSystemCheck({ heavy });
      setStatus(result);
    } catch {
      // Keep previous state on error
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Initial load: try cache first, then run fresh check
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Try cached first for instant display
      const cached = await getCachedSystemStatus();
      if (cached && mounted) {
        setStatus(cached);
      }

      // Then run fresh check
      if (mounted) {
        void runCheck(false);
        setInitialized(true);
      }
    };

    void init();

    return () => {
      mounted = false;
    };
  }, [runCheck]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefreshMs > 0 && initialized) {
      intervalRef.current = setInterval(() => {
        void runCheck(false);
      }, autoRefreshMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefreshMs, initialized, runCheck]);

  return {
    status,
    isChecking,
    initialized,
    refresh: () => runCheck(true),
    refreshQuick: () => runCheck(false),
  };
}
