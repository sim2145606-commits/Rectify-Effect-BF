# VirtuCam Diagnostic Logging System

## Overview

A comprehensive real-time logging system with error tracking, system information capture, and export capabilities for debugging and user support.

## Features

### 1. **Enhanced LogService** (`services/LogService.ts`)

- Real-time log collection with automatic memory management (keeps last 1000 logs)
- Multiple log levels: `info`, `warn`, `error`, `success`, `debug`
- Source tracking for identifying log origin
- Detailed error information capture
- System information integration
- Export to formatted text files
- Share functionality
- Filter by level, source, or time range
- Statistics (error count, warning count)

### 2. **Native Module Integration** (`VirtuCamSettingsModule.kt`)

Added three new methods:

- `getXposedLogs()` - Retrieves Xposed/LSPosed related logs from logcat
- `getSystemLogs(lineCount)` - Gets system logcat entries
- `clearSystemLogs()` - Clears logcat buffer

### 3. **Log Viewer Screen** (`app/logs.tsx`)

Full-featured diagnostic interface:

- **Real-time updates** - Logs appear instantly as they're generated
- **Search functionality** - Filter logs by text
- **Level filtering** - Filter by info, warn, error, success, debug
- **Export options**:
  - Save to file
  - Share via system share sheet
  - Copy all logs to clipboard
  - Copy individual log entries
- **Visual indicators**:
  - Color-coded by severity
  - Icons for each log level
  - Error and warning counts in header
  - Source tags for identifying origin
- **System logs integration** - Optional display of Xposed/system logs
- **Pull-to-refresh** - Manual refresh capability
- **Long-press to copy** - Quick copy of individual entries

### 4. **Settings Integration**

Added "Diagnostic Logs" button in the About section of Settings tab for easy access.

## Usage

### For Developers

#### Basic Logging

```typescript
import { logger } from '@/services/LogService';

// Simple logging
logger.info('Configuration loaded');
logger.warn('Media file not found');
logger.error('Failed to connect');
logger.success('Settings saved');
logger.debug('Frame processed', 'CameraHook');

// With source and details
logger.error('Failed to write config', 'ConfigBridge', {
  error: error.message,
  stack: error.stack,
});
```

#### Export Logs Programmatically

```typescript
import { logger } from '@/services/LogService';

// Export to file
const filePath = await logger.exportLogs(false);

// Export and share
await logger.exportLogs(true);

// Get formatted text
const logText = await logger.formatLogsAsText();
```

#### Filter Logs

```typescript
// Get all errors
const errors = logger.getLogsByLevel('error');

// Get logs from specific source
const configLogs = logger.getLogsBySource('ConfigBridge');

// Get logs in time range
const recentLogs = logger.getLogsByTimeRange(
  Date.now() - 3600000, // 1 hour ago
  Date.now()
);
```

### For Users

1. **Access Logs**:
   - Open VirtuCam app
   - Go to Settings tab
   - Scroll to "About VirtuCam" section
   - Tap "Diagnostic Logs"

2. **View Logs**:
   - See real-time logs as they appear
   - Use search bar to find specific entries
   - Filter by level (All, Error, Warn, Info, Success, Debug)
   - Pull down to refresh

3. **Export Logs**:
   - Tap "Save" to save logs to device storage
   - Tap "Share" to share via messaging apps, email, etc.
   - Tap "Copy All" to copy to clipboard
   - Long-press any log entry to copy just that entry

4. **Share with Support**:
   - Tap "Share" button
   - Select your preferred method (Email, Telegram, etc.)
   - Send to support team for analysis

## Log Format

### Individual Log Entry

```
[Timestamp] [LEVEL] [Source]
    Message
    Details: { ... }
```

### Exported Log File

```
============================================================
VirtuCam Diagnostic Log
============================================================

Generated: 2026-02-16T17:30:00.000Z
Local Time: 2/16/2026, 5:30:00 PM

------------------------------------------------------------
SYSTEM INFORMATION
------------------------------------------------------------
Device: Samsung Galaxy S21
Brand: samsung
Product: SM-G991B
Android Version: 13 (SDK 33)
Build: TP1A.220624.014
Security Patch: 2024-01-01
Kernel: 5.10.43-android12-9-00001-gf9e9c8b7e8c8
SELinux: Enforcing
ABI: arm64-v8a, armeabi-v7a, armeabi
Storage: 45 GB free / 128 GB total
Max Memory: 512 MB
Root Solution: Magisk 26.1

------------------------------------------------------------
APP INFORMATION
------------------------------------------------------------
Platform: android 33
Total Logs: 156

------------------------------------------------------------
APPLICATION LOGS
------------------------------------------------------------

[1] 5:25:30 PM INFO    [App]
    VirtuCam application started

[2] 5:25:31 PM SUCCESS [ConfigBridge]
    Configuration written successfully

[3] 5:25:35 PM ERROR   [PermissionManager]
    Failed to check overlay permission
    Details: Permission denied

...

============================================================
End of Log
============================================================
```

