import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { diagnoseNativeModule, testNativeModule, getBuildInfo } from '@/services/NativeModuleDiagnostics';

/**
 * Diagnostic screen to test native module
 * Add this to your app to verify the module is loaded
 * 
 * Usage:
 * 1. Import this component
 * 2. Add a route to it in your navigation
 * 3. Navigate to it to see diagnostic results
 */
export default function NativeModuleDiagnosticScreen() {
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [buildInfo, setBuildInfo] = useState<any>(null);
  const [testResults, setTestResults] = useState<string>('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    // Run diagnostics on mount
    const diag = diagnoseNativeModule();
    setDiagnostics(diag);

    const build = getBuildInfo();
    setBuildInfo(build);
  }, []);

  const runTests = async () => {
    setTesting(true);
    setTestResults('Running tests...\n\n');

    const success = await testNativeModule();

    setTestResults(prev => prev + `\n\nTests ${success ? 'PASSED ✅' : 'FAILED ❌'}`);
    setTesting(false);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Native Module Diagnostics</Text>

      {/* Build Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Build Information</Text>
        {buildInfo && (
          <>
            <Text style={styles.text}>Platform: {buildInfo.platform}</Text>
            <Text style={styles.text}>Platform Version: {buildInfo.platformVersion}</Text>
            <Text style={styles.text}>Hermes: {buildInfo.isHermes ? 'Yes' : 'No'}</Text>
            <Text style={styles.text}>TurboModules: {buildInfo.isTurboModuleEnabled ? 'Yes' : 'No'}</Text>
          </>
        )}
      </View>

      {/* Module Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Module Status</Text>
        {diagnostics && (
          <>
            <Text style={[styles.text, diagnostics.nativeModuleExists ? styles.success : styles.error]}>
              Native Module: {diagnostics.nativeModuleExists ? '✅ LOADED' : '❌ NOT FOUND'}
            </Text>

            {diagnostics.error && (
              <Text style={[styles.text, styles.error]}>Error: {diagnostics.error}</Text>
            )}

            {diagnostics.nativeModuleExists && (
              <>
                <Text style={styles.text}>Available Methods: {diagnostics.availableMethods.length}</Text>
                <Text style={styles.methodList}>
                  {diagnostics.availableMethods.join('\n')}
                </Text>
              </>
            )}
          </>
        )}
      </View>

      {/* Test Button */}
      {diagnostics?.nativeModuleExists && (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.button, testing && styles.buttonDisabled]}
            onPress={runTests}
            disabled={testing}
          >
            <Text style={styles.buttonText}>
              {testing ? 'Testing...' : 'Run Functionality Tests'}
            </Text>
          </TouchableOpacity>

          {testResults && (
            <View style={styles.resultsBox}>
              <Text style={styles.resultsText}>{testResults}</Text>
            </View>
          )}
        </View>
      )}

      {/* Fix Instructions */}
      {!diagnostics?.nativeModuleExists && (
        <View style={[styles.section, styles.errorBox]}>
          <Text style={styles.errorTitle}>⚠️ Native Module Not Found</Text>
          <Text style={styles.errorText}>
            The VirtuCamSettings native module is not loaded.{'\n\n'}
            This means the app was not built correctly.{'\n\n'}
            To fix this:
          </Text>
          <Text style={styles.fixSteps}>
            1. Close the app{'\n'}
            2. Run: build-and-install.bat{'\n'}
            3. Wait for build to complete{'\n'}
            4. Reopen the app{'\n\n'}
            See QUICK_FIX.md for details.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1F2E',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00D9FF',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#252B3D',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  text: {
    fontSize: 14,
    color: '#B0B8C8',
    marginBottom: 8,
  },
  methodList: {
    fontSize: 12,
    color: '#8A92A3',
    marginTop: 8,
    fontFamily: 'monospace',
  },
  success: {
    color: '#00FF88',
    fontWeight: '700',
  },
  error: {
    color: '#FF4444',
    fontWeight: '700',
  },
  button: {
    backgroundColor: '#00D9FF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: '#4A5568',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1F2E',
  },
  resultsBox: {
    backgroundColor: '#1A1F2E',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3A4556',
  },
  resultsText: {
    fontSize: 12,
    color: '#B0B8C8',
    fontFamily: 'monospace',
  },
  errorBox: {
    backgroundColor: '#3D2626',
    borderWidth: 2,
    borderColor: '#FF4444',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF4444',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#FFB8B8',
    marginBottom: 12,
    lineHeight: 20,
  },
  fixSteps: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'monospace',
    backgroundColor: '#1A1F2E',
    padding: 12,
    borderRadius: 8,
    lineHeight: 20,
  },
});
