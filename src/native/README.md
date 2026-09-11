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

## Adding a module

1. Write `specs/Native<Name>.ts` using codegen-compatible types (type
   aliases, no string-literal unions, `Array<T>`, `?` for optional).
2. Build once so the spec class is generated, then implement it in Kotlin
   under `android/app/src/main/java/com/vinassist/<area>/`.
3. Register a `BaseReactPackage` in `MainApplication.kt`.
4. Expose a typed wrapper here and mock it in tests (the module is `null`
   under Jest, so wrappers must handle absence).
