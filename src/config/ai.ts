export const AI_TEST_MODE = String(import.meta.env.VITE_CARDIOVAULT_AI_TEST_MODE ?? 'true').toLowerCase() !== 'false';
export const AI_MODEL = import.meta.env.VITE_CARDIOVAULT_AI_MODEL || 'gemini-3.8-flash';
export const AI_WARNING = 'Use test data only until paid tier is enabled';
export const AI_MAX_REQUESTS_PER_MINUTE = 5;
