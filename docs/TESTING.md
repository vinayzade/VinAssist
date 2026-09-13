# Testing

## React Native (Jest + React Native Testing Library)

```
npm test                       # everything
npx jest __tests__/rntl        # the RNTL suites only
```

- `test-utils/render.tsx`: `renderWithProviders`, `renderHookWithProviders`,
  `makeStore`, `fakeNavigation`, `fakeRoute`. Wraps the Redux store and theme
  and signs a test session in by default.
- `test-utils/fetchMock.ts`: `installFetchMock()` gives an in-process API
  (`api.on(method, path, handler)`, `api.calls(...)`, `api.json(...)`,
  `api.networkError()`), so screens are tested against the real RTK Query
  layer with no network.
- RNTL v14 is asynchronous: `await render(...)`, `await fireEvent.press(...)`,
  `await renderHook(...)`. `jest.rntl.setup.js` raises the async timeout, and
  `jest.config.js` sets a 20 s test timeout for full-app flows.
- `jest.renderCounter.js` counts real component renders per commit for
  `__tests__/renderBudget.test.tsx` (see `docs/PERFORMANCE.md`).

| Area | Suite |
| --- | --- |
| Auth flow through the whole app (register, login, banners, expiry, sign out) | `__tests__/rntl/authFlow.test.tsx` |
| Redux reducers (auth, settings) as pure functions | `__tests__/rntl/reducers.test.ts` |
| RTK Query integration (cache, tags, infinite paging, error shape, multipart) | `__tests__/rntl/rtkQuery.test.ts` |
| Custom hooks (`useForm`, `useDebounce`, `useFileSelection`, `useVoiceInput`, `useAssistant`) | `__tests__/rntl/hooks.test.tsx` |
| OCR result UI | `__tests__/rntl/ocrResultUi.test.tsx` |
| Image-quality result UI | `__tests__/rntl/imageQualityResultUi.test.tsx` |
| Error states (normalisation, ErrorView, list retry, chat failure, indexing, session expiry) | `__tests__/rntl/errorStates.test.tsx` |

The earlier `react-test-renderer` suites in `__tests__/*.test.tsx` still run
and cover the remaining screens (scanner, document upload/chat, assistant,
voice, history, dashboard, navigation).

## FastAPI (pytest)

```
cd backend
.venv\Scripts\python -m pytest -q
```

Tests run against a real PostgreSQL 16 with pgvector (embedded via
`pgserver`, or `TEST_DATABASE_URL`) with the mock AI provider pinned, so
nothing reaches Hugging Face.

| Area | Suite |
| --- | --- |
| Authentication (register, login, refresh rotation and reuse, logout, reset) | `tests/test_auth.py` |
| Authorization matrix (other users, missing/expired/wrong-purpose tokens, revoked sessions) | `tests/test_authorization.py` |
| Document APIs (upload validation, magic bytes, size caps, privacy, delete) | `tests/test_documents.py` |
| Sentiment endpoint (labels, provenance, provider errors) | `tests/test_ai_sentiment.py` |
| Summarization endpoint (modes, validation, provider fallback) | `tests/test_ai_summarize.py` |
| RAG (chunking, indexing, grounded answers) | `tests/test_rag.py` |
| RAG retrieval (vector ranking, thresholds, user isolation, multi-document, chunk overlap) | `tests/test_rag_retrieval.py` |
| Validation contracts (422 for every endpoint, no side effects) | `tests/test_validation.py` |
| Assistant, history, OCR, image quality, extraction, schema, errors | remaining `tests/test_*.py` |
