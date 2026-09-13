# app/ai

Vendor-neutral AI layer. Everything else in the backend depends on the
interfaces here, never on a provider.

    base.py            AIProvider, AICapability, errors, shared value objects
    chat/              ChatService        (ChatRequest -> ChatResponse, optional stream)
    vision/            VisionService      (VisionRequest -> VisionResponse)
    sentiment/         SentimentService   (SentimentRequest -> SentimentResponse)
    summarization/     SummarizationService
    embeddings/        EmbeddingService   (+ `dimensions`)
    ocr/               OCRService         (server-side; the app does OCR on-device)
    extraction/        ExtractionService  (classify + structured fields, validated)
    rag/               chunking, pgvector store, grounded prompt for document chat
    assistant/         prompt + material "cards" for the in-app assistant (/ai/chat)
    providers/
      mock/            deterministic, offline, no keys (default)
      huggingface/     Inference API via httpx; models configurable in .env
    registry.py        AI_PROVIDER -> provider instance; the only importer of providers

## Using a service from a route

    from app.api.deps import SummarizationServiceDep

    @router.post("/summarize")
    async def summarize(body: SummarizeIn, service: SummarizationServiceDep):
        result = await service.summarize(SummarizationRequest(text=body.text))
        ...

Routes never name a vendor. Provider errors surface as `AIError` subclasses
(`AIUnavailableError` 503, `AIRateLimitedError` 429, `AIInvalidInputError`
400, `AITimeoutError` 504), which the global handlers turn into the usual
`{detail, code}` body.

## Switching provider

    AI_PROVIDER=huggingface
    HUGGINGFACE_API_KEY=hf_...
    HF_CHAT_MODEL=...            # optional per-task overrides

No code changes. `tests/test_ai.py` enforces that no module outside
`app/ai/providers/` (other than the registry) imports a concrete provider.

## Adding a provider

1. Create `providers/<name>/` implementing the services you support and an
   `AIProvider` subclass that exposes them (return `None` for the rest).
2. Translate vendor exceptions into `AIError` subclasses.
3. Register a factory in `registry._FACTORIES` (or call `register_provider`).
