import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import {
  diagnoseNativeModule,
  testNativeModule,
  getBuildInfo,
} from '@/services/NativeModuleDiagnostics';

type DiagnosticsResult = ReturnType<typeof diagnoseNativeModule>;
type BuildInfo = ReturnType<typeof getBuildInfo>;

export default function NativeModuleDiagnosticScreen() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [testResults, setTestResults] = useState<string>('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
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
            <Text style={styles.text}>
              TurboModules: {buildInfo.isTurboModuleEnabled ? 'Yes' : 'No'}
            </Text>
          </>
        )}
      </View>

      {/* Module Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Module Status</Text>
        {diagnostics && (
          <>
            <Text
              style={[
                styles.text,
                diagnostics.nativeModuleExists ? styles.success : styles.error,
              ]}
            >
              Native Module: {diagnostics.nativeModuleExists ? '✅ LOADED' : '❌ NOT FOUND'}
            </Text>

            {diagnostics.error && (
              <Text style={[styles.text, styles.error]}>Error: {diagnostics.error}</Text>
            )}

            {diagnostics.nativeModuleExists && (
              <>
                <Text style={styles.text}>
                  Available Methods: {diagnostics.availableMethods.length}
                </Text>
                <Text style={styles.methodList}>{diagnostics.availableMethods.join('\n')}</Text>
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

          {testResults ? (
            <View style={styles.resultsBox}>
              <Text style={styles.resultsText}>{testResults}</Text>
            </View>
          ) : null}
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
    backgroundColor: Colors.background,
    padding: Spacing.xl,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.electricBlue,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  text: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  methodList: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
  },
  success: {
    color: Colors.success,
    fontWeight: '700',
  },
  error: {
    color: Colors.danger,
    fontWeight: '700',
  },
  button: {
    backgroundColor: Colors.electricBlue,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  buttonDisabled: {
    backgroundColor: Colors.surfaceLighter,
  },
  buttonText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.background,
  },
  resultsBox: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultsText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  errorBox: {
    backgroundColor: Colors.danger + '15',
    borderWidth: 2,
    borderColor: Colors.danger,
  },
  errorTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.danger,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  fixSteps: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    lineHeight: 20,
  },
});
