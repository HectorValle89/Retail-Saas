import { describe, expect, it } from 'vitest'
import { buildModuleCacheTagsFromUiChangeTarget } from './moduleTags'

describe('buildModuleCacheTagsFromUiChangeTarget', () => {
  it('normaliza el periodo al tag de fecha base aunque reciba timestamp completo', () => {
    const tags = buildModuleCacheTagsFromUiChangeTarget({
      module: 'ruta-semanal',
      surface: 'panel',
      scopeKey: 'periodo:2026-04-20T06:00:00.000Z',
      roleTarget: 'SUPERVISOR',
      eventType: 'ruta_control_actualizado',
      metadata: {
        periodo: '2026-04-20T06:00:00.000Z',
      },
    })

    expect(tags).toEqual(
      expect.arrayContaining([
        'module:ruta-semanal',
        'module:ruta-semanal:periodo:2026-04-20',
      ])
    )
  })
})
