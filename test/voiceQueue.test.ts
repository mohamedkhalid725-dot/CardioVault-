import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_QUEUE_MAX_ATTEMPTS,
  backoffMs,
  canRetry,
  createMemoryQueueStore,
  enqueueItem,
  markForRetry,
  queueKey,
} from '../src/services/voiceQueue.ts';

test('enqueue starts as pending with attempts at zero', () => {
  const store = createMemoryQueueStore();
  const item = enqueueItem(store, {
    patientId: 'p1',
    fieldId: 'chestPain',
    fieldLabel: 'Chest pain',
    mimeType: 'audio/aac',
    audioBase64: 'AAA=',
  });
  assert.equal(item.state, 'pending');
  assert.equal(item.attempts, 0);
  assert.ok(item.id);
});

test('queue transitions uploading -> done', () => {
  const store = createMemoryQueueStore();
  const item = enqueueItem(store, {
    patientId: 'p1',
    fieldId: 'f',
    fieldLabel: 'F',
    mimeType: 'audio/aac',
    audioBase64: 'AAA=',
  });
  store.update(item.id, { state: 'uploading' });
  store.update(item.id, {
    state: 'done',
    result: { raw_transcript: 'r', clean_english: 'c', uncertain: [], warnings: [] },
  });
  assert.equal(store.get(item.id)?.state, 'done');
  assert.equal(store.get(item.id)?.result?.clean_english, 'c');
});

test('failed item can retry with backoff until attempts run out', () => {
  const store = createMemoryQueueStore();
  let item = enqueueItem(store, {
    patientId: 'p1',
    fieldId: 'f',
    fieldLabel: 'F',
    mimeType: 'audio/aac',
    audioBase64: 'AAA=',
  });
  store.update(item.id, { state: 'failed', lastError: 'saved_will_retry' });
  item = store.get(item.id)!;
  assert.equal(canRetry(item), true);
  const retried = markForRetry(item);
  assert.equal(retried.state, 'pending');
  assert.equal(retried.attempts, 1);
  store.update(item.id, { state: 'failed', attempts: VOICE_QUEUE_MAX_ATTEMPTS });
  assert.equal(canRetry(store.get(item.id)!), false);
});

test('backoff grows with attempts', () => {
  assert.ok(backoffMs(1) > backoffMs(0));
  assert.ok(backoffMs(4) >= backoffMs(3));
});

test('queue key combines patient and field', () => {
  assert.equal(queueKey('p1', 'chestPain'), 'p1::chestPain');
});
