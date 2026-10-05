import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  normalizeMaterialEntregaPayloadForOffline,
  processSyncQueueWithRuntime,
  resolveDashboardKpiRefreshDate,
  sortQueueItemsChronologically,
  type SyncQueueRuntime,
} from './syncQueue';
import type {
  OfflineEntity,
  OfflineMaterialEntregaPayload,
  OfflineQueueSummary,
  OfflineSyncQueueItem,
} from './types';

type DraftState = {
  sync_status: 'pending' | 'synced' | 'failed';
  last_error: string | null;
};

function buildQueueItem(
  index: number,
  createdAtMs: number,
  entity: OfflineEntity = index % 2 === 0 ? 'asistencia' : 'venta'
): OfflineSyncQueueItem<Record<string, unknown>> {
  const localStore =
    entity === 'asistencia'
      ? 'asistencia_local'
      : entity === 'venta'
        ? 'venta_local'
        : entity === 'love_is'
          ? 'love_local'
          : 'material_entrega_local';

  return {
    id: `queue-${index}`,
    entity,
    operation: 'upsert',
    local_store: localStore,
    local_record_id: `record-${index}`,
    payload: {
      id: `record-${index}`,
      index,
    },
    status: 'pending',
    conflict_strategy: 'client_wins',
    attempt_count: 0,
    last_error: null,
    created_at: new Date(createdAtMs).toISOString(),
    updated_at: new Date(createdAtMs).toISOString(),
  };
}

function summarizeState(
  queue: OfflineSyncQueueItem<unknown>[],
  drafts: Map<string, DraftState>
): OfflineQueueSummary {
  return {
    pending: queue.filter((item) => item.status === 'pending').length,
    processing: queue.filter((item) => item.status === 'processing').length,
    failed: queue.filter((item) => item.status === 'failed').length,
    asistenciaDrafts: 0,
    ventaDrafts: 0,
    loveDrafts: 0,
    materialEntregaDrafts: 0,
    syncedDrafts: Array.from(drafts.values()).filter((draft) => draft.sync_status === 'synced')
      .length,
  };
}

function createRuntime(
  initialQueue: OfflineSyncQueueItem<unknown>[],
  failingQueueIds: Set<string> = new Set()
) {
  const queue = initialQueue.map((item) => ({ ...item }));
  const drafts = new Map<string, DraftState>(
    initialQueue.map((item) => [item.local_record_id, { sync_status: 'pending', last_error: null }])
  );
  const pushOrder: string[] = [];
  const refreshedFor: string[] = [];
  const remoteIds = new Set<string>();
  let emitted = 0;

  const runtime: SyncQueueRuntime = {
    isBrowser: true,
    isOnline: true,
    getSummary: async () => summarizeState(queue, drafts),
    getQueueItems: async () => queue.map((item) => ({ ...item })),
    updateQueueItem: async (item) => {
      const index = queue.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) {
        queue[index] = { ...item };
      }
    },
    markQueueFailure: async (item, message) => {
      const index = queue.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) {
        queue[index] = {
          ...queue[index],
          status: 'failed',
          attempt_count: queue[index].attempt_count + 1,
          last_error: message,
        };
      }

      drafts.set(item.local_record_id, {
        sync_status: 'failed',
        last_error: message,
      });
    },
    markQueueSuccess: async (item) => {
      const index = queue.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) {
        queue.splice(index, 1);
      }

      drafts.set(item.local_record_id, {
        sync_status: 'synced',
        last_error: null,
      });
      remoteIds.add(item.local_record_id);
    },
    pushQueueItem: async (item) => {
      pushOrder.push(item.id);

      if (failingQueueIds.has(item.id)) {
        throw new Error('forced sync failure');
      }
    },
    refreshDashboardKpis: async (item) => {
      const shouldRefresh =
        item.entity === 'venta' ||
        item.entity === 'love_is' ||
        (item.entity === 'asistencia' &&
          Boolean((item.payload as Record<string, unknown>).check_out_utc));

      if (shouldRefresh) {
        refreshedFor.push(item.local_record_id);
      }
    },
    emitQueueChanged: () => {
      emitted += 1;
    },
  };

  return {
    runtime,
    queue,
    drafts,
    pushOrder,
    refreshedFor,
    remoteIds,
    get emitted() {
      return emitted;
    },
  };
}

