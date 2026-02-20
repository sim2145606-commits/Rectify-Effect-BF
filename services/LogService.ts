import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getSystemInfo } from './SystemVerification';

export type LogEntry = {
  timestamp: number;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  source?: string;
  details?: unknown;
};

type LogListener = (entry: LogEntry) => void;

const MAX_LOGS = 1000;

class LogService {
  private listeners: Set<LogListener> = new Set();
  private logs: LogEntry[] = [];

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    this.logs.forEach(log => listener(log));
    return () => this.listeners.delete(listener);
  }

  log(
    message: string,
    level: LogEntry['level'] = 'info',
    source?: string,
    details?: unknown
  ) {
    const sanitizedMessage = message.replace(/[\r\n]/g, ' ');
    const sanitizedSource = source?.replace(/[\r\n]/g, ' ');

    const entry: LogEntry = {
      timestamp: Date.now(),
      message: sanitizedMessage,
      level,
      source: sanitizedSource,
      details,
    };

    this.logs.push(entry);

    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS);
    }

    this.listeners.forEach(listener => listener(entry));

    const consoleMsg = `[${level.toUpperCase()}]${sanitizedSource ? ` [${sanitizedSource}]` : ''} ${sanitizedMessage}`;
    const sanitizedDetails =
      typeof details === 'string' ? details.replace(/[\r\n]/g, ' ') : details;

    if (__DEV__) {
      switch (level) {
        case 'error':
          console.error(consoleMsg, sanitizedDetails ?? '');
          break;
        case 'warn':
          console.warn(consoleMsg, sanitizedDetails ?? '');
          break;
        case 'debug':
          console.debug(consoleMsg, sanitizedDetails ?? '');
          break;
        default:
          console.log(consoleMsg, sanitizedDetails ?? '');
      }
    }
  }

  info(message: string, source?: string, details?: unknown) {
    this.log(message, 'info', source, details);
  }

  warn(message: string, source?: string, details?: unknown) {
    this.log(message, 'warn', source, details);
  }

  error(message: string, source?: string, details?: unknown) {
    this.log(message, 'error', source, details);
  }

  success(message: string, source?: string, details?: unknown) {
    this.log(message, 'success', source, details);
  }

  debug(message: string, source?: string, details?: unknown) {
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

  async formatLogsAsText(): Promise<string> {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('VirtuCam Diagnostic Log');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Local Time: ${new Date().toLocaleString()}`);
    lines.push('');
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
    } catch {
      lines.push('Failed to retrieve system information');
    }

    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('APP INFORMATION');
    lines.push('-'.repeat(60));
    lines.push(`Platform: ${Platform.OS} ${Platform.Version}`);
    lines.push(`Total Logs: ${this.logs.length}`);
    lines.push('');
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

        if (entry.details !== undefined) {
          try {
            const detailsStr =
              typeof entry.details === 'string'
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

    lines.push('='.repeat(60));
    lines.push('End of Log');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  async exportLogs(share: boolean = false): Promise<string> {
    try {
      const logText = await this.formatLogsAsText();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `virtucam_log_${timestamp}.txt`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, logText, {
        encoding: 'utf8',
      });

      this.success(`Logs exported to ${fileName}`, 'LogService');

      if (share && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/plain',
          dialogTitle: 'Share VirtuCam Logs',
        });
      }

      return filePath;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.error(`Failed to export logs: ${message}`, 'LogService', err);
      throw err;
    }
  }

  getLogsByLevel(level: LogEntry['level']): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  getLogsBySource(source: string): LogEntry[] {
    return this.logs.filter(log => log.source === source);
  }

  getLogsByTimeRange(startTime: number, endTime: number): LogEntry[] {
    return this.logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime);
  }

  getErrorCount(): number {
    return this.logs.filter(log => log.level === 'error').length;
  }

  getWarningCount(): number {
    return this.logs.filter(log => log.level === 'warn').length;
  }
}

export const logger = new LogService();

logger.info('VirtuCam application started', 'App');
