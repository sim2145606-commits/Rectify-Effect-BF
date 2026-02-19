import { NativeModules, Platform } from 'react-native';

/**
 * Diagnostic utility to check native module availability
 * Use this to verify the module is properly loaded
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
      console.error('❌ Native module not loaded!');
      console.error('Available modules:', Object.keys(NativeModules));
      return diagnostics;
    }

    diagnostics.nativeModuleExists = true;

    // List all available methods
    const methods = Object.keys(VirtuCamSettings).filter(
      key => typeof VirtuCamSettings[key] === 'function'
    );
    diagnostics.availableMethods = methods;

    console.log('✅ Native module loaded successfully!');
    console.log('Available methods:', methods);

    return diagnostics;
  } catch (error) {
    diagnostics.error = error instanceof Error ? error.message : String(error);
    console.error('❌ Error checking native module:', error);
    return diagnostics;
  }
}

/**
 * Test native module functionality
 */
export async function testNativeModule() {
  const { VirtuCamSettings } = NativeModules;

  if (!VirtuCamSettings) {
    console.error('❌ Cannot test - native module not available');
    return false;
  }

  console.log('🧪 Testing native module methods...');

  try {
    // Test 1: Check root access
    console.log('Test 1: checkRootAccess()');
    const rootResult = await VirtuCamSettings.checkRootAccess();
    console.log('  Result:', rootResult);

    // Test 2: Check Xposed status
    console.log('Test 2: checkXposedStatus()');
    const xposedResult = await VirtuCamSettings.checkXposedStatus();
    console.log('  Result:', xposedResult);

    // Test 3: Check all files access
    console.log('Test 3: checkAllFilesAccess()');
    const allFilesResult = await VirtuCamSettings.checkAllFilesAccess();
    console.log('  Result:', allFilesResult);

    // Test 4: Check overlay permission
    console.log('Test 4: checkOverlayPermission()');
    const overlayResult = await VirtuCamSettings.checkOverlayPermission();
    console.log('  Result:', overlayResult);

    // Test 5: Get system info
    console.log('Test 5: getSystemInfo()');
    const systemInfo = await VirtuCamSettings.getSystemInfo();
    console.log('  Result:', systemInfo);

    console.log('✅ All tests completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
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
    isHermes: !!(global as any).HermesInternal,
    isTurboModuleEnabled: !!(global as any).__turboModuleProxy,
  };
}
