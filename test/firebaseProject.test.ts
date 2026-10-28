import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PRODUCTION_PROJECT_ID,
  DEFAULT_EMULATOR_PROJECT_ID,
  UnsafeFirebaseConfigError,
  derivedFirebaseHosts,
  resolveFirebaseProjectId,
} from '../src/config/firebaseProject.ts';

const prod = PRODUCTION_PROJECT_ID;

test('emulator mode resolves the emulator project, never production', () => {
  assert.equal(
    resolveFirebaseProjectId({
      env: { VITE_FIREBASE_EMULATOR: 'true' },
      isDevServer: false,
    }),
    DEFAULT_EMULATOR_PROJECT_ID,
  );
  assert.equal(
    resolveFirebaseProjectId({
      env: {
        VITE_FIREBASE_EMULATOR: 'true',
        VITE_FIREBASE_EMULATOR_PROJECT_ID: 'cardiovault-preview-local',
      },
      isDevServer: true,
    }),
    'cardiovault-preview-local',
  );
});

test('emulator mode refuses a production emulator project id', () => {
  assert.throws(
    () =>
      resolveFirebaseProjectId({
        env: {
          VITE_FIREBASE_EMULATOR: 'true',
          VITE_FIREBASE_EMULATOR_PROJECT_ID: prod,
        },
        isDevServer: false,
      }),
    UnsafeFirebaseConfigError,
  );
});

test('a local preview without the emulator flag fails closed', () => {
  assert.throws(
    () =>
      resolveFirebaseProjectId({
        env: { VITE_LOCAL_PREVIEW: 'true', VITE_FIREBASE_PROJECT_ID: prod },
        isDevServer: false,
      }),
    /VITE_FIREBASE_EMULATOR/,
  );
});

test('a missing project id is an error, never a silent production fallback', () => {
  assert.throws(
    () => resolveFirebaseProjectId({ env: {}, isDevServer: false }),
    /VITE_FIREBASE_PROJECT_ID is not set/,
  );
});

test('a dev server pointed at production is refused unless explicitly allowed', () => {
  assert.throws(
    () =>
      resolveFirebaseProjectId({
        env: { VITE_FIREBASE_PROJECT_ID: prod },
        isDevServer: true,
      }),
    /production project/,
  );
  assert.equal(
    resolveFirebaseProjectId({
      env: { VITE_FIREBASE_PROJECT_ID: prod, VITE_ALLOW_PRODUCTION_FIREBASE: 'true' },
      isDevServer: true,
    }),
    prod,
  );
});

test('an explicit production build keeps the production id', () => {
  assert.equal(
    resolveFirebaseProjectId({
      env: { VITE_FIREBASE_PROJECT_ID: prod },
      isDevServer: false,
    }),
    prod,
  );
});

test('auth domain and storage bucket follow the resolved project', () => {
  assert.deepEqual(derivedFirebaseHosts('cardiovault-preview-local'), {
    authDomain: 'cardiovault-preview-local.firebaseapp.com',
    storageBucket: 'cardiovault-preview-local.firebasestorage.app',
  });
});

// Guard against a regression that reintroduces the silent fallback in the file
// that actually builds the Firebase config.
test('webFirebase has no hardcoded production project fallback', () => {
  const source = fs.readFileSync('src/services/webFirebase.ts', 'utf8');
  assert.equal(
    /\|\|\s*['"]ccu-notebook['"]/.test(source),
    false,
    'webFirebase.ts still contains a silent ccu-notebook fallback',
  );
  assert.equal(
    source.includes('resolveFirebaseProjectId'),
    true,
    'webFirebase.ts must resolve the project id through the fail-closed helper',
  );
});
