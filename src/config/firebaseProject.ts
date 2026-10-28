/**
 * Firebase project resolution — fail closed.
 *
 * The web build used to fall back to the production project id (`ccu-notebook`)
 * whenever an environment variable was missing. That is safe for a release
 * build fired from CI (which always injects the production values) but it is
 * dangerous for a preview or a local `npm run dev` session: a missing variable
 * would silently attach the app to the live project and its live data.
 *
 * The rule implemented here:
 *
 *   1. Emulator mode (`VITE_FIREBASE_EMULATOR=true`) always wins and may never
 *      resolve to the production project.
 *   2. A local preview (`VITE_LOCAL_PREVIEW=true`) requires emulator mode; it
 *      can never fall back to production.
 *   3. A dev server that would resolve to the production project is refused
 *      unless the developer explicitly opts in with
 *      `VITE_ALLOW_PRODUCTION_FIREBASE=true`.
 *   4. Only an explicit production build may use the production id, and even
 *      then it must come from an explicit variable — not from a hidden default.
 *
 * The module is pure so the rules above can be unit tested without a browser.
 */

export const PRODUCTION_PROJECT_ID = 'ccu-notebook';
export const DEFAULT_EMULATOR_PROJECT_ID = 'cardiovault-emulator-test';

export class UnsafeFirebaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeFirebaseConfigError';
  }
}

export type FirebaseEnvLike = Readonly<Record<string, unknown>>;

function read(env: FirebaseEnvLike, key: string): string {
  return String(env[key] ?? '').trim();
}

export function isLocalPreviewEnv(env: FirebaseEnvLike): boolean {
  return read(env, 'VITE_LOCAL_PREVIEW') === 'true';
}

export function isEmulatorEnv(env: FirebaseEnvLike): boolean {
  return read(env, 'VITE_FIREBASE_EMULATOR') === 'true';
}

export function isProductionOptIn(env: FirebaseEnvLike): boolean {
  return read(env, 'VITE_ALLOW_PRODUCTION_FIREBASE') === 'true';
}

export interface ResolveProjectOptions {
  env: FirebaseEnvLike;
  /** True for `vite` / `vite dev` (import.meta.env.DEV). */
  isDevServer: boolean;
}

/**
 * Returns the project id the web SDK must connect to, or throws.
 * Never returns the production project unless the caller explicitly asked for
 * it in a non-preview, non-emulator, non-dev build.
 */
export function resolveFirebaseProjectId({ env, isDevServer }: ResolveProjectOptions): string {
  const preview = isLocalPreviewEnv(env);
  const emulator = isEmulatorEnv(env);
  const explicit = read(env, 'VITE_FIREBASE_PROJECT_ID');

  if (preview && !emulator) {
    throw new UnsafeFirebaseConfigError(
      'LOCAL PREVIEW BLOCKED: VITE_FIREBASE_EMULATOR is not true. ' +
        'Refusing to start because the web Firebase config would fall back to the production project.',
    );
  }

  if (emulator) {
    const emulatorId = read(env, 'VITE_FIREBASE_EMULATOR_PROJECT_ID') || DEFAULT_EMULATOR_PROJECT_ID;
    if (emulatorId === PRODUCTION_PROJECT_ID) {
      throw new UnsafeFirebaseConfigError(
        `LOCAL PREVIEW BLOCKED: the emulator project id resolves to the production project (${PRODUCTION_PROJECT_ID}).`,
      );
    }
    return emulatorId;
  }

  if (explicit === '') {
    throw new UnsafeFirebaseConfigError(
      'FIREBASE CONFIG BLOCKED: VITE_FIREBASE_PROJECT_ID is not set. ' +
        'Production values are never used as a silent fallback; set the variable explicitly.',
    );
  }

  if (explicit === PRODUCTION_PROJECT_ID && (preview || isDevServer) && !isProductionOptIn(env)) {
    throw new UnsafeFirebaseConfigError(
      `FIREBASE CONFIG BLOCKED: this ${preview ? 'preview' : 'dev'} build resolves to the production project ` +
        `(${PRODUCTION_PROJECT_ID}). Use the emulator suite, or set VITE_ALLOW_PRODUCTION_FIREBASE=true ` +
        'if you really mean to talk to production from a dev machine.',
    );
  }

  return explicit;
}

/** Derived host names, kept next to the id so they can never drift apart. */
export function derivedFirebaseHosts(projectId: string): { authDomain: string; storageBucket: string } {
  return {
    authDomain: `${projectId}.firebaseapp.com`,
    storageBucket: `${projectId}.firebasestorage.app`,
  };
}
