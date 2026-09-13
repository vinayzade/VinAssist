# native

Typed wrappers around platform-specific code (Turbo Modules, Native Modules,
Fabric components). Feature code imports from `@/native`, never from
`react-native`'s `NativeModules` directly.

## Layout

    specs/Native<Name>.ts   codegen spec: the JS <-> native contract
    <Name>.ts               typed wrapper feature code actually imports
    index.ts                public surface

`package.json > codegenConfig` points React Native codegen at `specs/`. On
every Android build it generates `Native<Name>Spec` under
`com.vinassist.nativemodules` (see `android/app/build/generated/source/codegen`),
which the Kotlin implementation extends.

## Modules

### TextRecognition (on-device OCR)

| Layer  | Where |
| ------ | ----- |
| Spec   | `specs/NativeTextRecognition.ts` |
| JS     | `TextRecognition.ts` -> consumed by `services/ocr/MLKitOCRService.ts` |
| Android| `android/app/src/main/java/com/vinassist/ocr/TextRecognitionModule.kt` (Kotlin, ML Kit Text Recognition v2, Latin + Devanagari models bundled) registered via `TextRecognitionPackage` in `MainApplication.kt` |
| iOS    | not implemented yet; `getTextRecognitionModule()` returns `null` and the OCR service reports itself unavailable |

Adding a script: add the ML Kit dependency in `android/app/build.gradle`,
extend `SUPPORTED_SCRIPTS` / `recognizerFor` in the Kotlin module, and add the
name to `OCRScript` in `services/ocr/types.ts`.

### ImageQuality (on-device measurement)

See `specs/NativeImageQuality.ts`; scoring lives in `services/imageQuality/scoring.ts`.

### SpeechRecognition (voice input)

| Layer  | Where |
| ------ | ----- |
| Spec   | `specs/NativeSpeechRecognition.ts` |
| JS     | `SpeechRecognition.ts` -> consumed by `services/speech/NativeSpeechService.ts` (`getSpeechService()`), used by `features/aiAssistant/hooks/useVoiceInput.ts` |
| Android| `android/app/src/main/java/com/vinassist/speech/SpeechRecognitionModule.kt` (Kotlin, platform `SpeechRecognizer`; prefers the on-device recogniser on Android 12+) registered via `SpeechRecognitionPackage` in `MainApplication.kt`. Needs `RECORD_AUDIO` (requested at runtime) and the `<queries>` entry for `android.speech.RecognitionService` in the manifest. |
| iOS    | not implemented yet; `getSpeechRecognitionModule()` returns `null` and the composer hides the microphone |

`start()` resolves once with the final transcript; partial transcripts and the
microphone level arrive as `DeviceEventEmitter` events named in
`SPEECH_EVENTS`. Audio never leaves the device; only text reaches the backend.

### TextToSpeech (spoken replies)

| Layer  | Where |
| ------ | ----- |
| Spec   | `specs/NativeTextToSpeech.ts` |
| JS     | `TextToSpeech.ts` -> `services/speech/NativeTextToSpeechService.ts` (`getTextToSpeechService()`) |
| Android| `android/app/src/main/java/com/vinassist/speech/TextToSpeechModule.kt` (Kotlin, platform `TextToSpeech`; initialises lazily and queues `speak` calls until ready) registered via `TextToSpeechPackage`. Needs the `<queries>` entry for `android.intent.action.TTS_SERVICE`. |
| iOS    | not implemented yet; `getTextToSpeechModule()` returns `null` and read-aloud controls are hidden |

`services/voice` composes recognition and synthesis into a `VoiceService`
(`listen`, `speak`, `stopAll`). The voice pipeline (mic -> text -> assistant
-> optional speech) lives in `features/voice/hooks/useVoiceAssistant.ts`;
the services themselves never touch the LLM.

## Adding a module

1. Write `specs/Native<Name>.ts` using codegen-compatible types (type
   aliases, no string-literal unions, `Array<T>`, `?` for optional).
2. Build once so the spec class is generated, then implement it in Kotlin
   under `android/app/src/main/java/com/vinassist/<area>/`.
3. Register a `BaseReactPackage` in `MainApplication.kt`.
4. Expose a typed wrapper here and mock it in tests (the module is `null`
   under Jest, so wrappers must handle absence).
