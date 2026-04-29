import { putRecord, getRecord, deleteRecord, getAllRecords } from './offlineDb'
import type { AsignacionDiariaResuelta } from '@/types/database'

const LAST_SYNC_KEY = 'asignaciones_last_sync_timestamp'

/**
 * Guarda o actualiza un lote de asignaciones en IndexedDB.
 */
export async function saveAsignacionesLocal(rows: AsignacionDiariaResuelta[]) {
  const db = await (await import('./offlineDb')).getDb()
  const tx = db.transaction('asignacion_resuelta_local', 'readwrite')
  const store = tx.objectStore('asignacion_resuelta_local')

  for (const row of rows) {
    await store.put(row)
  }

  await tx.done
}

/**
 * Obtiene el timestamp de la última sincronización exitosa de asignaciones.
 */
export async function getLastAsignacionSyncTimestamp(): Promise<string | null> {
  const record = await getRecord('meta', LAST_SYNC_KEY) as { value: string } | null
  return record?.value ?? null
}

/**
 * Guarda el timestamp de la última sincronización exitosa.
 */
export async function setLastAsignacionSyncTimestamp(timestamp: string) {
  await putRecord('meta', { key: LAST_SYNC_KEY, value: timestamp })
}

/**
 * Obtiene las asignaciones locales para un rango de fechas.
 */
export async function getAsignacionesLocales(fechaInicio: string, fechaFin: string): Promise<AsignacionDiariaResuelta[]> {
  const db = await (await import('./offlineDb')).getDb()
  const store = db.transaction('asignacion_resuelta_local', 'readonly').objectStore('asignacion_resuelta_local')
  const index = store.index('fecha')
  
  // Usamos un rango de IDB para filtrar por fecha
  const range = IDBKeyRange.bound(fechaInicio, fechaFin)
  return await index.getAll(range)
}
