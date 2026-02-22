import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import {
  diagnoseNativeModule,
  testNativeModule,
  getBuildInfo,
} from '@/services/NativeModuleDiagnostics';

type DiagnosticsResult = ReturnType<typeof diagnoseNativeModule>;
type BuildInfo = ReturnType<typeof getBuildInfo>;

export default function NativeModuleDiagnosticScreen() {
  const { colors } = useTheme();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [testResults, setTestResults] = useState<string>('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setDiagnostics(diagnoseNativeModule());
    setBuildInfo(getBuildInfo());
  }, []);

  const runTests = async () => {
    setTesting(true);
    setTestResults('Running tests...\n\n');
    const ok = await testNativeModule();
    setTestResults(prev => prev + `\n\nTests ${ok ? 'PASSED ✅' : 'FAILED ❌'}`);
    setTesting(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: Spacing.xl, paddingBottom: Spacing.xxxl }}
    >
      <Text style={[styles.title, { color: colors.electricBlue }]}>
        Native Module Diagnostics
      </Text>

      <View style={[styles.section, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Build Information</Text>
        {buildInfo && (
          <>
            <Text style={[styles.text, { color: colors.textSecondary }]}>Platform: {buildInfo.platform}</Text>
            <Text style={[styles.text, { color: colors.textSecondary }]}>Platform Version: {buildInfo.platformVersion}</Text>
            <Text style={[styles.text, { color: colors.textSecondary }]}>Hermes: {buildInfo.isHermes ? 'Yes' : 'No'}</Text>
            <Text style={[styles.text, { color: colors.textSecondary }]}>
              TurboModules: {buildInfo.isTurboModuleEnabled ? 'Yes' : 'No'}
            </Text>
          </>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Module Status</Text>
        {diagnostics && (
          <>
            <Text
              style={[
                styles.text,
                { color: diagnostics.nativeModuleExists ? colors.success : colors.danger, fontWeight: '700' },
              ]}
            >
              Native Module: {diagnostics.nativeModuleExists ? '✅ LOADED' : '❌ NOT FOUND'}
            </Text>
            {diagnostics.error && (
              <Text style={[styles.text, { color: colors.danger, fontWeight: '700' }]}>
                Error: {diagnostics.error}
              </Text>
            )}
            {diagnostics.nativeModuleExists && (
              <>
                <Text style={[styles.text, { color: colors.textSecondary }]}>
                  Available Methods: {diagnostics.availableMethods.length}
                </Text>
                <Text style={[styles.methodList, { color: colors.textTertiary }]}>
                  {diagnostics.availableMethods.join('\n')}
                </Text>
              </>
            )}
          </>
        )}
      </View>

      {diagnostics?.nativeModuleExists && (
        <View style={[styles.section, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: colors.electricBlue },
              testing && { backgroundColor: colors.surfaceLighter },
            ]}
            onPress={runTests}
            disabled={testing}
          >
            <Text style={[styles.buttonText, { color: testing ? colors.textTertiary : colors.background }]}>
              {testing ? 'Testing...' : 'Run Functionality Tests'}
            </Text>
          </TouchableOpacity>
          {testResults ? (
            <View style={[styles.resultsBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.resultsText, { color: colors.textSecondary }]}>{testResults}</Text>
            </View>
          ) : null}
        </View>
      )}

      {!diagnostics?.nativeModuleExists && (
        <View
          style={[
            styles.section,
            { backgroundColor: colors.danger + '18', borderColor: colors.danger, borderWidth: 2 },
          ]}
        >
          <Text style={[styles.errorTitle, { color: colors.danger }]}>⚠️ Native Module Not Found</Text>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            The VirtuCamSettings native module is not loaded.{'\n\n'}
            This means the app was not built correctly.{'\n\n'}
            To fix this:
          </Text>
          <Text
            style={[
              styles.fixSteps,
              { color: colors.textPrimary, backgroundColor: colors.background, borderRadius: BorderRadius.sm },
            ]}
          >
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
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  section: {
    borderRadius: BorderRadius.card,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  text: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  methodList: {
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
  },
  button: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  buttonText: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  resultsBox: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resultsText: {
    fontSize: FontSize.xs,
  },
  errorTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  fixSteps: {
    fontSize: FontSize.sm,
    padding: Spacing.md,
    lineHeight: 20,
  },
  surfaceLighter: {},
});
