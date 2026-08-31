import { createModelAsset, createTextureAsset, MAX_MODEL_FILE_BYTES, MAX_TEXTURE_FILE_BYTES } from './files';
import type { ModelAsset, TextureAsset } from '../types';

const DATABASE_NAME = 'spatial-forge-assets';
const STORE_NAME = 'assets';
const DATABASE_VERSION = 1;
const MAX_STORED_ASSETS = 100;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredAsset {
  id: string;
  kind: 'texture' | 'model';
  name: string;
  mimeType: string;
  blob: Blob;
  size: number;
  createdAt: number;
}

let databasePromise: Promise<IDBDatabase> | undefined;
let hydrationPromise: Promise<{ textures: TextureAsset[]; models: ModelAsset[] }> | undefined;

function openDatabase() {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Локальная библиотека недоступна.'));
    request.onblocked = () => reject(new Error('Закройте другие вкладки Spatial Forge и повторите.'));
  });
  return databasePromise;
}

function completeTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Не удалось обновить локальную библиотеку.'));
    transaction.onabort = () => reject(new Error('Запись в локальную библиотеку отменена браузером.'));
  });
}

export async function persistAsset(kind: StoredAsset['kind'], asset: TextureAsset | ModelAsset, file: File) {
  const allowed = kind === 'texture'
    ? ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size <= MAX_TEXTURE_FILE_BYTES
    : ['model/gltf-binary', 'application/octet-stream', ''].includes(file.type) && file.size <= MAX_MODEL_FILE_BYTES;
  if (!uuidPattern.test(asset.id) || !allowed || file.size !== asset.size) throw new Error('Файл не прошёл проверку для локального хранения.');
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const record: StoredAsset = { id: asset.id, kind, name: asset.name.slice(0, 100), mimeType: file.type, blob: file, size: file.size, createdAt: Date.now() };
  transaction.objectStore(STORE_NAME).put(record);
  await completeTransaction(transaction);
}

export async function deletePersistedAsset(id: string) {
  if (!uuidPattern.test(id)) return;
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(id);
  await completeTransaction(transaction);
}

async function readStoredRecords() {
  const database = await openDatabase();
  return new Promise<StoredAsset[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).openCursor();
    const records: StoredAsset[] = []; let totalBytes = 0;
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || records.length >= MAX_STORED_ASSETS || totalBytes >= MAX_TOTAL_BYTES) { resolve(records); return; }
      const value = cursor.value as unknown;
      if (typeof value === 'object' && value !== null) {
        const record = value as Partial<StoredAsset>;
        const maximum = record.kind === 'texture' ? MAX_TEXTURE_FILE_BYTES : MAX_MODEL_FILE_BYTES;
        if (uuidPattern.test(String(record.id)) && ['texture', 'model'].includes(String(record.kind)) && typeof record.name === 'string'
          && record.name.length <= 100 && typeof record.mimeType === 'string' && record.mimeType.length <= 100
          && record.blob instanceof Blob && typeof record.size === 'number' && record.size === record.blob.size
          && record.size > 0 && record.size <= maximum && totalBytes + record.size <= MAX_TOTAL_BYTES) {
          records.push(record as StoredAsset); totalBytes += record.size;
        }
      }
      cursor.continue();
    };
    request.onerror = () => reject(new Error('Не удалось прочитать локальную библиотеку.'));
  });
}

async function hydrateStoredAssets() {
  const records = await readStoredRecords();
  const textures: TextureAsset[] = []; const models: ModelAsset[] = [];
  for (const record of records) {
    try {
      const file = new File([record.blob], record.name, { type: record.mimeType });
      if (record.kind === 'texture') {
        const asset = await createTextureAsset(file); textures.push({ ...asset, id: record.id, name: record.name });
      } else {
        const asset = await createModelAsset(file); models.push({ ...asset, id: record.id, name: record.name });
      }
    } catch { /* A modified or obsolete local record is ignored. */ }
  }
  return { textures, models };
}

export function loadPersistedAssets() {
  hydrationPromise ??= hydrateStoredAssets();
  return hydrationPromise;
}
