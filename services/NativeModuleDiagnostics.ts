import { NativeModules, Platform } from 'react-native';

/**
 * Diagnostic utility to check native module availability
 */
export function diagnoseNativeModule() {
  const diagnostics = {
    platform: Platform.OS,
    nativeModuleExists: false,
    availableMethods: [] as string[],
    error: null as string | null,
  };

  try {
    const { VirtuCamSettings } = NativeModules;

    if (!VirtuCamSettings) {
      diagnostics.error = 'VirtuCamSettings module not found in NativeModules';
      if (__DEV__) {
        const moduleNames = Object.keys(NativeModules);
        console.error('❌ Native module not loaded!');
        console.error('Available modules:', moduleNames);
        console.error('Total modules:', moduleNames.length);
        console.error('First 10 modules:', moduleNames.slice(0, 10));
        console.error('VirtuCamSettings in list?', moduleNames.includes('VirtuCamSettings'));
      }
      return diagnostics;
    }

    diagnostics.nativeModuleExists = true;

    const methods = Object.keys(VirtuCamSettings).filter(
      key => typeof VirtuCamSettings[key] === 'function'
    );
    diagnostics.availableMethods = methods;

    if (__DEV__) {
      console.log('✅ Native module loaded successfully!');
      console.log('Available methods:', methods);
    }

    return diagnostics;
  } catch (err: unknown) {
    diagnostics.error = err instanceof Error ? err.message : String(err);
    if (__DEV__) {
      console.error('❌ Error checking native module:', err);
    }
    return diagnostics;
  }
}

/**
 * Test native module functionality
 */
export async function testNativeModule(): Promise<boolean> {
  const { VirtuCamSettings } = NativeModules;

  if (!VirtuCamSettings) {
    if (__DEV__) console.error('❌ Cannot test - native module not available');
    return false;
  }

  if (__DEV__) console.log('🧪 Testing native module methods...');

  try {
    if (__DEV__) console.log('Test 1: checkRootAccess()');
    const rootResult = await VirtuCamSettings.checkRootAccess();
    if (__DEV__) console.log('  Result:', rootResult);

    if (__DEV__) console.log('Test 2: checkXposedStatus()');
    const xposedResult = await VirtuCamSettings.checkXposedStatus();
    if (__DEV__) console.log('  Result:', xposedResult);

    if (__DEV__) console.log('Test 3: checkAllFilesAccess()');
    const allFilesResult = await VirtuCamSettings.checkAllFilesAccess();
    if (__DEV__) console.log('  Result:', allFilesResult);

    if (__DEV__) console.log('Test 4: checkOverlayPermission()');
    const overlayResult = await VirtuCamSettings.checkOverlayPermission();
    if (__DEV__) console.log('  Result:', overlayResult);

    if (__DEV__) console.log('Test 5: getSystemInfo()');
    const systemInfo = await VirtuCamSettings.getSystemInfo();
    if (__DEV__) console.log('  Result:', systemInfo);

    if (__DEV__) console.log('✅ All tests completed successfully!');
    return true;
  } catch (err: unknown) {
    if (__DEV__) console.error('❌ Test failed:', err);
    return false;
  }
}

/**
 * Get detailed build information
 */
export function getBuildInfo() {
  const { VirtuCamSettings } = NativeModules;

  return {
    hasNativeModule: !!VirtuCamSettings,
    platform: Platform.OS,
    platformVersion: Platform.Version,
    isHermes: !!(global as Record<string, unknown>).HermesInternal,
    isTurboModuleEnabled: !!(global as Record<string, unknown>).__turboModuleProxy,
  };
}
