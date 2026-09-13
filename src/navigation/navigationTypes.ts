import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AssistantHandoff } from '@/features/aiAssistant/types';
import type { CapturedImage, ScanTarget } from '@/features/scanner/types';
import type { ImageQualityResult } from '@/services/imageQuality';
import type { OCRResult } from '@/services/ocr';

/* ------------------------------------------------------------------------ */
/* Param lists                                                              */
/* ------------------------------------------------------------------------ */

/** Screens shown while the user is signed out. */
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  /** `email` pre-fills the form when arriving from the login screen. */
  ForgotPassword: { email?: string } | undefined;
  /** Development builds only: backend connectivity check. */
  BackendStatus: undefined;
};

/** Bottom tabs shown once the user is signed in. */
export type MainTabParamList = {
  Home: undefined;
  /**
   * `attach` queues material from another screen (OCR text, an analysis
   * result) as an attachment; `prefill` seeds the composer text.
   */
  AIAssistant:
    | { prefill?: string; attach?: AssistantHandoff; /** Reopen a saved conversation. */ resume?: string }
    | undefined;
  History: undefined;
  Profile: undefined;
};

/**
 * Stack that hosts the tab bar plus full-screen tool flows that are pushed
 * on top of it (so the tab bar hides while a tool is open).
 */
export type MainStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  /** Camera. `target` pre-selects the tool the photo will be sent to. */
  Scanner: { target?: ScanTarget } | undefined;
  /** Review a captured / picked image before handing it to a tool. */
  ImagePreview: { image: CapturedImage; target?: ScanTarget };
  OCR: { imageUri?: string } | undefined;
  /** Recognised text for one image, with the actions that follow. */
  OCRResult: { imageUri: string; result: OCRResult };
  DocumentAnalysis: { imageUri?: string } | undefined;
  /** Ask questions about an uploaded document (RAG over its chunks). */
  DocumentChat: { documentId: string; name: string; kind: 'pdf' | 'image'; localUri?: string };
  ImageAnalysis: { imageUri?: string } | undefined;
  ImageQuality: { imageUri?: string } | undefined;
  /** Scores and warnings for one image. */
  ImageQualityResult: { imageUri: string; result: ImageQualityResult };
  Sentiment: undefined;
  Voice: undefined;
  /** Development builds only: backend connectivity check. */
  BackendStatus: undefined;
};

/**
 * Root of the app. Exactly one of these is mounted at a time:
 *  - `Splash` while persisted state is being restored,
 *  - `Auth` when there is no session,
 *  - `Main` when there is one.
 */
export type RootStackParamList = {
  Splash: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
};

/* ------------------------------------------------------------------------ */
/* Screen props                                                             */
/* ------------------------------------------------------------------------ */

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

/** Auth screens can navigate within the auth stack and to root routes. */
export type AuthScreenProps<T extends keyof AuthStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<AuthStackParamList, T>,
    RootScreenProps<keyof RootStackParamList>
  >;

/** Full-screen tool flows pushed on the main stack. */
export type MainStackScreenProps<T extends keyof MainStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<MainStackParamList, T>,
    RootScreenProps<keyof RootStackParamList>
  >;

/** Tab screens can switch tabs, push tool flows, and reach root routes. */
export type MainTabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    MainStackScreenProps<keyof MainStackParamList>
  >;

/* ------------------------------------------------------------------------ */
/* Route name helpers                                                       */
/* ------------------------------------------------------------------------ */

/** Tool flows reachable from Home / Scanner (everything except the tab host and preview). */
export type MainToolRoute = Exclude<
  keyof MainStackParamList,
  'Tabs' | 'ImagePreview' | 'OCRResult' | 'ImageQualityResult' | 'DocumentChat' | 'BackendStatus'
>;

/* ------------------------------------------------------------------------ */
/* Global typing for `useNavigation()` / `navigationRef`                    */
/* ------------------------------------------------------------------------ */

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
