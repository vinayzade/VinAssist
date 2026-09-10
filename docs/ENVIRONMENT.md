# Environment configuration

The app is built for one of three environments. Values come from
[`react-native-config`](https://github.com/lugg/react-native-config), which
reads a `.env.*` file at **native build time** and exposes it to JS.

| Environment   | File               | Android flavor | iOS scheme             | App id                   |
| ------------- | ------------------ | -------------- | ---------------------- | ------------------------ |
| development   | `.env.development` | `development`  | `VinAssist`            | `com.vinassist`          |
| staging       | `.env.staging`     | `staging`      | `VinAssist-Staging`    | `com.vinassist.staging`  |
| production    | `.env.production`  | `production`   | `VinAssist-Production` | `com.vinassist`          |

## Variables

| Name           | Type                                       | Notes                                    |
| -------------- | ------------------------------------------ | ---------------------------------------- |
| `APP_ENV`      | `development` \| `staging` \| `production` | Behaviour profile; validated at startup. |
| `API_BASE_URL` | URL                                        | FastAPI backend. Must be https in prod.  |

Add a new variable in three places: the `.env.*` files, the
`NativeConfig` interface in `src/config/react-native-config.d.ts`, and the
`Env` interface plus `parseEnv` in `src/config/env.ts`.

## Reading config in code

```ts
import { env, isProduction } from '@/config';

env.API_BASE_URL; // string, validated, no trailing slash
env.APP_ENV; // 'development' | 'staging' | 'production'
```

Never import `react-native-config` directly. `src/config/env.ts` validates
the raw values once at startup and throws an `EnvError` with a precise
message if anything is missing or malformed, so a bad build fails
immediately rather than on the first request.

## Secrets policy

**No AI provider keys in the app. Ever.** Everything in a `.env.*` file is
compiled into the binary and can be read by anyone who installs it.
Hugging Face, OpenAI and any other provider credentials live only in the
FastAPI backend; the app authenticates to *our* API and the backend calls
the providers.

This is enforced at runtime: `parseEnv` refuses to start the app if any
variable name matches `*KEY`, `*SECRET`, `*TOKEN`, `*PASSWORD`, a known
provider name, or a value shaped like a provider key (`sk-…`, `hf_…`).
`__tests__/env.test.ts` covers it.

The per-environment files are committed because they contain only public
URLs. A plain `.env` is a gitignored local override (for example pointing
`API_BASE_URL` at your machine's LAN IP for a physical device).

## Running

`react-native run-android` with no flags builds and installs the
**development** flavor: `installDebug` / `assembleDebug` are aliased to the
development variant in `android/app/build.gradle`, and `installRelease` /
`assembleRelease` / `bundleRelease` to production. Use `--mode` (or the
scripts below) to target staging.

```sh
npm run android:dev        # developmentDebug, .env.development
npm run android:staging    # stagingDebug,     .env.staging
npm run android:prod       # productionRelease, .env.production
npm run android:apk:staging
npm run android:aab:prod

npm run ios:dev            # scheme VinAssist            (.env.development)
npm run ios:staging        # scheme VinAssist-Staging    (.env.staging)
npm run ios:prod           # scheme VinAssist-Production (.env.production)
```

To force a file regardless of flavor, set `ENVFILE`:

```sh
ENVFILE=.env.staging ./gradlew assembleProductionRelease   # bash
$env:ENVFILE=".env.staging"; .\gradlew assembleProductionRelease  # PowerShell
```

### Reaching the FastAPI backend from a device

The backend listens on your machine, but "localhost" inside an emulator or
phone is the device itself, so `API_BASE_URL` must name the *host*:

| Target                 | `API_BASE_URL`                | Notes                                             |
| ---------------------- | ----------------------------- | ------------------------------------------------- |
| Android emulator       | `http://10.0.2.2:8000`        | Built-in alias for the host. Default in `.env.development`. |
| iOS simulator          | `http://localhost:8000`       | Shares the host network stack.                    |
| Physical phone (USB)   | `http://localhost:8000` + `adb reverse tcp:8000 tcp:8000` | Tunnels the phone's port 8000 to the host. Re-run after reconnecting. |
| Physical phone (Wi-Fi) | `http://<LAN IP>:8000`        | Same network; allow port 8000 through Windows Firewall. |

Start the backend bound to every interface so the phone can reach it:

```sh
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

For a physical phone, write the override into a gitignored file and build
with it (values are compiled in, so a rebuild is required after changing it):

```sh
# .env.local  (gitignored)
APP_ENV=development
API_BASE_URL=http://192.168.0.106:8000

ENVFILE=.env.local npx react-native run-android          # bash
$env:ENVFILE=".env.local"; npx react-native run-android  # PowerShell
```

In development builds the **Backend status** screen (link at the bottom of
the login screen, or Profile > Developer) shows which URL the build is using
and whether `GET /api/v1/health` answers.

### How selection works

- **Android**: `android/app/build.gradle` maps each product flavor to a file
  via `project.ext.envConfigFiles`. Staging has its own application id
  (`.staging`) so it installs alongside; development shares the production
  id because the React Native CLI launches whatever `defaultConfig` declares.
- **iOS**: each scheme has a Build pre-action that copies its file to
  `.env`, which the pod reads. Run `pod install` once after adding the
  library; nothing else in the Xcode project needs to change.
- **Jest**: `jest.setup.js` mocks `react-native-config` with the parsed
  contents of `.env.development`.
