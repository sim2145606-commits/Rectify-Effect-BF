import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  NativeModules,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { Spacing, BorderRadius, FontSize } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { logger, type LogEntry } from '@/services/LogService';

const { VirtuCamSettings } = NativeModules;

export default function LogsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<LogEntry['level'] | 'all'>('all');
  const [includeSystemLogs, setIncludeSystemLogs] = useState(false);
  const [systemLogs, setSystemLogs] = useState<string>('');

  const applyFilters = useCallback(
    (logList: LogEntry[], query: string, level: LogEntry['level'] | 'all') => {
      let filtered = logList;
      if (level !== 'all') filtered = filtered.filter(log => log.level === level);
      if (query.trim()) {
        const lowerQuery = query.toLowerCase();
        filtered = filtered.filter(
          log =>
            log.message.toLowerCase().includes(lowerQuery) ||
            log.source?.toLowerCase().includes(lowerQuery)
        );
      }
      setFilteredLogs(filtered);
    },
    []
  );

  const loadLogs = useCallback(() => {
    try {
      const allLogs = logger.getLogs();
      setLogs(allLogs);
      applyFilters(allLogs, searchQuery, filterLevel);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (__DEV__) console.error('Failed to load logs:', errorMessage);
      Alert.alert('Error', `Failed to load logs: ${errorMessage}`);
      setLogs([]);
      setFilteredLogs([]);
    }
  }, [searchQuery, filterLevel, applyFilters]);

  useEffect(() => {
    loadLogs();
    const subscription = logger.subscribe(() => loadLogs());
    return () => subscription();
  }, [loadLogs]);

  useEffect(() => {
    applyFilters(logs, searchQuery, filterLevel);
  }, [logs, searchQuery, filterLevel]);

  const handleExport = async (share: boolean = false) => {
    try {
      setIsExporting(true);
      const filePath = await logger.exportLogs(share);
      Alert.alert('Success', `Logs exported successfully!\n\nSaved to: ${filePath}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Error', `Failed to export logs: ${message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyAll = async () => {
    try {
      const logText = await logger.formatLogsAsText();
      await Clipboard.setStringAsync(logText);
      Alert.alert('Success', 'All logs copied to clipboard!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Error', `Failed to copy logs: ${message}`);
    }
  };

  const handleCopyLog = async (log: LogEntry) => {
    try {
      const date = new Date(log.timestamp);
      const detailsStr = log.details !== undefined ? `\nDetails: ${JSON.stringify(log.details, null, 2)}` : '';
      const logText = `[${date.toLocaleString()}] [${log.level.toUpperCase()}]${log.source ? ` [${log.source}]` : ''}\n${log.message}${detailsStr}`;
      await Clipboard.setStringAsync(logText);
      Alert.alert('Success', 'Log entry copied to clipboard!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Error', `Failed to copy log: ${message}`);
    }
  };

  const handleClearLogs = () => {
    Alert.alert('Clear Logs', 'Are you sure you want to clear all application logs? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { logger.clear(); loadLogs(); } },
    ]);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    loadLogs();
    if (includeSystemLogs && VirtuCamSettings) {
      try {
        const result = await VirtuCamSettings.getXposedLogs();
        if (result.success) setSystemLogs(result.logs);
      } catch (error: unknown) {
        if (__DEV__) console.error('Failed to load system logs:', error instanceof Error ? error.message : String(error));
      }
    }
    setIsRefreshing(false);
  };

  const getLevelColor = (level: LogEntry['level']): string => {
    switch (level) {
      case 'error': return colors.danger;
      case 'warn': return colors.warningAmber;
      case 'success': return colors.success;
      case 'debug': return colors.textTertiary;
      case 'info':
      default: return colors.electricBlue;
    }
  };

  const getLevelIcon = (level: LogEntry['level']): keyof typeof Ionicons.glyphMap => {
    switch (level) {
      case 'error': return 'close-circle';
      case 'warn': return 'warning';
      case 'success': return 'checkmark-circle';
      case 'debug': return 'bug';
      case 'info':
      default: return 'information-circle';
    }
  };

  const errorCount = logger.getErrorCount();
  const warningCount = logger.getWarningCount();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Diagnostic Logs</Text>
          <View style={styles.statsContainer}>
            {errorCount > 0 && (
              <View style={styles.statBadge}>
                <Ionicons name="close-circle" size={14} color={colors.danger} />
                <Text style={[styles.statText, { color: colors.danger }]}>{errorCount}</Text>
              </View>
            )}
            {warningCount > 0 && (
              <View style={styles.statBadge}>
                <Ionicons name="warning" size={14} color={colors.warningAmber} />
                <Text style={[styles.statText, { color: colors.warningAmber }]}>{warningCount}</Text>
              </View>
            )}
            <Text style={[styles.statText, { color: colors.textSecondary }]}>{filteredLogs.length} logs</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={[styles.actionBar, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
            onPress={() => handleExport(false)}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color={colors.electricBlue} />
            ) : (
              <Ionicons name="save" size={18} color={colors.electricBlue} />
            )}
            <Text style={[styles.actionButtonText, { color: colors.electricBlue }]}>Save</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
            onPress={() => handleExport(true)}
            disabled={isExporting}
          >
            <Ionicons name="share" size={18} color={colors.electricBlue} />
            <Text style={[styles.actionButtonText, { color: colors.electricBlue }]}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
            onPress={handleCopyAll}
          >
            <Ionicons name="copy" size={18} color={colors.electricBlue} />
            <Text style={[styles.actionButtonText, { color: colors.electricBlue }]}>Copy All</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
            onPress={handleClearLogs}
          >
            <Ionicons name="trash" size={18} color={colors.danger} />
            <Text style={[styles.actionButtonText, { color: colors.danger }]}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
            onPress={() => setIncludeSystemLogs(prev => !prev)}
          >
            <Ionicons name={includeSystemLogs ? 'eye' : 'eye-off'} size={18} color={colors.electricBlue} />
            <Text style={[styles.actionButtonText, { color: colors.electricBlue }]}>
              {includeSystemLogs ? 'Hide Xposed' : 'Show Xposed'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Search and Filter */}
      <View style={[styles.filterContainer, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchContainer, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search logs..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {(['all', 'error', 'warn', 'info', 'success', 'debug'] as const).map(level => (
            <TouchableOpacity
              key={level}
              style={[
                styles.filterChip,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                filterLevel === level && {
                  backgroundColor: colors.electricBlue + '20',
                  borderColor: colors.electricBlue,
                },
              ]}
              onPress={() => setFilterLevel(level)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: filterLevel === level ? colors.electricBlue : colors.textSecondary },
                ]}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Logs List */}
      <ScrollView
        style={styles.logsList}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.electricBlue}
          />
        }
      >
        {filteredLogs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} />
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              {logs.length === 0 ? 'No logs available' : 'No logs match your filters'}
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: colors.textTertiary }]}>
              {logs.length === 0
                ? 'Logs will appear here as you use the app'
                : 'Try adjusting your search or filter'}
            </Text>
          </View>
        ) : (
          filteredLogs.map((log, index) => (
            <TouchableOpacity
              key={`${log.timestamp}-${index}`}
              style={[
                styles.logEntry,
                { backgroundColor: colors.surfaceCard, borderLeftColor: getLevelColor(log.level) },
              ]}
              onLongPress={() => handleCopyLog(log)}
            >
              <View style={styles.logHeader}>
                <View style={styles.logHeaderLeft}>
                  <Ionicons name={getLevelIcon(log.level)} size={16} color={getLevelColor(log.level)} />
                  <Text style={[styles.logLevel, { color: getLevelColor(log.level) }]}>
                    {log.level.toUpperCase()}
                  </Text>
                  {log.source && (
                    <View style={[styles.sourceTag, { backgroundColor: colors.electricBlue + '18' }]}>
                      <Text style={[styles.sourceText, { color: colors.electricBlue }]}>{log.source}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.logTime, { color: colors.textTertiary }]}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </Text>
              </View>
              <Text style={[styles.logMessage, { color: colors.textPrimary }]}>{log.message}</Text>
              {log.details !== undefined && (
                <View style={[styles.logDetails, { backgroundColor: colors.background }]}>
                  <Text style={[styles.logDetailsText, { color: colors.textSecondary }]}>
                    {typeof log.details === 'string'
                      ? log.details
                      : JSON.stringify(log.details, null, 2)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        {includeSystemLogs && systemLogs && (
          <View style={styles.systemLogsSection}>
            <Text style={[styles.systemLogsTitle, { color: colors.textPrimary }]}>System/Xposed Logs</Text>
            <View style={[styles.systemLogsContainer, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
              <Text style={[styles.systemLogsText, { color: colors.textSecondary }]}>{systemLogs}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    marginRight: Spacing.md,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 4,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  actionBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: Spacing.sm,
  },
  actionButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  filterContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: Spacing.sm,
  },
  filterChipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  logsList: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl * 2,
  },
  emptyStateText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginTop: Spacing.lg,
  },
  emptyStateSubtext: {
    fontSize: FontSize.md,
    marginTop: Spacing.xs,
  },
  logEntry: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderLeftWidth: 4,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  logHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  logLevel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sourceTag: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  sourceText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  logTime: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  logMessage: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  logDetails: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  logDetailsText: {
    fontSize: FontSize.xs,
    fontFamily: 'monospace',
  },
  systemLogsSection: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  systemLogsTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  systemLogsContainer: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  systemLogsText: {
    fontSize: FontSize.xs,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});
