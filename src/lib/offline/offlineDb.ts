import type {
  OfflineDraftRecord,
  OfflineQueueSummary,
  OfflineStoreName,
  OfflineSyncQueueItem,
} from './types'

const DB_NAME = 'retail-offline-db'
const DB_VERSION = 1

const DRAFT_STORES = ['asistencia_local', 'venta_local', 'love_local'] as const

function ensureIndexedDb() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    throw new Error('IndexedDB no esta disponible en este entorno.')
  }
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Fallo en IndexedDB.'))
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('La transaccion de IndexedDB fallo.'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('La transaccion de IndexedDB fue abortada.'))
  })
}

async function openDatabase() {
  ensureIndexedDb()

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains('asistencia_local')) {
        database.createObjectStore('asistencia_local', { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains('venta_local')) {
        database.createObjectStore('venta_local', { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains('love_local')) {
        database.createObjectStore('love_local', { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains('sync_queue')) {
        const syncStore = database.createObjectStore('sync_queue', { keyPath: 'id' })
        syncStore.createIndex('status', 'status', { unique: false })
        syncStore.createIndex('created_at', 'created_at', { unique: false })
      }

      if (!database.objectStoreNames.contains('meta')) {
        database.createObjectStore('meta', { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No fue posible abrir IndexedDB.'))
  })
}

export async function putRecord<T>(storeName: OfflineStoreName, value: T) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  store.put(value)
  await transactionDone(transaction)
}

export async function getAllRecords<T>(storeName: OfflineStoreName) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const store = transaction.objectStore(storeName)
  const result = await requestToPromise(store.getAll())
  await transactionDone(transaction)
  return result as T[]
}

export async function getRecord<T>(storeName: OfflineStoreName, id: string) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const store = transaction.objectStore(storeName)
  const result = await requestToPromise(store.get(id))
  await transactionDone(transaction)
  return (result as T | undefined) ?? null
}

export async function deleteRecord(storeName: OfflineStoreName, id: string) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  store.delete(id)
  await transactionDone(transaction)
}

export async function getOfflineQueueSummary(): Promise<OfflineQueueSummary> {
  const [queueItems, asistenciaDrafts, ventaDrafts, loveDrafts] = await Promise.all([
    getAllRecords<OfflineSyncQueueItem>('sync_queue'),
    getAllRecords<OfflineDraftRecord<Record<string, unknown>>>('asistencia_local'),
    getAllRecords<OfflineDraftRecord<Record<string, unknown>>>('venta_local'),
    getAllRecords<OfflineDraftRecord<Record<string, unknown>>>('love_local'),
  ])

  return {
    pending: queueItems.filter((item) => item.status === 'pending').length,
    processing: queueItems.filter((item) => item.status === 'processing').length,
    failed: queueItems.filter((item) => item.status === 'failed').length,
    asistenciaDrafts: asistenciaDrafts.length,
    ventaDrafts: ventaDrafts.length,
    loveDrafts: loveDrafts.length,
    syncedDrafts: [...asistenciaDrafts, ...ventaDrafts, ...loveDrafts].filter(
      (item) => item.sync_status === 'synced'
    ).length,
  }
}

export async function getSortedQueueItems() {
  const items = await getAllRecords<OfflineSyncQueueItem>('sync_queue')
  return items.sort((left, right) => left.created_at.localeCompare(right.created_at))
}

export async function markDraftSyncState(
  storeName: Extract<OfflineStoreName, 'asistencia_local' | 'venta_local' | 'love_local'>,
  id: string,
  state: Pick<OfflineDraftRecord<Record<string, unknown>>, 'sync_status' | 'synced_at' | 'last_error'>
) {
  const current = await getRecord<OfflineDraftRecord<Record<string, unknown>>>(storeName, id)

  if (!current) {
    return
  }

  await putRecord(storeName, {
    ...current,
    ...state,
  })
}

export const OFFLINE_DRAFT_STORES = DRAFT_STORES