## Integration Points

### Automatic Logging

The system automatically logs:

- App startup
- Configuration changes
- Permission checks
- System verification
- Error conditions
- Success operations

### Manual Integration

Add logging to any service or component:

```typescript
import { logger } from '@/services/LogService';

export async function myFunction() {
  try {
    logger.info('Starting operation', 'MyService');

    // ... your code ...

    logger.success('Operation completed', 'MyService');
  } catch (error: any) {
    logger.error('Operation failed', 'MyService', { error: error.message, stack: error.stack });
    throw error;
  }
}
```

## Benefits

### For Users

- **Easy troubleshooting** - See exactly what's happening
- **Support assistance** - Share logs with support team
- **Transparency** - Understand app behavior
- **Problem diagnosis** - Identify issues quickly

### For Developers

- **Remote debugging** - Users can send logs
- **Error tracking** - See all errors in one place
- **Performance monitoring** - Track operations
- **User support** - Help users solve problems
- **Quality assurance** - Identify edge cases

## Technical Details

### Memory Management

- Keeps last 1000 log entries in memory
- Automatically removes oldest entries
- Minimal memory footprint
- No performance impact

### Storage

- Logs exported to app's document directory
- Files named: `virtucam_log_YYYY-MM-DDTHH-MM-SS.txt`
- Accessible via file manager
- Can be shared via any app

### Privacy

- Logs stored locally only
- No automatic upload
- User controls sharing
- System info included for debugging

### Performance

- Asynchronous operations
- Non-blocking logging
- Efficient filtering
- Fast export

## Future Enhancements

Potential improvements:

- Log rotation (automatic cleanup of old files)
- Cloud sync option (opt-in)
- Advanced filtering (regex, date ranges)
- Log analytics dashboard
- Crash reporting integration
- Performance metrics
- Network request logging
- Camera operation tracing

## Troubleshooting

### Logs Not Appearing

- Check if app has storage permission
- Verify LogService is imported correctly
- Ensure logger methods are being called

### Export Fails

- Check storage permission
- Verify available storage space
- Try clearing app cache

### System Logs Empty

- Requires READ_LOGS permission (system app or root)
- May not work on all devices
- Check logcat access permissions

## Support

For issues or questions about the logging system:

1. Check the logs viewer for error messages
2. Export and review the full log file
3. Share logs with support team if needed
4. Include system information from log export

## API Reference

### LogService Methods

```typescript
// Logging
logger.log(message: string, level: LogLevel, source?: string, details?: any)
logger.info(message: string, source?: string, details?: any)
logger.warn(message: string, source?: string, details?: any)
logger.error(message: string, source?: string, details?: any)
logger.success(message: string, source?: string, details?: any)
logger.debug(message: string, source?: string, details?: any)

// Retrieval
logger.getLogs(): LogEntry[]
logger.getLogsByLevel(level: LogLevel): LogEntry[]
logger.getLogsBySource(source: string): LogEntry[]
logger.getLogsByTimeRange(start: number, end: number): LogEntry[]

// Statistics
logger.getLogCount(): number
logger.getErrorCount(): number
logger.getWarningCount(): number

// Export
logger.formatLogsAsText(): Promise<string>
logger.exportLogs(share: boolean): Promise<string>

// Management
logger.clear(): void
logger.subscribe(listener: LogListener): () => void
```

### Native Module Methods

```kotlin
// VirtuCamSettings
VirtuCamSettings.getXposedLogs(): Promise<{logs: string, success: boolean}>
VirtuCamSettings.getSystemLogs(lineCount: number): Promise<{logs: string, success: boolean}>
VirtuCamSettings.clearSystemLogs(): Promise<boolean>
```

## Conclusion

The VirtuCam diagnostic logging system provides comprehensive error tracking and debugging capabilities, making it easier to support users and identify issues. The real-time viewer, export functionality, and system integration make it a powerful tool for both developers and end users.
