import { describe, expect, it } from 'vitest'
import { shouldAutoSyncOfflineQueue } from './useOfflineSync'

describe('shouldAutoSyncOfflineQueue', () => {
  it('no intenta sincronizar cuando la cola esta vacia', () => {
    expect(
      shouldAutoSyncOfflineQueue({
        pending: 0,
        processing: 0,
        failed: 0,
        asistenciaDrafts: 0,
        ventaDrafts: 0,
        loveDrafts: 0,
        syncedDrafts: 0,
      })
    ).toBe(false)
  })

  it('solo intenta sincronizar cuando existen pendientes', () => {
    expect(
      shouldAutoSyncOfflineQueue({
        pending: 2,
        processing: 0,
        failed: 0,
        asistenciaDrafts: 1,
        ventaDrafts: 1,
        loveDrafts: 0,
        syncedDrafts: 0,
      })
    ).toBe(true)
  })
})
