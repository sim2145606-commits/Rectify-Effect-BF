import { Linking, Platform } from 'react-native';

type LaunchResult = {
  success: boolean;
  message?: string;
};

/**
 * Attempts to launch a target application by package name.
 */
export async function launchTargetApp(
  packageName: string,
  appName?: string
): Promise<LaunchResult> {
  if (Platform.OS !== 'android') {
    return { success: false, message: 'Target launching is only supported on Android devices.' };
  }

  const intentUri = `intent://#Intent;package=${packageName};end`;
  try {
    const canOpen = await Linking.canOpenURL(intentUri);
    if (canOpen) {
      await Linking.openURL(intentUri);
      return { success: true };
    }
  } catch {
    // fallthrough to message
  }

  return {
    success: false,
    message:
      `Unable to open ${appName ?? packageName} from the dev client. ` +
      'Ensure the app is installed and launch it manually if needed.',
  };
}
