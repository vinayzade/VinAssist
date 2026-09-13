# Performance notes

Measured on 12 Sep 2026 on a Samsung SM-M066B (development build, Hermes,
New Architecture). Numbers come from `adb shell dumpsys gfxinfo` on the
device and from the render counter under Jest (see below).

## How to measure

- **Row re-renders:** `npx jest __tests__/renderBudget.test.tsx`. The
  `jest.renderCounter.js` setup file installs a React DevTools hook that
  counts, per commit, every function component that actually performed work.
  The test types into a composer or search box and asserts that list rows do
  not render. It prints `[perf] ...` lines with the real counts.
- **Frames on the device:** `adb shell dumpsys gfxinfo com.vinassist reset`,
  interact, then `adb shell dumpsys gfxinfo com.vinassist` and read
  `Janky frames` and the percentiles.

## Findings and decisions

| Area | Measured | Decision |
| --- | --- | --- |
| Assistant list | Each composer keystroke re-rendered every message row (4 of 4) | `AssistantEntryView` is `memo`; `renderItem` and `onSpeak` are stable callbacks. Now 0 per keystroke. |
| History list | Each search keystroke re-rendered every loaded row (20 of 20, grows per page) | `ActivityCard` is `memo`; `renderItem` stable. Now 0 per keystroke. Typing with 60 rows loaded: 0% janky, p90 15 ms. |
| Document chat | Each keystroke re-rendered every turn (2 of 2) | Turn row is `memo`; `renderItem` stable. Now 0. |
| FlatList vs FlashList | Scrolling 60 history rows: 0.1% janky frames, p50 8 ms, p99 21 ms | FlatList is sufficient. Pages are 20 rows and cards are simple. FlashList is not added; revisit only if a list exceeds a few hundred rows on screen or gfxinfo shows jank. |
| Styles | `createStyles` caches one `StyleSheet` per theme object | No change. |
| Redux selectors | Only whole-slice selectors on auth, settings, theme mode; no selectors that build new objects | No change. |
| RTK Query | One API with tag invalidation; history uses an infinite query (20 per page, server cap 50) and `currentData` so a new filter never shows the old page; lists refetch on focus and on reconnect | No change. Home shares the history cache with the History tab. |
| Navigation | Tabs are lazy and `freezeOnBlur`; stack screens use native screens | No change. |
| Camera | Preview is active only while the screen is focused and permission is granted; capture goes straight to a JPEG file (no base64) | No change. |
| Images | `Image` with file URIs and `resizeMode`; Android decodes local files at view size | No change. Image quality analysis downsamples to 1024 px natively; OCR runs on the file. |
| Large documents | Uploads stream as multipart (no base64); PDFs are chunked server-side and only the top 5 passages reach the model; OCR text sent to the assistant was uncapped and would have been rejected above 20 000 characters | OCR attachments are clipped client-side to the backend limit (`clipOcrText`). |

## What was deliberately not done

- No `useMemo`/`useCallback` added outside the list screens above: the other
  screens re-render rarely and have no expensive children.
- No `React.memo` on leaf components (`AppText`, `AppButton`, chips): their
  parents are already memoised at the row level, which is where the fan-out is.
- No FlashList dependency, for the reasons in the table.
