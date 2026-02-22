import { useState, useEffect, useCallback, useRef } from 'react';
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

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [permissions, setPermissions] = useState<AllPermissionsState | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const prevAppStateRef = useRef(AppState.currentState);

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
    void checkPerms();
  }, [checkPerms]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (prevAppStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        void checkPerms();
      }
      prevAppStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, [checkPerms]);

  const handleRequestCamera = async () => {
    await requestCameraPermission();
    await checkPerms();
  };

  const handleRequestAllFiles = async () => {
    await requestAllFilesAccess();
  };

  const handleRequestOverlay = async () => {
    await requestOverlayPermission();
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.electricBlue} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Checking system permissions...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.electricBlue }]}>VirtuCam Setup</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            All permissions must be granted to proceed
          </Text>
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
          onPress={checkPerms}
          style={[
            styles.refreshButton,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
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
          <Text
            style={[
              styles.proceedText,
              { color: allGranted ? '#FFFFFF' : colors.textTertiary },
            ]}
          >
            {allGranted ? 'Proceed to App' : 'Grant All Permissions to Continue'}
          </Text>
          {allGranted && <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />}
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
  const { colors } = useTheme();

  const getStatusColor = (): string => {
    switch (status) {
      case 'granted': return colors.success;
      case 'denied': return colors.danger;
      case 'pending': return colors.warningAmber;
      case 'checking': return colors.textTertiary;
      default: return colors.textTertiary;
    }
  };

  const getStatusIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'granted': return 'checkmark-circle';
      case 'denied': return 'close-circle';
      case 'pending': return 'alert-circle';
      case 'checking': return 'hourglass';
      default: return 'help-circle';
    }
  };

  const statusColor = getStatusColor();
  const statusIcon = getStatusIcon();

  return (
    <View
      style={[
        styles.permissionItem,
        { backgroundColor: colors.surfaceCard, borderColor: statusColor + '30' },
      ]}
    >
      <View style={styles.permissionHeader}>
        <View style={[styles.iconCircle, { backgroundColor: statusColor + '18' }]}>
          <Ionicons name={icon} size={20} color={statusColor} />
        </View>
        <View style={styles.permissionInfo}>
          <Text style={[styles.permissionLabel, { color: colors.textPrimary }]}>{label}</Text>
          <Text style={[styles.permissionDetail, { color: statusColor }]}>{detail}</Text>
        </View>
        <Ionicons name={statusIcon} size={24} color={statusColor} />
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
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxxl * 2,
    paddingBottom: Spacing.xxxl,
  },
  loadingText: {
    marginTop: Spacing.lg,
    fontSize: FontSize.md,
  },
  header: {
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  permissionList: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  permissionItem: {
    borderRadius: BorderRadius.card,
    padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  refreshText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
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
  proceedText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
