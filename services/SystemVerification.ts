/**
 * SystemVerification.ts
 * Provides status color and icon mapping for system verification checks
 */

export type SystemCheckStatus = 'ok' | 'warning' | 'error' | 'loading';

/**
 * Get the color associated with a system check status
 */
export function getStatusColor(status: SystemCheckStatus): string {
  const colors: Record<SystemCheckStatus, string> = {
    ok: '#4CAF50',
    warning: '#FF9800',
    error: '#F44336',
    loading: '#9E9E9E',
  };
  return colors[status];
}

/**
 * Get the icon name associated with a system check status
 * Returns Ionicons icon names
 */
export function getStatusIcon(status: SystemCheckStatus): string {
  const icons: Record<SystemCheckStatus, string> = {
    ok: 'checkmark-circle',
    warning: 'warning',
    error: 'close-circle',
    loading: 'hourglass',
  };
  return icons[status];
}
