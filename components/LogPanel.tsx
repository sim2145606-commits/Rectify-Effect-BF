import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { logger, LogEntry } from '@/services/LogService';
import { Colors, FontSize, Spacing } from '@/constants/theme';

const LogPanel = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    const unsubscribe = logger.subscribe((entry) => {
      setLogs(prevLogs => [...prevLogs, entry]);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [logs]);

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return Colors.danger;
      case 'warn':
        return Colors.warningAmber;
      case 'success':
        return Colors.verifiedGreen;
      case 'info':
      default:
        return Colors.textSecondary;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LOGS</Text>
      <ScrollView style={styles.logContainer} ref={scrollViewRef}>
        {logs.map((log, index) => (
          <Text key={index} style={[styles.logText, { color: getLogColor(log.level) }]}>
            <Text style={styles.timestamp}>{new Date(log.timestamp).toLocaleTimeString()}: </Text>
            {log.message}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 150,
    backgroundColor: Colors.surface,
    borderRadius: Spacing.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  title: {
    color: Colors.textTertiary,
    fontSize: FontSize.xs,
    fontWeight: 'bold',
    marginBottom: Spacing.sm,
  },
  logContainer: {
    flex: 1,
  },
  logText: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.xs,
  },
  timestamp: {
    color: Colors.textTertiary,
  },
});

export default LogPanel;