describe('offline sync properties', () => {
  it('serializes material last-mile evidence before storing it in IndexedDB', async () => {
    const safariFileLike = {
      name: 'acuse-ios.jpg',
      type: 'image/jpeg',
      size: 11,
      arrayBuffer: async () => new TextEncoder().encode('fake-photo').buffer,
    } as unknown as File;
    const payload: OfflineMaterialEntregaPayload = {
      id: 'material-offline-1',
      cuenta_cliente_id: 'cuenta-1',
      distribucion_id: 'dist-1',
      pdv_id: 'pdv-1',
      cadena_id: null,
      supervisor_empleado_id: 'sup-1',
      dermoconsejero_empleado_id: 'dc-1',
      pdv_snapshot: {},
      cadena_snapshot: {},
      dermoconsejero_snapshot: {},
      correccion_solicitada: {},
      latitud: null,
      longitud: null,
      gps_accuracy_metros: null,
      capturado_en: '2026-05-05T14:25:00.000Z',
      offline_client_id: 'material-ultima-milla-material-offline-1',
      observaciones: 'Completo',
      metadata: {},
      detalles: [
        {
          distribucion_detalle_id: 'detalle-1',
          material_catalogo_id: 'mat-1',
          cantidad_teorica: 12,
          estado_item: 'COMPLETO',
          cantidad_real_recibida: 12,
          observaciones: null,
        },
      ],
      evidencia_entrega_fisica: {
        file: safariFileLike,
        fileName: 'entrega-ios.jpg',
        mimeType: 'image/jpeg',
        fileSize: 11,
        capturedAt: '2026-05-05T14:25:00.000Z',
        localHash: null,
      },
      evidencias_acuse_firmado: [
        {
          file: safariFileLike,
          fileName: 'acuse-ios.jpg',
          mimeType: 'image/jpeg',
          fileSize: 11,
          capturedAt: '2026-05-05T14:25:00.000Z',
          localHash: null,
        },
      ],
    };

    const normalized = await normalizeMaterialEntregaPayloadForOffline(payload);

    expect(normalized.evidencia_entrega_fisica).toMatchObject({
      fileName: 'entrega-ios.jpg',
      mimeType: 'image/jpeg',
      base64Data: expect.any(String),
    });
    expect(normalized.evidencias_acuse_firmado[0]).toMatchObject({
      fileName: 'acuse-ios.jpg',
      mimeType: 'image/jpeg',
      base64Data: expect.any(String),
    });
    expect('file' in normalized.evidencia_entrega_fisica!).toBe(false);
    expect('file' in normalized.evidencias_acuse_firmado[0]).toBe(false);
  });

  it('processes queued items in chronological order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.nat(1_000_000), { minLength: 1, maxLength: 20 }),
        async (timestamps) => {
          const items = timestamps.map((timestamp, index) => buildQueueItem(index, timestamp));
          const state = createRuntime(items);

          await processSyncQueueWithRuntime(state.runtime);

          expect(state.pushOrder).toEqual(
            sortQueueItemsChronologically(items).map((item) => item.id)
          );
          expect(state.emitted).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('is idempotent once a queue has been fully processed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.nat(1_000_000), { minLength: 1, maxLength: 20 }),
        async (timestamps) => {
          const items = timestamps.map((timestamp, index) => buildQueueItem(index, timestamp));
          const state = createRuntime(items);

          const firstRun = await processSyncQueueWithRuntime(state.runtime);
          const secondRun = await processSyncQueueWithRuntime(state.runtime);

          expect(firstRun.processed).toBe(items.length);
          expect(secondRun.processed).toBe(0);
          expect(state.remoteIds.size).toBe(items.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does not lose records when some sync operations fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.nat(1_000_000), { minLength: 1, maxLength: 20 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 19 }), { maxLength: 10 }),
        async (timestamps, failingIndexes) => {
          const items = timestamps.map((timestamp, index) => buildQueueItem(index, timestamp));
          const boundedFailingIds = new Set(
            failingIndexes.filter((index) => index < items.length).map((index) => items[index].id)
          );
          const state = createRuntime(items, boundedFailingIds);

          await processSyncQueueWithRuntime(state.runtime);

          const failedRecordIds = state.queue
            .filter((item) => item.status === 'failed')
            .map((item) => item.local_record_id);

          expect(state.remoteIds.size + failedRecordIds.length).toBe(items.length);
          expect(new Set([...state.remoteIds, ...failedRecordIds]).size).toBe(items.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('supports LOVE ISDIN drafts without dropping local traceability', async () => {
    const items = [
      buildQueueItem(0, Date.UTC(2026, 2, 16, 8, 0, 0), 'love_is'),
      buildQueueItem(1, Date.UTC(2026, 2, 16, 8, 5, 0), 'love_is'),
    ];
    const state = createRuntime(items);

    const result = await processSyncQueueWithRuntime(state.runtime);

    expect(result.processed).toBe(2);
    expect(state.remoteIds).toEqual(new Set(['record-0', 'record-1']));
    expect(Array.from(state.drafts.values())).toEqual([
      { sync_status: 'synced', last_error: null },
      { sync_status: 'synced', last_error: null },
    ]);
    expect(state.refreshedFor).toEqual(['record-0', 'record-1']);
  });

  it('supports material last-mile drafts without refreshing commercial KPIs', async () => {
    const items = [
      buildQueueItem(0, Date.UTC(2026, 2, 16, 8, 0, 0), 'material_entrega'),
      buildQueueItem(1, Date.UTC(2026, 2, 16, 8, 5, 0), 'material_entrega'),
    ];
    const state = createRuntime(items);

    const result = await processSyncQueueWithRuntime(state.runtime);

    expect(result.processed).toBe(2);
    expect(state.remoteIds).toEqual(new Set(['record-0', 'record-1']));
    expect(state.refreshedFor).toEqual([]);
  });

  it('refreshes dashboard KPIs only for ventas and asistencia closures', async () => {
    const openAsistencia = buildQueueItem(0, Date.UTC(2026, 2, 16, 8, 0, 0), 'asistencia');
    openAsistencia.payload = { ...openAsistencia.payload, check_out_utc: null };

    const closedAsistencia = buildQueueItem(1, Date.UTC(2026, 2, 16, 8, 5, 0), 'asistencia');
    closedAsistencia.payload = {
      ...closedAsistencia.payload,
      check_out_utc: '2026-03-16T15:00:00.000Z',
    };

    const venta = buildQueueItem(2, Date.UTC(2026, 2, 16, 8, 10, 0), 'venta');
    const love = buildQueueItem(3, Date.UTC(2026, 2, 16, 8, 15, 0), 'love_is');
    love.payload = { ...love.payload, fecha_utc: '2026-03-16T18:30:00.000Z' };
    const state = createRuntime([openAsistencia, closedAsistencia, venta, love]);

    await processSyncQueueWithRuntime(state.runtime);

    expect(state.refreshedFor).toEqual(['record-1', 'record-2', 'record-3']);
  });

  it('derives the affected operation date for incremental dashboard refreshes', () => {
    const openAsistencia = buildQueueItem(0, Date.UTC(2026, 2, 16, 8, 0, 0), 'asistencia');
    openAsistencia.payload = {
      ...openAsistencia.payload,
      fecha_operacion: '2026-03-16',
      check_out_utc: null,
    };

    const closedAsistencia = buildQueueItem(1, Date.UTC(2026, 2, 16, 8, 5, 0), 'asistencia');
    closedAsistencia.payload = {
      ...closedAsistencia.payload,
      fecha_operacion: '2026-03-16',
      check_out_utc: '2026-03-16T15:00:00.000Z',
    };

    const venta = buildQueueItem(2, Date.UTC(2026, 2, 17, 4, 10, 0), 'venta');
    venta.payload = {
      ...venta.payload,
      fecha_utc: '2026-03-17T04:10:00.000Z',
    };
    const love = buildQueueItem(3, Date.UTC(2026, 2, 17, 19, 0, 0), 'love_is');
    love.payload = {
      ...love.payload,
      fecha_utc: '2026-03-17T19:00:00.000Z',
    };

    expect(resolveDashboardKpiRefreshDate(openAsistencia)).toBeNull();
    expect(resolveDashboardKpiRefreshDate(closedAsistencia)).toBe('2026-03-16');
    expect(resolveDashboardKpiRefreshDate(venta)).toBe('2026-03-16');
    expect(resolveDashboardKpiRefreshDate(love)).toBe('2026-03-17');
  });
});
