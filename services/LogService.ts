import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/build/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/build/legacy/FileSystem.types';
import * as Sharing from 'expo-sharing';
import { getSystemInfo } from './SystemVerification';

const { VirtuCamSettings } = NativeModules;

export type LogEntry = {
  timestamp: number;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  source?: string; // Source of the log (e.g., 'ConfigBridge', 'PermissionManager')
  details?: any; // Additional details (error stack, data, etc.)
};

type LogListener = (entry: LogEntry) => void;

const MAX_LOGS = 1000; // Keep last 1000 logs in memory

class LogService {
  private listeners: Set<LogListener> = new Set();
  private logs: LogEntry[] = [];

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    // Provide the new listener with all existing logs
    this.logs.forEach(log => listener(log));
    return () => this.listeners.delete(listener);
  }

  log(message: string, level: LogEntry['level'] = 'info', source?: string, details?: any) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      message,
      level,
      source,
      details,
    };
    
    this.logs.push(entry);
    
    // Keep only last MAX_LOGS entries
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS);
    }
    
    this.listeners.forEach(listener => listener(entry));
    
    // Also log to console for debugging
    const consoleMsg = `[${level.toUpperCase()}]${source ? ` [${source}]` : ''} ${message}`;
    switch (level) {
      case 'error':
        console.error(consoleMsg, details || '');
        break;
      case 'warn':
        console.warn(consoleMsg, details || '');
        break;
      case 'debug':
        console.debug(consoleMsg, details || '');
        break;
      default:
        console.log(consoleMsg, details || '');
    }
  }

  info(message: string, source?: string, details?: any) {
    this.log(message, 'info', source, details);
  }

  warn(message: string, source?: string, details?: any) {
    this.log(message, 'warn', source, details);
  }

  error(message: string, source?: string, details?: any) {
    this.log(message, 'error', source, details);
  }

  success(message: string, source?: string, details?: any) {
    this.log(message, 'success', source, details);
  }

  debug(message: string, source?: string, details?: any) {
    this.log(message, 'debug', source, details);
  }
  
  clear() {
    this.logs = [];
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getLogCount(): number {
    return this.logs.length;
  }

  /**
   * Format logs as text with system information
   */
  async formatLogsAsText(): Promise<string> {
    const lines: string[] = [];
    
    // Header
    lines.push('='.repeat(60));
    lines.push('VirtuCam Diagnostic Log');
    lines.push('='.repeat(60));
    lines.push('');
    
    // Timestamp
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Local Time: ${new Date().toLocaleString()}`);
    lines.push('');
    
    // System Information
    lines.push('-'.repeat(60));
    lines.push('SYSTEM INFORMATION');
    lines.push('-'.repeat(60));
    
    try {
      const systemInfo = await getSystemInfo();
      if (systemInfo) {
        lines.push(`Device: ${systemInfo.manufacturer} ${systemInfo.model}`);
        lines.push(`Brand: ${systemInfo.brand}`);
        lines.push(`Product: ${systemInfo.product}`);
        lines.push(`Android Version: ${systemInfo.androidVersion} (SDK ${systemInfo.sdkLevel})`);
        lines.push(`Build: ${systemInfo.buildNumber}`);
        lines.push(`Security Patch: ${systemInfo.securityPatch}`);
        lines.push(`Kernel: ${systemInfo.kernelVersion}`);
        lines.push(`SELinux: ${systemInfo.selinuxStatus}`);
        lines.push(`ABI: ${systemInfo.abiList}`);
        lines.push(`Storage: ${systemInfo.storage}`);
        lines.push(`Max Memory: ${systemInfo.maxMemory}`);
        lines.push(`Root Solution: ${systemInfo.rootSolution} ${systemInfo.rootVersion}`);
      }
    } catch (error) {
      lines.push('Failed to retrieve system information');
    }
    
    lines.push('');
    
    // App Information
    lines.push('-'.repeat(60));
    lines.push('APP INFORMATION');
    lines.push('-'.repeat(60));
    lines.push(`Platform: ${Platform.OS} ${Platform.Version}`);
    lines.push(`Total Logs: ${this.logs.length}`);
    lines.push('');
    
    // Logs
    lines.push('-'.repeat(60));
    lines.push('APPLICATION LOGS');
    lines.push('-'.repeat(60));
    lines.push('');
    
    if (this.logs.length === 0) {
      lines.push('No logs available');
    } else {
      this.logs.forEach((entry, index) => {
        const date = new Date(entry.timestamp);
        const timeStr = date.toLocaleTimeString();
        const levelStr = entry.level.toUpperCase().padEnd(7);
        const sourceStr = entry.source ? `[${entry.source}]` : '';
        
        lines.push(`[${index + 1}] ${timeStr} ${levelStr} ${sourceStr}`);
        lines.push(`    ${entry.message}`);
        
        if (entry.details) {
          try {
            const detailsStr = typeof entry.details === 'string'
              ? entry.details
              : JSON.stringify(entry.details, null, 2);
            lines.push(`    Details: ${detailsStr}`);
          } catch {
            lines.push(`    Details: [Unable to serialize]`);
          }
        }
        
        lines.push('');
      });
    }
    
    // Footer
    lines.push('='.repeat(60));
    lines.push('End of Log');
    lines.push('='.repeat(60));
    
    return lines.join('\n');
  }

  /**
   * Export logs to a file and optionally share
   */
  async exportLogs(share: boolean = false): Promise<string> {
    try {
      const logText = await this.formatLogsAsText();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `virtucam_log_${timestamp}.txt`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(filePath, logText, {
        encoding: EncodingType.UTF8,
      });
      
      this.success(`Logs exported to ${fileName}`, 'LogService');
      
      if (share && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/plain',
          dialogTitle: 'Share VirtuCam Logs',
        });
      }
      
      return filePath;
    } catch (error: any) {
      this.error(`Failed to export logs: ${error.message}`, 'LogService', error);
      throw error;
    }
  }

  /**
   * Get logs filtered by level
   */
  getLogsByLevel(level: LogEntry['level']): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Get logs filtered by source
   */
  getLogsBySource(source: string): LogEntry[] {
    return this.logs.filter(log => log.source === source);
  }

  /**
   * Get logs within a time range
   */
  getLogsByTimeRange(startTime: number, endTime: number): LogEntry[] {
    return this.logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime);
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.logs.filter(log => log.level === 'error').length;
  }

  /**
   * Get warning count
   */
  getWarningCount(): number {
    return this.logs.filter(log => log.level === 'warn').length;
  }
}

export const logger = new LogService();

// Log app startup
logger.info('VirtuCam application started', 'App');
