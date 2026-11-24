import {
  KhataCustomer,
  KhataTransaction,
  ShopSettings,
  TranscriptLogEntry,
} from '../types/khata';

const DB_NAME = 'khataverse_encrypted_v1';
const DB_VERSION = 1;
const STORE_KEYS = 'crypto_keys';
const STORE_RECORDS = 'encrypted_records';
const MASTER_KEY_ID = 'local_aes_gcm_key';

interface EncryptedEnvelope {
  id: string;
  iv: number[];
  ciphertext: number[];
  updatedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getOrCreateAesKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await new Promise<CryptoKey | null>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, 'readonly');
    const store = tx.objectStore(STORE_KEYS);
    const req = store.get(MASTER_KEY_ID);
    req.onsuccess = () => resolve(req.result?.key ?? null);
    req.onerror = () => reject(req.error);
  });

  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable key kept safely in IndexedDB
    ['encrypt', 'decrypt']
  );

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, 'readwrite');
    const store = tx.objectStore(STORE_KEYS);
    const req = store.put({ id: MASTER_KEY_ID, key });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return key;
}

async function writeEncryptedRecord<T>(recordId: string, data: T): Promise<void> {
  const db = await openDatabase();
  const key = await getOrCreateAesKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const envelope: EncryptedEnvelope = {
    id: recordId,
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(encryptedBuffer)),
    updatedAt: new Date().toISOString(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDS);
    const req = store.put(envelope);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function readEncryptedRecord<T>(recordId: string): Promise<T | null> {
  const db = await openDatabase();
  const key = await getOrCreateAesKey(db);

  const envelope = await new Promise<EncryptedEnvelope | null>((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readonly');
    const store = tx.objectStore(STORE_RECORDS);
    const req = store.get(recordId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });

  if (!envelope) return null;

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(envelope.iv) },
      key,
      new Uint8Array(envelope.ciphertext)
    );
    const json = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export const DEFAULT_SETTINGS: ShopSettings = {
  shopName: 'Lakshmi Kirana & General Store',
  preferredLanguage: 'Hinglish',
  onboardingComplete: false,
  demoMode: true,
  voiceOutputEnabled: true,
  streamingTranscriptionPreferred: true,
};

export async function loadKhataState(): Promise<{
  customers: KhataCustomer[] | null;
  transactions: KhataTransaction[] | null;
  settings: ShopSettings | null;
  transcripts: TranscriptLogEntry[];
}> {
  const [customers, transactions, settings, rawTranscripts] = await Promise.all([
    readEncryptedRecord<KhataCustomer[]>('customers'),
    readEncryptedRecord<KhataTransaction[]>('transactions'),
    readEncryptedRecord<ShopSettings>('settings'),
    readEncryptedRecord<TranscriptLogEntry[]>('transcripts'),
  ]);

  // Automatically purge expired transcripts
  const now = Date.now();
  const validTranscripts = (rawTranscripts ?? []).filter(
    (entry) => new Date(entry.expiresAt).getTime() > now
  );
  if (rawTranscripts && validTranscripts.length !== rawTranscripts.length) {
    await writeEncryptedRecord('transcripts', validTranscripts);
  }

  return {
    customers,
    transactions,
    settings,
    transcripts: validTranscripts,
  };
}

export async function saveCustomersEncrypted(customers: KhataCustomer[]): Promise<void> {
  await writeEncryptedRecord('customers', customers);
}

export async function saveTransactionsEncrypted(transactions: KhataTransaction[]): Promise<void> {
  await writeEncryptedRecord('transactions', transactions);
}

export async function saveSettingsEncrypted(settings: ShopSettings): Promise<void> {
  await writeEncryptedRecord('settings', settings);
}

export async function saveTranscriptsEncrypted(transcripts: TranscriptLogEntry[]): Promise<void> {
  await writeEncryptedRecord('transcripts', transcripts);
}

export async function clearTemporaryTranscripts(): Promise<void> {
  await writeEncryptedRecord<TranscriptLogEntry[]>('transcripts', []);
}

export async function eraseAllEncryptedData(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_RECORDS, STORE_KEYS], 'readwrite');
    tx.objectStore(STORE_RECORDS).clear();
    tx.objectStore(STORE_KEYS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
