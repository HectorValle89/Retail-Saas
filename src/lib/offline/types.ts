import type { Asistencia, LoveIsdin, Venta } from '@/types/database';

export type OfflineStoreName =
  | 'asistencia_local'
  | 'venta_local'
  | 'love_local'
  | 'material_entrega_local'
  | 'asignacion_resuelta_local'
  | 'sync_queue'
  | 'meta';

export type OfflineEntity = 'asistencia' | 'venta' | 'love_is' | 'material_entrega';

export type OfflineQueueStatus = 'pending' | 'processing' | 'failed';

export type OfflineConflictStrategy = 'server_wins' | 'client_wins';

export interface OfflineQueuedFile {
  fileName: string;
  mimeType: string;
  fileSize: number;
  capturedAt: string;
  localHash: string | null;
  base64Data: string;
  evidenceRole?: string | null;
}

export interface OfflineQueuedFileInput {
  file: File;
  fileName: string;
  mimeType: string;
  fileSize: number;
  capturedAt: string;
  localHash: string | null;
  evidenceRole?: string | null;
}

export type OfflineAsistenciaPayload = Partial<Asistencia> & {
  id: string;
  offline_selfie_check_in?: OfflineQueuedFile | OfflineQueuedFileInput | null;
  offline_selfie_check_out?: OfflineQueuedFile | OfflineQueuedFileInput | null;
};

export type OfflineVentaPayload = Partial<Venta> & {
  id: string;
};

export type OfflineLovePayload = Partial<LoveIsdin> & {
  id: string;
};

export interface OfflineMaterialEntregaDetallePayload {
  distribucion_detalle_id: string;
  material_catalogo_id: string;
  cantidad_teorica: number;
  estado_item: 'COMPLETO' | 'CON_DISCREPANCIA';
  cantidad_real_recibida: number | null;
  observaciones: string | null;
}

export interface OfflineMaterialEntregaPayload {
  id: string;
  modo?: 'ALTA' | 'CORRECCION';
  correccion_entrega_id?: string | null;
  correccion_client_id?: string | null;
  cuenta_cliente_id: string;
  distribucion_id: string;
  pdv_id: string;
  cadena_id: string | null;
  supervisor_empleado_id: string;
  dermoconsejero_empleado_id: string | null;
  pdv_snapshot: Record<string, unknown>;
  cadena_snapshot: Record<string, unknown>;
  dermoconsejero_snapshot: Record<string, unknown>;
  correccion_solicitada: Record<string, unknown>;
  latitud: number | null;
  longitud: number | null;
  gps_accuracy_metros: number | null;
  capturado_en: string;
  offline_client_id: string;
  observaciones: string | null;
  metadata: Record<string, unknown>;
  detalles: OfflineMaterialEntregaDetallePayload[];
  evidencia_entrega_fisica: OfflineQueuedFile | OfflineQueuedFileInput | null;
  evidencias_acuse_firmado: Array<OfflineQueuedFile | OfflineQueuedFileInput>;
}

export interface OfflineDraftRecord<TPayload> {
  id: string;
  entity: OfflineEntity;
  payload: TPayload;
  sync_status: 'pending' | 'synced' | 'failed';
  queued_at: string;
  synced_at: string | null;
  last_error: string | null;
}

export interface OfflineSyncQueueItem<TPayload = Record<string, unknown>> {
  id: string;
  entity: OfflineEntity;
  operation: 'upsert';
  local_store: Extract<
    OfflineStoreName,
    'asistencia_local' | 'venta_local' | 'love_local' | 'material_entrega_local'
  >;
  local_record_id: string;
  payload: TPayload;
  status: OfflineQueueStatus;
  conflict_strategy: OfflineConflictStrategy;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfflineQueueSummary {
  pending: number;
  processing: number;
  failed: number;
  asistenciaDrafts: number;
  ventaDrafts: number;
  loveDrafts: number;
  materialEntregaDrafts: number;
  syncedDrafts: number;
}
