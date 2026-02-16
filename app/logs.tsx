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
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/theme';
import { logger, type LogEntry } from '@/services/LogService';

const { VirtuCamSettings } = NativeModules;

export default function LogsScreen() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<LogEntry['level'] | 'all'>('all');
  const [includeSystemLogs, setIncludeSystemLogs] = useState(false);
  const [systemLogs, setSystemLogs] = useState<string>('');

  const loadLogs = useCallback(() => {
    const allLogs = logger.getLogs();
    setLogs(allLogs);
    applyFilters(allLogs, searchQuery, filterLevel);
  }, [searchQuery, filterLevel]);

  const applyFilters = (
    logList: LogEntry[],
    query: string,
    level: LogEntry['level'] | 'all'
  ) => {
    let filtered = logList;

    // Filter by level
    if (level !== 'all') {
      filtered = filtered.filter((log) => log.level === level);
    }

    // Filter by search query
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.message.toLowerCase().includes(lowerQuery) ||
          log.source?.toLowerCase().includes(lowerQuery)
      );
    }

    setFilteredLogs(filtered);
  };

  useEffect(() => {
    loadLogs();
    const unsubscribe = logger.subscribe(() => {
      loadLogs();
    });
    return unsubscribe;
  }, [loadLogs]);

  useEffect(() => {
    applyFilters(logs, searchQuery, filterLevel);
  }, [logs, searchQuery, filterLevel]);

  const handleExport = async (share: boolean = false) => {
    try {
      setIsExporting(true);
      const filePath = await logger.exportLogs(share);
      Alert.alert(
        'Success',
        `Logs exported successfully!\n\nSaved to: ${filePath}`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      Alert.alert('Error', `Failed to export logs: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyAll = async () => {
    try {
      const logText = await logger.formatLogsAsText();
      await Clipboard.setStringAsync(logText);
      Alert.alert('Success', 'All logs copied to clipboard!');
    } catch (error: any) {
      Alert.alert('Error', `Failed to copy logs: ${error.message}`);
    }
  };

  const handleCopyLog = async (log: LogEntry) => {
    try {
      const date = new Date(log.timestamp);
      const logText = `[${date.toLocaleString()}] [${log.level.toUpperCase()}]${
        log.source ? ` [${log.source}]` : ''
      }\n${log.message}${log.details ? `\nDetails: ${JSON.stringify(log.details, null, 2)}` : ''}`;
      await Clipboard.setStringAsync(logText);
      Alert.alert('Success', 'Log entry copied to clipboard!');
    } catch (error: any) {
      Alert.alert('Error', `Failed to copy log: ${error.message}`);
    }
  };

  const handleClearLogs = () => {
    Alert.alert(
      'Clear Logs',
      'Are you sure you want to clear all application logs? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            logger.clear();
            loadLogs();
          },
        },
      ]
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    loadLogs();
    
    // Load system logs if enabled
    if (includeSystemLogs && VirtuCamSettings) {
      try {
        const result = await VirtuCamSettings.getXposedLogs();
        if (result.success) {
          setSystemLogs(result.logs);
        }
      } catch (error) {
        console.error('Failed to load system logs:', error);
      }
    }
    
    setIsRefreshing(false);
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return Colors.danger;
      case 'warn':
        return Colors.warningAmber;
      case 'success':
        return Colors.success;
      case 'debug':
        return Colors.textTertiary;
      case 'info':
      default:
        return Colors.electricBlue;
    }
  };

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'close-circle';
      case 'warn':
        return 'warning';
      case 'success':
        return 'checkmark-circle';
      case 'debug':
        return 'bug';
      case 'info':
      default:
        return 'information-circle';
    }
  };

  const errorCount = logger.getErrorCount();
  const warningCount = logger.getWarningCount();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Diagnostic Logs</Text>
          <View style={styles.statsContainer}>
            {errorCount > 0 && (
              <View style={styles.statBadge}>
                <Ionicons name="close-circle" size={14} color={Colors.danger} />
                <Text style={[styles.statText, { color: Colors.danger }]}>{errorCount}</Text>
              </View>
            )}
            {warningCount > 0 && (
              <View style={styles.statBadge}>
                <Ionicons name="warning" size={14} color={Colors.warningAmber} />
                <Text style={[styles.statText, { color: Colors.warningAmber }]}>
                  {warningCount}
                </Text>
              </View>
            )}
            <Text style={styles.statText}>{filteredLogs.length} logs</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleExport(false)}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color={Colors.electricBlue} />
            ) : (
              <Ionicons name="save" size={18} color={Colors.electricBlue} />
            )}
            <Text style={styles.actionButtonText}>Save</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleExport(true)}
            disabled={isExporting}
          >
            <Ionicons name="share" size={18} color={Colors.electricBlue} />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleCopyAll}>
            <Ionicons name="copy" size={18} color={Colors.electricBlue} />
            <Text style={styles.actionButtonText}>Copy All</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleClearLogs}>
            <Ionicons name="trash" size={18} color={Colors.danger} />
            <Text style={[styles.actionButtonText, { color: Colors.danger }]}>Clear</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Search and Filter */}
      <View style={styles.filterContainer}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search logs..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {(['all', 'error', 'warn', 'info', 'success', 'debug'] as const).map((level) => (
            <TouchableOpacity
              key={level}
              style={[
                styles.filterChip,
                filterLevel === level && styles.filterChipActive,
              ]}
              onPress={() => setFilterLevel(level)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterLevel === level && styles.filterChipTextActive,
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
            tintColor={Colors.electricBlue}
          />
        }
      >
        {filteredLogs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color={Colors.textTertiary} />
            <Text style={styles.emptyStateText}>
              {logs.length === 0 ? 'No logs available' : 'No logs match your filters'}
            </Text>
            <Text style={styles.emptyStateSubtext}>
              {logs.length === 0
                ? 'Logs will appear here as you use the app'
                : 'Try adjusting your search or filter'}
            </Text>
          </View>
        ) : (
          filteredLogs.map((log, index) => (
            <TouchableOpacity
              key={`${log.timestamp}-${index}`}
              style={[styles.logEntry, { borderLeftColor: getLevelColor(log.level) }]}
              onLongPress={() => handleCopyLog(log)}
            >
              <View style={styles.logHeader}>
                <View style={styles.logHeaderLeft}>
                  <Ionicons
                    name={getLevelIcon(log.level) as any}
                    size={16}
                    color={getLevelColor(log.level)}
                  />
                  <Text style={[styles.logLevel, { color: getLevelColor(log.level) }]}>
                    {log.level.toUpperCase()}
                  </Text>
                  {log.source && (
                    <View style={styles.sourceTag}>
                      <Text style={styles.sourceText}>{log.source}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.logTime}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </Text>
              </View>
              <Text style={styles.logMessage}>{log.message}</Text>
              {log.details && (
                <View style={styles.logDetails}>
                  <Text style={styles.logDetailsText}>
                    {typeof log.details === 'string'
                      ? log.details
                      : JSON.stringify(log.details, null, 2)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        {/* System Logs Section */}
        {includeSystemLogs && systemLogs && (
          <View style={styles.systemLogsSection}>
            <Text style={styles.systemLogsTitle}>System/Xposed Logs</Text>
            <View style={styles.systemLogsContainer}>
              <Text style={styles.systemLogsText}>{systemLogs}</Text>
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
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    color: Colors.textPrimary,
    letterSpacing: 1,
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
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  actionBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  actionButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.electricBlue,
  },
  filterContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  filterChipActive: {
    backgroundColor: Colors.electricBlue + '20',
    borderColor: Colors.electricBlue,
  },
  filterChipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.electricBlue,
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
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
  },
  emptyStateSubtext: {
    fontSize: FontSize.md,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },
  logEntry: {
    backgroundColor: Colors.surface,
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
    backgroundColor: Colors.electricBlue + '15',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  sourceText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.electricBlue,
  },
  logTime: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  logMessage: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  logDetails: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
  },
  logDetailsText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
  },
  systemLogsSection: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  systemLogsTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  systemLogsContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  systemLogsText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});
