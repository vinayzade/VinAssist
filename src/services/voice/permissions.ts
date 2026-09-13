import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Asks for microphone access on Android (iOS prompts from the recogniser
 * itself). Resolves true when listening may start.
 */
export async function ensureMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone access',
      message: 'Speak your question instead of typing it. Audio stays on this device.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
  return status === PermissionsAndroid.RESULTS.GRANTED;
}
