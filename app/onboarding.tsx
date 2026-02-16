import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  AppState,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, BorderRadius, FontSize, STORAGE_KEYS } from '@/constants/theme';
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

export default function OnboardingScreen() {
  const router = useRouter();
  const [permissions, setPermissions] = useState<AllPermissionsState | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);

  // Check permissions on mount and when app becomes active
  const checkPerms = useCallback(async () => {
    setIsChecking(true);
    try {
      const perms = await checkAllPermissions();
      setPermissions(perms);
    } catch (error) {
      console.error('Permission check failed:', error);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkPerms();
  }, [checkPerms]);

  // Re-check permissions when app becomes active (user returns from settings)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        checkPerms();
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [appState, checkPerms]);

  const handleRequestCamera = async () => {
    await requestCameraPermission();
    await checkPerms();
  };

  const handleRequestAllFiles = async () => {
    await requestAllFilesAccess();
    // Permission will be re-checked when app becomes active
  };

  const handleRequestOverlay = async () => {
    await requestOverlayPermission();
    // Permission will be re-checked when app becomes active
  };

  const handleOpenLSPosed = async () => {
    await openLSPosedManager();
  };

  const handleOpenSettings = async () => {
    await openAppSettings();
  };

  const handleProceed = async () => {
    if (permissions && areAllPermissionsGranted(permissions)) {
      await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
      router.replace('/(tabs)');
    }
  };

  const allGranted = permissions ? areAllPermissionsGranted(permissions) : false;

  if (!permissions) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.electricBlue} />
        <Text style={styles.loadingText}>Checking system permissions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>VirtuCam Setup</Text>
          <Text style={styles.subtitle}>
            All permissions must be granted to proceed
          </Text>
        </View>

        {/* Permission Checklist */}
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
            buttonLabel={
              permissions.lsposedModule.canRequest ? 'Open LSPosed Manager' : undefined
            }
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

        {/* Refresh Button */}
        <TouchableOpacity
          onPress={checkPerms}
          style={styles.refreshButton}
          disabled={isChecking}
        >
          {isChecking ? (
            <ActivityIndicator size="small" color={Colors.electricBlue} />
          ) : (
            <Ionicons name="refresh" size={20} color={Colors.electricBlue} />
          )}
          <Text style={styles.refreshText}>
            {isChecking ? 'Checking...' : 'Refresh Status'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Proceed Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleProceed}
          style={[styles.proceedButton, !allGranted && styles.proceedButtonDisabled]}
          disabled={!allGranted}
        >
          <Text
            style={[styles.proceedText, !allGranted && styles.proceedTextDisabled]}
          >
            {allGranted ? 'Proceed to App' : 'Grant All Permissions to Continue'}
          </Text>
          {allGranted && (
            <Ionicons name="arrow-forward" size={20} color={Colors.textPrimary} />
          )}
        </TouchableOpacity>
      </View>
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
  const getStatusColor = () => {
    switch (status) {
      case 'granted':
        return Colors.success;
      case 'denied':
        return Colors.danger;
      case 'pending':
        return Colors.warningAmber;
      case 'checking':
        return Colors.textTertiary;
      default:
        return Colors.textTertiary;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'granted':
        return 'checkmark-circle';
      case 'denied':
        return 'close-circle';
      case 'pending':
        return 'alert-circle';
      case 'checking':
        return 'hourglass';
      default:
        return 'help-circle';
    }
  };

  const statusColor = getStatusColor();
  const statusIcon = getStatusIcon();

  return (
    <View style={[styles.permissionItem, { borderColor: statusColor + '30' }]}>
      <View style={styles.permissionHeader}>
        <View style={[styles.iconCircle, { backgroundColor: statusColor + '15' }]}>
          <Ionicons name={icon} size={20} color={statusColor} />
        </View>
        <View style={styles.permissionInfo}>
          <Text style={styles.permissionLabel}>{label}</Text>
          <Text style={[styles.permissionDetail, { color: statusColor }]}>{detail}</Text>
        </View>
        <Ionicons name={statusIcon as any} size={24} color={statusColor} />
      </View>

      {onPress && buttonLabel && (
        <TouchableOpacity onPress={onPress} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>{buttonLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.electricBlue} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxxl * 2,
    paddingBottom: Spacing.xxxl,
  },
  loadingText: {
    marginTop: Spacing.lg,
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  header: {
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.electricBlue,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  permissionList: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  permissionItem: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1.5,
  },
  permissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionInfo: {
    flex: 1,
  },
  permissionLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  permissionDetail: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.electricBlue + '15',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.electricBlue + '30',
  },
  actionButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.electricBlue,
    letterSpacing: 0.5,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  refreshText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.electricBlue,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  proceedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.electricBlue,
  },
  proceedButtonDisabled: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  proceedText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  proceedTextDisabled: {
    color: Colors.textTertiary,
  },
});
