// Single switch for the AI test-data warning.
// Keep this true while the project is on Spark / Gemini Developer API free tier.
// After moving the Firebase project to Blaze/paid Gemini Developer API, set
// VITE_AI_TEST_DATA_ONLY=false. No AI code changes are required.
export const AI_TEST_DATA_ONLY = import.meta.env.VITE_AI_TEST_DATA_ONLY !== 'false';

export const AI_TEST_DATA_WARNING = 'Use test data only until paid tier is enabled';
export const AI_DATA_WARNING_PLACEHOLDER = AI_TEST_DATA_WARNING;
export const AI_MODEL = 'gemini-3.6-flash';
export const AI_CLIENT_RATE_LIMIT = 10;
export const AI_CLIENT_RATE_WINDOW_MS = 60_000;
