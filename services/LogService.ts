export type LogEntry = {
  timestamp: number;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
};

type LogListener = (entry: LogEntry) => void;

class LogService {
  private listeners: Set<LogListener> = new Set();
  private logs: LogEntry[] = [];

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    // Provide the new listener with all existing logs
    this.logs.forEach(log => listener(log));
    return () => this.listeners.delete(listener);
  }

  log(message: string, level: LogEntry['level'] = 'info') {
    const entry: LogEntry = {
      timestamp: Date.now(),
      message,
      level,
    };
    this.logs.push(entry);
    this.listeners.forEach(listener => listener(entry));
  }

  info(message: string) {
    this.log(message, 'info');
  }

  warn(message: string) {
    this.log(message, 'warn');
  }

  error(message: string) {
    this.log(message, 'error');
  }

  success(message: string) {
    this.log(message, 'success');
  }
  
  clear() {
    this.logs = [];
    // Notify listeners that logs have been cleared if needed
  }
}

export const logger = new LogService();
