import { NativeModules } from 'react-native';
import { logger } from './LogService';

const { VirtuCamSettings } = NativeModules;

export async function startFloatingOverlay(hookEnabled: boolean): Promise<void> {
  if (!VirtuCamSettings?.startFloatingOverlay) {
    logger.warn('startFloatingOverlay not available on this build', 'OverlayService');
    return;
  }
  await VirtuCamSettings.startFloatingOverlay();
}

export async function stopFloatingOverlay(): Promise<void> {
  if (!VirtuCamSettings?.stopFloatingOverlay) {
    logger.warn('stopFloatingOverlay not available on this build', 'OverlayService');
    return;
  }
  await VirtuCamSettings.stopFloatingOverlay();
}
