# native

Typed wrappers around platform-specific code (Turbo Modules, Native Modules,
Fabric components). Keep one file per module, e.g. `CameraModule.ts`, and
expose only a typed JS API. Feature code should import from `@/native`, never
from `react-native`'s `NativeModules` directly.
