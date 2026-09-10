import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './navigationTypes';

/**
 * Deep-link configuration. The JS side is complete; for links to reach the
 * app the `vinassist` scheme (and the https host, for universal/app links)
 * still has to be registered natively:
 *  - Android: an intent-filter in AndroidManifest.xml
 *  - iOS: CFBundleURLTypes in Info.plist / Associated Domains entitlement
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['vinassist://', 'https://vinassist.app'],
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          Register: 'register',
          ForgotPassword: 'forgot-password',
        },
      },
      Main: {
        screens: {
          Tabs: {
            screens: {
              Home: '',
              AIAssistant: 'assistant',
              History: 'history',
              Profile: 'profile',
            },
          },
          Scanner: 'scanner',
          ImagePreview: 'scanner/preview',
          OCR: 'tools/ocr',
          DocumentAnalysis: 'tools/document',
          ImageAnalysis: 'tools/image',
          ImageQuality: 'tools/quality',
          Sentiment: 'tools/sentiment',
          Voice: 'tools/voice',
        },
      },
    },
  },
};
