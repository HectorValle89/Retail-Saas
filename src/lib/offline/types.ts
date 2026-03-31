import type { Asistencia, LoveIsdin, Venta } from '@/types/database'

export type OfflineStoreName =
  | 'asistencia_local'
  | 'venta_local'
  | 'love_local'
  | 'sync_queue'
  | 'meta'

export type OfflineEntity = 'asistencia' | 'venta' | 'love_is'

export type OfflineQueueStatus = 'pending' | 'processing' | 'failed'

export type OfflineConflictStrategy = 'server_wins' | 'client_wins'

export interface OfflineQueuedFile {
  file: File
  fileName: string
  mimeType: string
  fileSize: number
  capturedAt: string
  localHash: string | null
}

export type OfflineAsistenciaPayload = Partial<Asistencia> & {
  id: string
  offline_selfie_check_in?: OfflineQueuedFile | null
  offline_selfie_check_out?: OfflineQueuedFile | null
}

export type OfflineVentaPayload = Partial<Venta> & {
  id: string
}

export type OfflineLovePayload = Partial<LoveIsdin> & {
  id: string
}

export interface OfflineDraftRecord<TPayload> {
  id: string
  entity: OfflineEntity
  payload: TPayload
  sync_status: 'pending' | 'synced' | 'failed'
  queued_at: string
  synced_at: string | null
  last_error: string | null
}

export interface OfflineSyncQueueItem<TPayload = Record<string, unknown>> {
  id: string
  entity: OfflineEntity
  operation: 'upsert'
  local_store: Extract<OfflineStoreName, 'asistencia_local' | 'venta_local' | 'love_local'>
  local_record_id: string
  payload: TPayload
  status: OfflineQueueStatus
  conflict_strategy: OfflineConflictStrategy
  attempt_count: number
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface OfflineQueueSummary {
  pending: number
  processing: number
  failed: number
  asistenciaDrafts: number
  ventaDrafts: number
  loveDrafts: number
  syncedDrafts: number
}
