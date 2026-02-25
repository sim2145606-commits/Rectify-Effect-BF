import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  AppState,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Spacing, BorderRadius, FontSize, STORAGE_KEYS } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import {
  checkAllPermissions,
  requestCameraPermission,
  requestAllFilesAccess,
  requestOverlayPermission,
  openLSPosedManager,
  openAppSettings,
  areAllPermissionsGranted,
  type AllPermissionsState,
  type PermissionStatus,
} from '@/services/PermissionManager';
import {
  runDiagnostics,
  getRawXposedDebugInfo,
  type DiagnosticsReport,
  type RawXposedDebugInfo,
} from '@/services/DiagnosticsService';
import { writeBridgeConfig } from '@/services/ConfigBridge';
import { logger } from '@/services/LogService';

type DemoState = 'idle' | 'armed' | 'waiting_camera' | 'verifying' | 'pass' | 'fail';

const TUTORIAL_STEPS = [
  'Root + LSPosed ready',
  'Grant required permissions',
  'Pick media in Studio',
  'Enable hook in Command',
  'Demo test (Stock Camera)',
  'Done / troubleshooting',
] as const;

function parseStoredBoolean(raw: string | null, fallback: boolean): boolean {
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'boolean') return parsed;
    if (typeof parsed === 'string') {
      const normalized = parsed.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return fallback;
  } catch {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
  }
}

function parseStoredString(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string' && parsed.trim().length > 0) return parsed.trim();
  } catch {
    if (raw.trim().length > 0) return raw.trim();
  }
  return null;
}

