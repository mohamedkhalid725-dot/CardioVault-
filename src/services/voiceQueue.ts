// Persistent voice-upload queue (Android proxy path). Every recording is
// saved BEFORE uploading; items survive app restart via IndexedDB.
// States: pending -> uploading -> done | failed. Nothing here touches the
// patient record or the global offline screen.
export type VoiceQueueState = 'pending' | 'uploading' | 'done' | 'failed';

export interface VoiceQueueResult {
  raw_transcript: string;
  clean_english: string;
  uncertain: string[];
  warnings: string[];
}

export interface VoiceQueueItem {
  id: string;
  patientId: string;
  fieldId: string;
  fieldLabel: string;
  mimeType: string;
  audioBase64: string;
  createdAt: number;
  attempts: number;
  state: VoiceQueueState;
  lastError?: string;
  result?: VoiceQueueResult;
}

export const VOICE_QUEUE_MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = [2000, 8000, 30000, 120000, 300000];

export function backoffMs(attempts: number): number {
  const i = Math.max(0, Math.min(attempts, RETRY_BACKOFF_MS.length - 1));
  return RETRY_BACKOFF_MS[i];
}

export function queueKey(patientId: string, fieldId: string): string {
  return `${patientId}::${fieldId}`;
}

export function isRetryableCode(code: string): boolean {
  return code === 'quota_will_retry' || code === 'saved_will_retry';
}

export function canRetry(item: VoiceQueueItem): boolean {
  return item.state === 'failed' && item.attempts < VOICE_QUEUE_MAX_ATTEMPTS;
}

// Auto-retry (on reconnect) is limited to transient failures: pending items
// and failures caused by network/quota errors. Auth and request errors
// (401/400/413) NEVER auto-retry — they need the doctor to act first, and
// manual Retry stays available for the sign-in case.
export function isAutoRetryable(item: VoiceQueueItem): boolean {
  if (item.attempts >= VOICE_QUEUE_MAX_ATTEMPTS) return false;
  if (item.state === 'pending') return true;
  return item.state === 'failed' && isRetryableCode(item.lastError ?? '');
}

export function markForRetry(item: VoiceQueueItem): VoiceQueueItem {
  return { ...item, state: 'pending', attempts: item.attempts + 1, lastError: undefined };
}

export interface QueueStore {
  list(): VoiceQueueItem[];
  get(id: string): VoiceQueueItem | undefined;
  add(item: VoiceQueueItem): void;
  update(id: string, patch: Partial<VoiceQueueItem>): void;
  remove(id: string): void;
}

export function createMemoryQueueStore(): QueueStore {
  const items = new Map<string, VoiceQueueItem>();
  return {
    list: () => [...items.values()],
    get: (id) => items.get(id),
    add: (item) => {
      items.set(item.id, item);
    },
    update: (id, patch) => {
      const cur = items.get(id);
      if (cur) items.set(id, { ...cur, ...patch });
    },
    remove: (id) => {
      items.delete(id);
    },
  };
}

let idCounter = 0;
export function enqueueItem(
  store: QueueStore,
  input: {
    patientId: string;
    fieldId: string;
    fieldLabel: string;
    mimeType: string;
    audioBase64: string;
  },
): VoiceQueueItem {
  idCounter += 1;
  const item: VoiceQueueItem = {
    ...input,
    id: `vq-${Date.now()}-${idCounter}`,
    createdAt: Date.now(),
    attempts: 0,
    state: 'pending',
  };
  store.add(item);
  return item;
}

// ---- Browser persistence (IndexedDB). Never imported by node tests. ----

const DB_NAME = 'cardiovault-voice-queue';
const DB_STORE = 'items';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('Voice queue storage is unavailable.'));
  });
}

export async function idbListItems(): Promise<VoiceQueueItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve((req.result as VoiceQueueItem[]) ?? []);
    req.onerror = () => reject(new Error('Voice queue storage is unavailable.'));
  });
}

export async function idbPutItem(item: VoiceQueueItem): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Voice queue storage is unavailable.'));
  });
}

export async function idbRemoveItem(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Voice queue storage is unavailable.'));
  });
}

export function blobToBase64String(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the recording.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',').pop() || '' : value);
    };
    reader.readAsDataURL(blob);
  });
}
