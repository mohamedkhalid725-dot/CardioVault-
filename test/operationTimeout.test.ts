import test from 'node:test';
import assert from 'node:assert/strict';
import { withOperationTimeout } from '../src/services/operationTimeout.ts';

test('operation timeout rejects promptly and releases the late-operation guard only after settlement', async () => {
  let settle!: (value: string) => void;
  let guarded = false;
  const operation = new Promise<string>(resolve => { settle = resolve; });
  const result = withOperationTimeout(operation, 5, 'setup timeout', () => { guarded = true; }, () => { guarded = false; });
  await assert.rejects(result, /setup timeout/);
  assert.equal(guarded, true);
  settle('late result');
  await Promise.resolve();
  assert.equal(guarded, false);
});

test('operation timeout leaves a promptly completed operation unchanged', async () => {
  assert.equal(await withOperationTimeout(Promise.resolve('done'), 100, 'should not time out'), 'done');
});
