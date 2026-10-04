// Single switch for the AI test-data warning.
// Keep this true while the project is on Spark / Gemini Developer API free tier.
// After moving the Firebase project to Blaze/paid Gemini Developer API, set
// VITE_AI_TEST_DATA_ONLY=false. No AI code changes are required.
export const AI_TEST_DATA_ONLY = import.meta.env.VITE_AI_TEST_DATA_ONLY !== 'false';

export const AI_TEST_DATA_WARNING = 'Use test data only until paid tier is enabled';
export const AI_DATA_WARNING_PLACEHOLDER = AI_TEST_DATA_WARNING;

// Firebase AI Logic currently documents Gemini 3.6 Flash as a stable model.
// Staging fallback candidate: Gemini 3.5 Flash-Lite. Suitability is not assumed; it must be tested.
// Do not put Gemini 2.5 model names into Remote Config.
export const AI_MODEL = 'gemini-3.6-flash';
export const AI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
export const AI_REMOTE_CONFIG_FALLBACK_KEY = 'ai_fallback_model';

export const AI_CLIENT_RATE_LIMIT = 10;
export const AI_CLIENT_RATE_WINDOW_MS = 60_000;

// Retry policy: initial request + at most 3 retries, only for HTTP 500/503.
export const AI_MAX_RETRIES = 3;
export const AI_RETRY_DELAYS_MS = [500, 1000, 2000] as const;

// Lab image preprocessing: reduce payload while retaining enough detail for OCR.
export const AI_IMAGE_MAX_DIMENSION = 2000;
export const AI_IMAGE_JPEG_QUALITY = 0.88;
