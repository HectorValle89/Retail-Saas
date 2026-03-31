import { expect, test } from '@playwright/test'
import { obtenerPanelMateriales } from '../src/features/materiales/services/materialService'

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

test('consolida catalogo, dispersiones, supervisor view y reporte mensual', async () => {
  const fakeClient = createFakeMaterialesClient({
    material_catalogo: {
      data: [
        {
          id: 'cat-1',
          cuenta_cliente_id: 'cuenta-1',
          nombre: 'Tester Fusion Water',
          tipo: 'TESTER',
          cantidad_default: 5,
          requiere_ticket_compra: false,
          requiere_evidencia_obligatoria: true,
          activo: true,
          metadata: {},
          cuenta_cliente: { id: 'cuenta-1', nombre: 'ISDIN' },
        },
      ],
      error: null,
    },
    material_distribucion_mensual: {
      data: [
        {
          id: 'dist-1',
          cuenta_cliente_id: 'cuenta-1',
          pdv_id: 'pdv-1',
          supervisor_empleado_id: 'sup-1',
          confirmado_por_empleado_id: 'emp-1',
          mes_operacion: '2026-03-01',
          estado: 'RECIBIDA_CONFORME',
          firma_recepcion_url: 'firma.png',
          firma_recepcion_hash: 'firma-hash',
          foto_recepcion_url: 'foto.png',
          foto_recepcion_hash: 'foto-hash',
          foto_recepcion_capturada_en: '2026-03-02T10:00:00Z',
          confirmado_en: '2026-03-02T10:00:00Z',
          observaciones: null,
          metadata: {},
          cuenta_cliente: { id: 'cuenta-1', nombre: 'ISDIN' },
          pdv: { id: 'pdv-1', clave_btl: 'BTL-001', nombre: 'Farmacia Centro', zona: 'CENTRO', cadena_id: 'cad-1' },
        },
      ],
      error: null,
    },
    material_distribucion_detalle: {
      data: [
        {
          id: 'det-1',
          distribucion_id: 'dist-1',
          material_catalogo_id: 'cat-1',
          cantidad_enviada: 10,
          cantidad_recibida: 9,
          cantidad_entregada: 4,
          cantidad_observada: 1,
          observaciones: 'Falto una pieza',
          metadata: {},
          material_catalogo: {
            id: 'cat-1',
            nombre: 'Tester Fusion Water',
            tipo: 'TESTER',
            cantidad_default: 5,
            requiere_ticket_compra: false,
            requiere_evidencia_obligatoria: true,
            activo: true,
          },
        },
      ],
      error: null,
    },
    material_entrega_promocional: {
      data: [
        {
          id: 'ent-1',
          cuenta_cliente_id: 'cuenta-1',
          distribucion_id: 'dist-1',
          distribucion_detalle_id: 'det-1',
          material_catalogo_id: 'cat-1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          cantidad_entregada: 4,
          fecha_utc: '2026-03-03T10:00:00Z',
          evidencia_material_url: 'material.jpg',
          evidencia_material_hash: 'hash-1',
          evidencia_pdv_url: 'pdv.jpg',
          evidencia_pdv_hash: 'hash-2',
          ticket_compra_url: null,
          ticket_compra_hash: null,
          observaciones: null,
          metadata: {},
          material_catalogo: { id: 'cat-1', nombre: 'Tester Fusion Water', tipo: 'TESTER' },
          pdv: { id: 'pdv-1', clave_btl: 'BTL-001', nombre: 'Farmacia Centro', zona: 'CENTRO', cadena_id: 'cad-1' },
        },
      ],
      error: null,
    },
    pdv: {
      data: [
        { id: 'pdv-1', clave_btl: 'BTL-001', nombre: 'Farmacia Centro', zona: 'CENTRO', cadena_id: 'cad-1', estatus: 'ACTIVO' },
      ],
      error: null,
    },
    cuenta_cliente: {
      data: [{ id: 'cuenta-1', nombre: 'ISDIN', activa: true }],
      error: null,
    },
    cadena: {
      data: [{ id: 'cad-1', nombre: 'San Pablo' }],
      error: null,
    },
  })

  const data = await obtenerPanelMateriales(fakeClient as never, actor)

  expect(data.infraestructuraLista).toBe(true)
  expect(data.catalog).toHaveLength(1)
  expect(data.distributions).toHaveLength(1)
  expect(data.distributions[0]).toMatchObject({
    totalEnviado: 10,
    totalRecibido: 9,
    totalEntregado: 4,
    totalDisponible: 5,
    cadena: 'San Pablo',
  })
  expect(data.supervisorView).toEqual([
    expect.objectContaining({
      pdvNombre: 'Farmacia Centro',
      enviado: 10,
      recibido: 9,
      entregado: 4,
      restante: 5,
      observaciones: 1,
      evidencias: 2,
    }),
  ])
  expect(data.reportRows).toEqual([
    expect.objectContaining({
      pdv: 'Farmacia Centro',
      material: 'Tester Fusion Water',
      enviado: 10,
      recibido: 9,
      entregado: 4,
      restante: 5,
      observaciones: 1,
      evidencias: 2,
    }),
  ])
})

test('degrada con mensaje de infraestructura cuando faltan las tablas nuevas', async () => {
  const fakeClient = createFakeMaterialesClient({
    material_catalogo: { data: null, error: { message: 'relation material_catalogo does not exist' } },
  })

  const data = await obtenerPanelMateriales(fakeClient as never, actor)

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('material_catalogo')
  expect(data.catalog).toEqual([])
  expect(data.distributions).toEqual([])
})