function evaluateDemoResult(
  report: DiagnosticsReport,
  rawInfo: RawXposedDebugInfo | null
): { pass: boolean; detail: string } {
  if (!rawInfo) {
    return {
      pass: false,
      detail: 'Diagnostics data unavailable. Open Settings > Diagnostics and retry.',
    };
  }

  const findCheck = (name: string) => report.checks.find(check => check.name === name);
  const companionCheck = findCheck('Companion Status');
  const ipcReady = findCheck('IPC Config')?.status === 'pass' && rawInfo.ipcConfigReady;
  const runtimeObserved = rawInfo.runtimeHookObserved;
  const runtimeObservedFresh = rawInfo.runtimeObservedFresh;
  const companionReady =
    companionCheck?.status === 'pass' || (companionCheck?.status === 'warn' && runtimeObservedFresh);
  const mappedPositive = (rawInfo.latestMappedCount ?? 0) > 0;
  const hookReadyPath =
    rawInfo.hookReady ||
    (runtimeObservedFresh &&
      rawInfo.ipcConfigReady &&
      (rawInfo.stagedMediaReady || mappedPositive));

  if (!companionReady || !ipcReady) {
    return {
      pass: false,
      detail:
        companionCheck?.status === 'warn' && !runtimeObservedFresh
          ? 'Companion is waiting for fresh runtime observation. Open stock camera and retry verify.'
          : 'Companion/config not ready. Fix IPC config staging in Settings > Diagnostics.',
    };
  }
  if (!hookReadyPath) {
    return {
      pass: false,
      detail: 'Hook pipeline is not ready. Verify scope, source mode, and media staging.',
    };
  }
  if (!runtimeObserved) {
    return {
      pass: false,
      detail: 'Runtime hook not observed. Open stock camera for 2-3 seconds, then verify again.',
    };
  }
  if (!runtimeObservedFresh) {
    return {
      pass: false,
      detail: 'Runtime evidence is stale. Open stock camera again to refresh observation before verify.',
    };
  }
  if (!mappedPositive) {
    const reason = rawInfo.latestZeroReason ? ` Latest reason: ${rawInfo.latestZeroReason}.` : '';
    return {
      pass: false,
      detail: `Mapping is still zero.${reason} ${rawInfo.quickFixHint}`.trim(),
    };
  }

  return {
    pass: true,
    detail:
      'Hook verified: runtime observed, positive mapping detected, and companion/config are ready.',
  };
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [permissions, setPermissions] = useState<AllPermissionsState | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [entryReady, setEntryReady] = useState(false);

  const [isSetupReopen, setIsSetupReopen] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(true);
  const [tutorialSkippedThisSession, setTutorialSkippedThisSession] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);

  const [hookEnabledState, setHookEnabledState] = useState(false);
  const [selectedMediaUri, setSelectedMediaUri] = useState<string | null>(null);
  const [hookMediaPath, setHookMediaPath] = useState<string | null>(null);

  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [demoResultDetail, setDemoResultDetail] = useState('');

  const prevAppStateRef = useRef(AppState.currentState);

  const refreshRuntimeState = useCallback(async () => {
    try {
      const [hookEnabledRaw, selectedMediaRaw, hookMediaPathRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.HOOK_ENABLED),
        AsyncStorage.getItem(STORAGE_KEYS.SELECTED_MEDIA),
        AsyncStorage.getItem(STORAGE_KEYS.HOOK_MEDIA_PATH),
      ]);
      setHookEnabledState(parseStoredBoolean(hookEnabledRaw, false));
      setSelectedMediaUri(parseStoredString(selectedMediaRaw));
      setHookMediaPath(parseStoredString(hookMediaPathRaw));
    } catch (error) {
      logger.warn('Failed to refresh runtime state', 'Onboarding', error);
    }
  }, []);

  const loadEntryState = useCallback(async () => {
    try {
      const [onboardingCompleteRaw, tutorialCompleteRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE),
        AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_V2_COMPLETE),
      ]);
      const setupReopen = parseStoredBoolean(onboardingCompleteRaw, false);
      const tutorialComplete = parseStoredBoolean(tutorialCompleteRaw, false);
      setIsSetupReopen(setupReopen);
      setTutorialVisible(setupReopen || !tutorialComplete);
      setTutorialSkippedThisSession(!setupReopen && tutorialComplete);
    } catch (error) {
      logger.warn('Failed to load onboarding flags', 'Onboarding', error);
      setIsSetupReopen(false);
      setTutorialVisible(true);
      setTutorialSkippedThisSession(false);
    } finally {
      setEntryReady(true);
    }
  }, []);

  const checkPerms = useCallback(async () => {
    setIsChecking(true);
    try {
      const perms = await checkAllPermissions();
      setPermissions(perms);
    } catch (error) {
      logger.error('Permission check failed', 'Onboarding', error);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([checkPerms(), refreshRuntimeState()]);
  }, [checkPerms, refreshRuntimeState]);

  useEffect(() => {
    void Promise.all([loadEntryState(), refreshAll()]);
  }, [loadEntryState, refreshAll]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (prevAppStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        void refreshAll();
      }
      prevAppStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, [refreshAll]);

  const markTutorialComplete = useCallback(async () => {
    if (isSetupReopen) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_V2_COMPLETE, 'true');
    } catch (error) {
      logger.warn('Failed to persist tutorial completion', 'Onboarding', error);
    }
  }, [isSetupReopen]);

  const handleProceed = async () => {
    if (isActionBusy) return;
    if (permissions && areAllPermissionsGranted(permissions)) {
      setIsActionBusy(true);
      try {
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.ONBOARDING_COMPLETE, 'true'],
          [STORAGE_KEYS.ONBOARDING_V2_COMPLETE, 'true'],
        ]);
        router.replace('/(tabs)');
      } catch (error) {
        logger.error('Failed to complete onboarding', 'Onboarding', error);
      } finally {
        setIsActionBusy(false);
      }
    }
  };

  const handleRequestCamera = async () => {
    if (isActionBusy) return;
    setIsActionBusy(true);
    try {
      await requestCameraPermission();
      await checkPerms();
    } catch (error) {
      logger.warn('Failed to request camera permission', 'Onboarding', error);
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleRequestAllFiles = async () => {
    if (isActionBusy) return;
    setIsActionBusy(true);
    try {
      await requestAllFilesAccess();
      await checkPerms();
    } catch (error) {
      logger.warn('Failed to request all-files access', 'Onboarding', error);
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleRequestOverlay = async () => {
    if (isActionBusy) return;
    setIsActionBusy(true);
    try {
      await requestOverlayPermission();
      await checkPerms();
    } catch (error) {
      logger.warn('Failed to request overlay permission', 'Onboarding', error);
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleOpenLSPosed = async () => {
    if (isActionBusy) return;
    setIsActionBusy(true);
    try {
      await openLSPosedManager();
    } catch (error) {
      logger.warn('Failed to open LSPosed manager', 'Onboarding', error);
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleOpenSettings = async () => {
    if (isActionBusy) return;
    setIsActionBusy(true);
    try {
      await openAppSettings();
    } catch (error) {
      logger.warn('Failed to open app settings', 'Onboarding', error);
    } finally {
      setIsActionBusy(false);
    }
  };
  const handleArmDemo = async () => {
    if (isActionBusy || demoState === 'verifying') return;
    setIsActionBusy(true);
    setDemoResultDetail('Preparing demo configuration...');
    try {
      const stagedPath =
        hookMediaPath ?? parseStoredString(await AsyncStorage.getItem(STORAGE_KEYS.HOOK_MEDIA_PATH));
      const useFileSource = Boolean(stagedPath);
      await writeBridgeConfig({
        enabled: true,
        cameraTarget: 'front',
        sourceMode: useFileSource ? 'file' : 'test',
        mediaSourcePath: useFileSource ? stagedPath : null,
      });
      await AsyncStorage.setItem(STORAGE_KEYS.HOOK_ENABLED, JSON.stringify(true));
      setHookEnabledState(true);
      setDemoState('armed');
      setDemoResultDetail(
        useFileSource
          ? `Demo armed with staged source: ${stagedPath}`
          : 'Demo armed in TEST mode. You can still set media in Studio.'
      );
      setTutorialStepIndex(prev => Math.max(prev, 4));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDemoState('fail');
      setDemoResultDetail(`Failed to arm demo: ${message}`);
      logger.error('Failed to arm demo', 'Onboarding', error);
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleOpenStockCamera = async () => {
    setDemoState('waiting_camera');
    setDemoResultDetail(
      'Open stock camera (com.android.camera), keep preview active for 2-3 seconds, then verify.'
    );
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Manual Step Required',
        'Open your stock camera app manually, then return and tap Verify Hooking.'
      );
      return;
    }
    try {
      await IntentLauncher.startActivityAsync('android.media.action.STILL_IMAGE_CAMERA');
    } catch (error) {
      logger.warn('Failed to launch stock camera intent', 'Onboarding', error);
      Alert.alert(
        'Open Camera Manually',
        'Could not launch camera intent. Open stock camera manually, then tap Verify Hooking.'
      );
    }
  };

  const handleVerifyHooking = async () => {
    if (demoState === 'verifying' || isActionBusy) return;
    setDemoState('verifying');
    setDemoResultDetail('Running diagnostics and hook verification...');
    try {
      const [report, rawInfo] = await Promise.all([runDiagnostics(), getRawXposedDebugInfo()]);
      const result = evaluateDemoResult(report, rawInfo);
      if (result.pass) {
        setDemoState('pass');
        setDemoResultDetail(result.detail);
        setTutorialStepIndex(5);
        await markTutorialComplete();
      } else {
        setDemoState('fail');
        setDemoResultDetail(result.detail);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDemoState('fail');
      setDemoResultDetail(`Verification failed: ${message}`);
      logger.error('Demo verification failed', 'Onboarding', error);
    }
  };

  const stepDone = useMemo(() => {
    const step1 = permissions
      ? permissions.rootAccess.status === 'granted' &&
        permissions.lsposedModule.status === 'granted'
      : false;
    const step2 = permissions
      ? permissions.allFilesAccess.status === 'granted' &&
        permissions.cameraPermission.status === 'granted' &&
        permissions.overlayPermission.status === 'granted'
      : false;
    const step3 = Boolean(hookMediaPath || selectedMediaUri);
    const step4 = hookEnabledState;
    const step5 = demoState === 'pass';
    return [step1, step2, step3, step4, step5, step5];
  }, [permissions, hookMediaPath, selectedMediaUri, hookEnabledState, demoState]);

  const maxUnlockedStep = useMemo(() => {
    let unlocked = 0;
    while (unlocked < TUTORIAL_STEPS.length - 1 && stepDone[unlocked]) unlocked += 1;
    return unlocked;
  }, [stepDone]);

  useEffect(() => {
    if (tutorialStepIndex > maxUnlockedStep) setTutorialStepIndex(maxUnlockedStep);
  }, [tutorialStepIndex, maxUnlockedStep]);

  const handleSelectStep = (index: number) => {
    if (index <= maxUnlockedStep || index <= tutorialStepIndex) {
      setTutorialStepIndex(index);
      return;
    }
    Alert.alert('Step Locked', 'Complete the current step first, or use Skip tutorial.');
  };

  const handleNextStep = () => {
    if (tutorialStepIndex >= TUTORIAL_STEPS.length - 1) return;
    if (!stepDone[tutorialStepIndex]) {
      Alert.alert('Complete Current Step', 'Finish this step first, or tap Skip tutorial.');
      return;
    }
    setTutorialStepIndex(prev => Math.min(prev + 1, TUTORIAL_STEPS.length - 1));
  };

  const handleSkipTutorial = async () => {
    if (isSetupReopen) {
      router.replace('/(tabs)');
      return;
    }
    setTutorialVisible(false);
    setTutorialSkippedThisSession(true);
    setTutorialStepIndex(0);
    await markTutorialComplete();
  };

  const allGranted = permissions ? areAllPermissionsGranted(permissions) : false;
  const showTutorial = (isSetupReopen || allGranted) && tutorialVisible && !tutorialSkippedThisSession;

  if (!permissions || !entryReady) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.electricBlue} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading setup state...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.electricBlue }]}>VirtuCam Setup</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Guided setup + deterministic hook demo
          </Text>
        </View>

        {showTutorial && (
          <View
            style={[
              styles.tutorialCard,
              { backgroundColor: colors.surfaceCard, borderColor: colors.border },
            ]}
          >
            <View style={styles.tutorialHead}>
              <Text style={[styles.tutorialTitle, { color: colors.textPrimary }]}>Setup Tutorial</Text>
              <Text style={[styles.tutorialStep, { color: colors.electricBlue }]}>
                {tutorialStepIndex + 1}/{TUTORIAL_STEPS.length}
              </Text>
            </View>

            <View style={styles.stepList}>
              {TUTORIAL_STEPS.map((step, index) => {
                const done = stepDone[index];
                const active = index === tutorialStepIndex;
                const locked = index > maxUnlockedStep && index > tutorialStepIndex;
                return (
                  <TouchableOpacity
                    key={step}
                    onPress={() => handleSelectStep(index)}
                    style={[
                      styles.stepRow,
                      {
                        borderColor: active
                          ? colors.electricBlue + '45'
                          : done
                            ? colors.success + '35'
                            : colors.border,
                        backgroundColor: active ? colors.surfaceLight : colors.surfaceCard,
                      },
                    ]}
                  >
                    <Text style={[styles.stepRowText, { color: colors.textPrimary }]}>
                      {index + 1}. {step}
                    </Text>
                    <Text
                      style={[
                        styles.stepRowState,
                        {
                          color: done
                            ? colors.success
                            : locked
                              ? colors.textTertiary
                              : colors.warningAmber,
                        },
                      ]}
                    >
                      {done ? 'DONE' : locked ? 'LOCKED' : 'PENDING'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.currentStepBox, { borderColor: colors.border }]}>
              {tutorialStepIndex === 0 && (
                <>
                  <Text style={[styles.stepBodyText, { color: colors.textSecondary }]}>Confirm root and LSPosed are both ready.</Text>
                  <View style={styles.pillRow}>
                    <StatusPill label="Root" status={permissions.rootAccess.status} />
                    <StatusPill label="LSPosed" status={permissions.lsposedModule.status} />
                  </View>
                  <View style={styles.actionsRow}>
                    <MiniActionButton icon="refresh" label="Refresh" onPress={refreshAll} />
                    <MiniActionButton icon="extension-puzzle" label="Open LSPosed" onPress={handleOpenLSPosed} />
                  </View>
                </>
              )}

              {tutorialStepIndex === 1 && (
                <>
                  <Text style={[styles.stepBodyText, { color: colors.textSecondary }]}>Grant files, camera, and overlay permissions.</Text>
                  <View style={styles.pillRow}>
                    <StatusPill label="Files" status={permissions.allFilesAccess.status} />
                    <StatusPill label="Camera" status={permissions.cameraPermission.status} />
                    <StatusPill label="Overlay" status={permissions.overlayPermission.status} />
                  </View>
                  <View style={styles.actionsRow}>
                    <MiniActionButton icon="folder-open" label="Grant Files" onPress={handleRequestAllFiles} />
                    <MiniActionButton icon="camera" label="Grant Camera" onPress={handleRequestCamera} />
                    <MiniActionButton icon="layers" label="Grant Overlay" onPress={handleRequestOverlay} />
                  </View>
                </>
              )}

              {tutorialStepIndex === 2 && (
                <>
                  <Text style={[styles.stepBodyText, { color: colors.textSecondary }]}> 
                    {hookMediaPath
                      ? `Staged hook path: ${hookMediaPath}`
                      : selectedMediaUri
                        ? `Selected media URI: ${selectedMediaUri}`
                        : 'No media selected yet. Open Studio and pick image/video.'}
                  </Text>
                  <View style={styles.actionsRow}>
                    <MiniActionButton icon="images" label="Open Studio" onPress={() => router.push('/(tabs)/config')} />
                    <MiniActionButton icon="refresh" label="Refresh" onPress={refreshAll} />
                  </View>
                </>
              )}

              {tutorialStepIndex === 3 && (
                <>
                  <Text style={[styles.stepBodyText, { color: colors.textSecondary }]}>Hook Enabled state: {hookEnabledState ? 'ON' : 'OFF'}</Text>
                  <View style={styles.actionsRow}>
                    <MiniActionButton icon="terminal" label="Open Command" onPress={() => router.push('/(tabs)')} />
                    <MiniActionButton icon="refresh" label="Refresh" onPress={refreshAll} />
                  </View>
                </>
              )}

              {tutorialStepIndex === 4 && (
                <>
                  <Text style={[styles.stepBodyText, { color: colors.textSecondary }]}>Run guided demo: arm config, open stock camera, verify hook evidence.</Text>
                  <View style={styles.actionsRow}>
                    <MiniActionButton icon="construct" label="Arm Demo" onPress={handleArmDemo} />
                    <MiniActionButton icon="camera" label="Open Camera" onPress={handleOpenStockCamera} />
                    <MiniActionButton
                      icon="shield-checkmark"
                      label={demoState === 'verifying' ? 'Verifying...' : 'Verify Hooking'}
                      onPress={handleVerifyHooking}
                      disabled={demoState === 'verifying'}
                    />
                  </View>
                  <View
                    style={[
                      styles.demoBox,
                      {
                        backgroundColor:
                          demoState === 'pass'
                            ? colors.success + '14'
                            : demoState === 'fail'
                              ? colors.danger + '14'
                              : colors.surfaceLight,
                        borderColor:
                          demoState === 'pass'
                            ? colors.success + '35'
                            : demoState === 'fail'
                              ? colors.danger + '35'
                              : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.demoState,
                        {
                          color:
                            demoState === 'pass'
                              ? colors.success
                              : demoState === 'fail'
                                ? colors.danger
                                : colors.electricBlue,
                        },
                      ]}
                    >
                      Demo State: {demoState.toUpperCase()}
                    </Text>
                    <Text style={[styles.stepBodyText, { color: colors.textSecondary }]}>
                      {demoResultDetail || 'No demo run yet.'}
                    </Text>
                  </View>
                </>
              )}

              {tutorialStepIndex === 5 && (
                <>
                  <Text style={[styles.stepBodyText, { color: colors.textSecondary }]}> 
                    {demoState === 'pass'
                      ? 'Demo passed. You are ready to use hook pipeline.'
                      : 'If demo failed, open diagnostics and resolve reported blockers.'}
                  </Text>
                  <View style={styles.actionsRow}>
                    <MiniActionButton icon="settings" label="Open Settings" onPress={() => router.push('/(tabs)/settings')} />
                    <MiniActionButton icon="terminal" label="Open Command" onPress={() => router.push('/(tabs)')} />
                  </View>
                </>
              )}
            </View>

            <View style={styles.navRow}>
              <TouchableOpacity
                onPress={() => setTutorialStepIndex(prev => Math.max(prev - 1, 0))}
                style={[styles.navButton, { borderColor: colors.border, backgroundColor: colors.surfaceLight }]}
                disabled={tutorialStepIndex === 0}
              >
                <Text
                  style={[
                    styles.navButtonText,
                    { color: tutorialStepIndex === 0 ? colors.textTertiary : colors.textSecondary },
                  ]}
                >
                  Back
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNextStep}
                style={[styles.navButton, { borderColor: colors.border, backgroundColor: colors.surfaceLight }]}
                disabled={tutorialStepIndex >= TUTORIAL_STEPS.length - 1}
              >
                <Text
                  style={[
                    styles.navButtonText,
                    {
                      color:
                        tutorialStepIndex >= TUTORIAL_STEPS.length - 1
                          ? colors.textTertiary
                          : colors.textSecondary,
                    },
                  ]}
                >
                  Next
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleSkipTutorial}
              style={[styles.skipButton, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
            >
              <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip tutorial</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.permissionsHeader}>
          <Text style={[styles.permissionsTitle, { color: colors.textPrimary }]}>Permission Checklist</Text>
          <Text style={[styles.permissionsSubtitle, { color: colors.textSecondary }]}>Real onboarding gate remains enforced here</Text>
        </View>

        <View style={styles.permissionList}>
          <PermissionItem
            label="Root Access"
            detail={permissions.rootAccess.detail}
            status={permissions.rootAccess.status}
            icon="shield-checkmark"
            onPress={permissions.rootAccess.canRequest ? handleOpenSettings : undefined}
            buttonLabel={permissions.rootAccess.canRequest ? 'Open Settings' : undefined}
          />
          <PermissionItem
            label="LSPosed Module"
            detail={permissions.lsposedModule.detail}
            status={permissions.lsposedModule.status}
            icon="extension-puzzle"
            onPress={permissions.lsposedModule.canRequest ? handleOpenLSPosed : undefined}
            buttonLabel={permissions.lsposedModule.canRequest ? 'Open LSPosed Manager' : undefined}
          />
          <PermissionItem
            label="All Files Access"
            detail={permissions.allFilesAccess.detail}
            status={permissions.allFilesAccess.status}
            icon="folder-open"
            onPress={permissions.allFilesAccess.canRequest ? handleRequestAllFiles : undefined}
            buttonLabel={permissions.allFilesAccess.canRequest ? 'Grant Permission' : undefined}
          />
          <PermissionItem
            label="Camera Permission"
            detail={permissions.cameraPermission.detail}
            status={permissions.cameraPermission.status}
            icon="camera"
            onPress={permissions.cameraPermission.canRequest ? handleRequestCamera : undefined}
            buttonLabel={permissions.cameraPermission.canRequest ? 'Grant Permission' : undefined}
          />
          <PermissionItem
            label="Overlay Permission"
            detail={permissions.overlayPermission.detail}
            status={permissions.overlayPermission.status}
            icon="layers"
            onPress={permissions.overlayPermission.canRequest ? handleRequestOverlay : undefined}
            buttonLabel={permissions.overlayPermission.canRequest ? 'Grant Permission' : undefined}
          />
        </View>

        <TouchableOpacity
          onPress={refreshAll}
          style={[styles.refreshButton, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
          disabled={isChecking}
        >
          {isChecking ? (
            <ActivityIndicator size="small" color={colors.electricBlue} />
          ) : (
            <Ionicons name="refresh" size={20} color={colors.electricBlue} />
          )}
          <Text style={[styles.refreshText, { color: colors.electricBlue }]}>
            {isChecking ? 'Checking...' : 'Refresh Status'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}> 
        <TouchableOpacity
          onPress={handleProceed}
          style={[
            styles.proceedButton,
            allGranted
              ? { backgroundColor: colors.electricBlue }
              : { backgroundColor: colors.surfaceLight, borderColor: colors.border, borderWidth: 1 },
          ]}
          disabled={!allGranted}
        >
          <Text style={[styles.proceedText, { color: allGranted ? '#FFFFFF' : colors.textTertiary }]}>
            {allGranted ? 'Proceed to App' : 'Grant All Permissions to Continue'}
          </Text>
          {allGranted && <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}
function statusColor(
  status: PermissionStatus,
  palette: { success: string; danger: string; warningAmber: string; textTertiary: string }
): string {
  switch (status) {
    case 'granted':
      return palette.success;
    case 'denied':
      return palette.danger;
    case 'pending':
      return palette.warningAmber;
    case 'checking':
      return palette.textTertiary;
    default:
      return palette.textTertiary;
  }
}

function MiniActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.miniButton,
        {
          backgroundColor: disabled ? colors.surfaceLight : colors.electricBlue + '18',
          borderColor: disabled ? colors.border : colors.electricBlue + '35',
        },
      ]}
    >
      <Ionicons name={icon} size={14} color={disabled ? colors.textTertiary : colors.electricBlue} />
      <Text style={[styles.miniButtonText, { color: disabled ? colors.textTertiary : colors.electricBlue }]}> 
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function StatusPill({
  label,
  status,
}: {
  label: string;
  status: PermissionStatus;
}) {
  const { colors } = useTheme();
  const color = statusColor(status, colors);
  return (
    <View style={[styles.pill, { backgroundColor: color + '14', borderColor: color + '35' }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{`${label}: ${status.toUpperCase()}`}</Text>
    </View>
  );
}

function PermissionItem({
  label,
  detail,
  status,
  icon,
  onPress,
  buttonLabel,
}: {
  label: string;
  detail: string;
  status: PermissionStatus;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  buttonLabel?: string;
}) {
  const { colors } = useTheme();
  const color = statusColor(status, colors);
  const statusIcon: keyof typeof Ionicons.glyphMap =
    status === 'granted'
      ? 'checkmark-circle'
      : status === 'denied'
        ? 'close-circle'
        : status === 'pending'
          ? 'alert-circle'
          : status === 'checking'
            ? 'hourglass'
            : 'help-circle';

  return (
    <View style={[styles.permissionItem, { backgroundColor: colors.surfaceCard, borderColor: color + '30' }]}> 
      <View style={styles.permissionHeader}>
        <View style={[styles.iconCircle, { backgroundColor: color + '18' }]}> 
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <View style={styles.permissionInfo}>
          <Text style={[styles.permissionLabel, { color: colors.textPrimary }]}>{label}</Text>
          <Text style={[styles.permissionDetail, { color }]}>{detail}</Text>
        </View>
        <Ionicons name={statusIcon} size={24} color={color} />
      </View>
      {onPress && buttonLabel && (
        <TouchableOpacity
          onPress={onPress}
          style={[
            styles.actionButton,
            { backgroundColor: colors.electricBlue + '18', borderColor: colors.electricBlue + '35' },
          ]}
        >
          <Text style={[styles.actionButtonText, { color: colors.electricBlue }]}>{buttonLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.electricBlue} />
        </TouchableOpacity>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxxl * 2,
    paddingBottom: Spacing.xxxl,
  },
  loadingText: { marginTop: Spacing.lg, fontSize: FontSize.md },
  header: { marginBottom: Spacing.xl },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  subtitle: { fontSize: FontSize.md, lineHeight: 22 },
  tutorialCard: {
    borderRadius: BorderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  tutorialHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tutorialTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  tutorialStep: { fontSize: FontSize.sm, fontWeight: '700' },
  stepList: { gap: Spacing.xs },
  stepRow: {
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepRowText: { flex: 1, fontSize: FontSize.sm, fontWeight: '600' },
  stepRowState: { fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 0.6 },
  currentStepBox: {
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  stepBodyText: { fontSize: FontSize.sm, lineHeight: 18 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  miniButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  miniButtonText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.3 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: FontSize.xs, fontWeight: '700' },
  demoBox: {
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  demoState: { fontSize: FontSize.sm, fontWeight: '800' },
  navRow: { flexDirection: 'row', gap: Spacing.sm },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
  },
  navButtonText: { fontSize: FontSize.sm, fontWeight: '700' },
  skipButton: {
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  skipText: { fontSize: FontSize.sm, fontWeight: '700' },
  permissionsHeader: { marginBottom: Spacing.md },
  permissionsTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  permissionsSubtitle: { marginTop: 2, fontSize: FontSize.sm, lineHeight: 18 },
  permissionList: { gap: Spacing.md, marginBottom: Spacing.xl },
  permissionItem: {
    borderRadius: BorderRadius.card,
    padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  permissionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionInfo: { flex: 1 },
  permissionLabel: { fontSize: FontSize.md, fontWeight: '700', marginBottom: 2 },
  permissionDetail: { fontSize: FontSize.sm, fontWeight: '600' },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionButtonText: { fontSize: FontSize.sm, fontWeight: '700' },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  refreshText: { fontSize: FontSize.md, fontWeight: '600' },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  proceedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.card,
  },
  proceedText: { fontSize: FontSize.lg, fontWeight: '700', letterSpacing: 0.5 },
});
