/**
 * Fail-fast guard for the isolated local preview.
 *
 * The production Firebase identifiers are hardcoded as fallbacks inside
 * `src/services/webFirebase.ts`. A preview that silently used them would write
 * to the live project, so every entry point checks this module first.
 *
 * Rules:
 *  - VITE_LOCAL_PREVIEW=true  -> preview build.
 *  - In preview, VITE_FIREBASE_EMULATOR must also be true (127.0.0.1 only).
 *  - If the resolved project id is the production one, we throw immediately.
 */

import { PRODUCTION_PROJECT_ID, isEmulatorEnv, isLocalPreviewEnv } from './firebaseProject.ts';

const env = (import.meta as any).env || {};

export { PRODUCTION_PROJECT_ID };

export function isLocalPreview(): boolean {
  return isLocalPreviewEnv(env);
}

export function isEmulatorEnabled(): boolean {
  return isEmulatorEnv(env);
}

/**
 * Throws when a preview could reach the production project.
 * Safe to call from any module: in a normal build it does nothing.
 */
export function assertNoProductionFirebase(): void {
  if (!isLocalPreview()) return;
  if (!isEmulatorEnabled()) {
    throw new Error(
      'LOCAL PREVIEW BLOCKED: VITE_FIREBASE_EMULATOR is not true. ' +
        'Refusing to start because the web Firebase config falls back to the production project.',
    );
  }
  const projectId = String(env.VITE_FIREBASE_EMULATOR_PROJECT_ID || 'cardiovault-emulator-test');
  if (projectId === PRODUCTION_PROJECT_ID) {
    throw new Error(
      `LOCAL PREVIEW BLOCKED: emulator project id resolves to the production project (${PRODUCTION_PROJECT_ID}).`,
    );
  }
}

/** Workspace id used by the preview seed. Never a real workspace id. */
export const PREVIEW_WORKSPACE_ID = 'preview-local-workspace';

/** Demo identity used by the preview seed. */
export const PREVIEW_USER = {
  uid: 'preview-doctor-uid',
  name: 'Dr. Local Preview',
  email: 'preview@cardiovault.local',
} as const;
