import type { DBSchema, IDBPDatabase } from 'idb'
import type {
  OfflineDraftRecord,
  OfflineQueueSummary,
  OfflineStoreName,
  OfflineSyncQueueItem,
} from './types'

const DB_NAME = 'retail-offline-db'
const DB_VERSION = 1
const DRAFT_STORES = ['asistencia_local', 'venta_local', 'love_local'] as const

interface OfflineDbSchema extends DBSchema {
  asistencia_local: {
    key: string
    value: OfflineDraftRecord<unknown>
  }
  venta_local: {
    key: string
    value: OfflineDraftRecord<unknown>
  }
  love_local: {
    key: string
    value: OfflineDraftRecord<unknown>
  }
  sync_queue: {
    key: string
    value: OfflineSyncQueueItem<unknown>
    indexes: {
      status: string
      created_at: string
    }
  }
  meta: {
    key: string
    value: Record<string, unknown>
  }
}

let dbPromise: Promise<IDBPDatabase<OfflineDbSchema>> | null = null

async function createDatabase(): Promise<IDBPDatabase<OfflineDbSchema>> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    throw new Error('Offline database requires a browser environment with IndexedDB support')
  }

  const { openDB } = await import('idb')

  return openDB<OfflineDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(database) {
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
    },
  })
}

function getDb() {
  if (!dbPromise) {
    dbPromise = createDatabase()
  }

  return dbPromise
}

export async function putRecord<K extends OfflineStoreName>(
  storeName: K,
  value: OfflineDbSchema[K]['value']
) {
  const db = await getDb()
  await db.put(storeName, value)
  return value
}

export async function getAllRecords(storeName: OfflineStoreName): Promise<Record<string, unknown>[]> {
  const db = await getDb()
  return (await db.getAll(storeName)) as Record<string, unknown>[]
}

export async function getRecord(storeName: OfflineStoreName, id: string) {
  const db = await getDb()
  return (await db.get(storeName, id)) ?? null
}

export async function deleteRecord(storeName: OfflineStoreName, id: string) {
  const db = await getDb()
  await db.delete(storeName, id)
}

export async function getOfflineQueueSummary(): Promise<OfflineQueueSummary> {
  const db = await getDb()
  const [queueItems, asistenciaDrafts, ventaDrafts, loveDrafts] = await Promise.all([
    db.getAll('sync_queue'),
    db.getAll('asistencia_local'),
    db.getAll('venta_local'),
    db.getAll('love_local'),
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
  const db = await getDb()
  const items = await db.getAll('sync_queue')
  return items.sort((left, right) => left.created_at.localeCompare(right.created_at))
}

export async function markDraftSyncState(
  storeName: Extract<OfflineStoreName, 'asistencia_local' | 'venta_local' | 'love_local'>,
  id: string,
  state: Pick<OfflineDraftRecord<unknown>, 'sync_status' | 'synced_at' | 'last_error'>
) {
  const db = await getDb()
  const current = await db.get(storeName, id)

  if (!current) {
    return
  }

  await db.put(storeName, {
    ...current,
    ...state,
  })
}

export const OFFLINE_DRAFT_STORES = DRAFT_STORES
