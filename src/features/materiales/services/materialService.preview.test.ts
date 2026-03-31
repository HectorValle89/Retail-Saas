import { describe, expect, it } from 'vitest'
import { obtenerPanelMateriales } from './materialService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

type FakeResults = Record<string, QueryResult>

function createFakeMaterialesClient(results: FakeResults) {
  return {
    from(table: string) {
      const entry = results[table] ?? { data: [], error: null }

      const chain = {
        select() {
          return chain
        },
        update() {
          return chain
        },
        eq() {
          return chain
        },
        in() {
          return chain
        },
        order() {
          return chain
        },
        limit() {
          return chain
        },
        maybeSingle() {
          if (Array.isArray(entry.data)) {
            return Promise.resolve({ data: entry.data[0] ?? null, error: entry.error })
          }
          return Promise.resolve(entry)
        },
        then(resolve: (value: QueryResult) => void) {
          return Promise.resolve(entry).then(resolve)
        },
      }

      return chain
    },
  }
}

const actor = {
  authUserId: 'auth-1',
  usuarioId: 'user-1',
  empleadoId: 'emp-1',
  cuentaClienteId: 'cuenta-1',
  username: 'dc_1',
  correoElectronico: 'dc@test.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA' as const,
  nombreCompleto: 'DC Uno',
  puesto: 'ADMINISTRADOR' as const,
}

describe('materialService preview lifecycle', () => {
  it('oculta previews en borrador y deja visibles solo los lotes confirmados', async () => {
    const fakeClient = createFakeMaterialesClient({
      material_catalogo: { data: [], error: null },
      material_distribucion_lote: {
        data: [
          {
            id: 'lot-draft',
            cuenta_cliente_id: 'cuenta-1',
            mes_operacion: '2026-03-01',
            estado: 'BORRADOR_PREVIEW',
            archivo_nombre: 'preview.xlsx',
            archivo_url: null,
            gemini_status: 'SIN_INTENTO',
            advertencias: [],
            resumen: {},
            preview_data: {},
            confirmado_en: null,
            created_at: '2026-03-27T10:00:00Z',
            cuenta_cliente: { id: 'cuenta-1', nombre: 'ISDIN', identificador: 'isdin_mexico' },
          },
          {
            id: 'lot-confirmed',
            cuenta_cliente_id: 'cuenta-1',
            mes_operacion: '2026-03-01',
            estado: 'CONFIRMADO',
            archivo_nombre: 'confirmado.xlsx',
            archivo_url: null,
            gemini_status: 'OK',
            advertencias: [],
            resumen: {},
            preview_data: {},
            confirmado_en: '2026-03-27T11:00:00Z',
            created_at: '2026-03-27T11:00:00Z',
            cuenta_cliente: { id: 'cuenta-1', nombre: 'ISDIN', identificador: 'isdin_mexico' },
          },
        ],
        error: null,
      },
      material_distribucion_mensual: { data: [], error: null },
      material_distribucion_detalle: { data: [], error: null },
      material_entrega_promocional: { data: [], error: null },
      material_inventario_movimiento: { data: [], error: null },
      material_evidencia_mercadeo: { data: [], error: null },
      material_conteo_jornada: { data: [], error: null },
      pdv: { data: [], error: null },
      cuenta_cliente: {
        data: [{ id: 'cuenta-1', nombre: 'ISDIN', identificador: 'isdin_mexico' }],
        error: null,
      },
      cadena: { data: [], error: null },
    })

    const data = await obtenerPanelMateriales(fakeClient as never, actor)

    expect(data.draftLots).toEqual([])
    expect(data.confirmedLots).toHaveLength(1)
    expect(data.confirmedLots[0]?.id).toBe('lot-confirmed')
  })
})
