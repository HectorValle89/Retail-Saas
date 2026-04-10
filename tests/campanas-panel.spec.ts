import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { obtenerPanelCampanas } from '../src/features/campanas/services/campanaService'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function applyFilters(
  rows: unknown[],
  eqFilters: Array<{ column: string; value: string }>,
  inFilters: Array<{ column: string; values: string[] }>,
  isFilters: Array<{ column: string; value: unknown }>
) {
  return rows.filter((row) => {
    const record = row as Record<string, unknown>
    const eqOk = eqFilters.every((filter) => String(record[filter.column] ?? '') === String(filter.value))
    const inOk = inFilters.every((filter) => filter.values.includes(String(record[filter.column] ?? '')))
    const isOk = isFilters.every((filter) => (record[filter.column] ?? null) === filter.value)
    return eqOk && inOk && isOk
  })
}

function createFakeCampaignServiceClient(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      const eqFilters: Array<{ column: string; value: string }> = []
      const inFilters: Array<{ column: string; values: string[] }> = []
      const isFilters: Array<{ column: string; value: unknown }> = []

      const builder = {
        select() {
          return builder
        },
        eq(column: string, value: string) {
          eqFilters.push({ column, value })
          return builder
        },
        in(column: string, values: string[]) {
          inFilters.push({ column, values })
          return builder
        },
        is(column: string, value: unknown) {
          isFilters.push({ column, value })
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        update(payload: Record<string, unknown>) {
          return {
            in(column: string, values: string[]) {
              const result = results[table] ?? { data: [], error: null }

              if (!Array.isArray(result.data)) {
                return Promise.resolve({ data: null, error: result.error })
              }

              const updatedRows = result.data.map((row) => {
                const record = row as Record<string, unknown>
                return values.includes(String(record[column] ?? '')) ? { ...record, ...payload } : row
              })

              results[table] = {
                data: updatedRows,
                error: null,
              }

              return Promise.resolve({ data: updatedRows, error: null })
            },
          }
        },
        then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
          try {
            const result = results[table] ?? { data: [], error: null }
            if (result.error || !Array.isArray(result.data)) {
              return Promise.resolve(resolve(result))
            }

            return Promise.resolve(
              resolve({
                data: applyFilters(result.data, eqFilters, inFilters, isFilters),
                error: null,
              })
            )
          } catch (error) {
            if (reject) {
              return Promise.resolve(reject(error))
            }

            throw error
          }
        },
      }

      return builder
    },
  }
}

const actorAdmin: ActorActual = {
  authUserId: 'auth-admin',
  usuarioId: 'user-admin',
  empleadoId: 'emp-admin',
  cuentaClienteId: null,
  username: 'admin',
  correoElectronico: 'admin@example.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Admin Uno',
  puesto: 'ADMINISTRADOR',
}

test('consolida campanas, PDVs y reporte comercial por DC y PDV', async () => {
  const client = createFakeCampaignServiceClient({
    campana: {
      data: [
        {
          id: 'cam-1',
          cuenta_cliente_id: 'c1',
          cadena_id: 'cadena-1',
          nombre: 'Spring ISDIN',
          descripcion: 'Impulso de visibilidad en anaquel.',
          fecha_inicio: '2026-03-10',
          fecha_fin: '2026-03-20',
          estado: 'ACTIVA',
          productos_foco: ['prod-1'],
          cuota_adicional: 1500,
          instrucciones: 'Exhibicion frontal y testeo.',
          evidencias_requeridas: ['Foto cabecera', 'Foto POP'],
          metadata: {},
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-11T10:00:00.000Z',
        },
        {
          id: 'cam-2',
          cuenta_cliente_id: 'c2',
          cadena_id: null,
          nombre: 'Otra cuenta',
          descripcion: null,
          fecha_inicio: '2026-03-01',
          fecha_fin: '2026-03-31',
          estado: 'ACTIVA',
          productos_foco: [],
          cuota_adicional: 500,
          instrucciones: null,
          evidencias_requeridas: [],
          metadata: {},
          created_at: '2026-03-01T10:00:00.000Z',
          updated_at: '2026-03-01T10:00:00.000Z',
        },
      ],
      error: null,
    },
    campana_pdv: {
      data: [
        {
          id: 'cp-1',
          campana_id: 'cam-1',
          cuenta_cliente_id: 'c1',
          pdv_id: 'pdv-1',
          dc_empleado_id: 'dc-1',
          tareas_requeridas: ['Instalar POP', 'Enviar selfie'],
          tareas_cumplidas: ['Instalar POP'],
          estatus_cumplimiento: 'EN_PROGRESO',
          avance_porcentaje: 50,
          evidencias_cargadas: 1,
          comentarios: 'Pendiente cierre',
          metadata: {},
          created_at: '2026-03-10T11:00:00.000Z',
          updated_at: '2026-03-11T11:00:00.000Z',
        },
        {
          id: 'cp-2',
          campana_id: 'cam-1',
          cuenta_cliente_id: 'c1',
          pdv_id: 'pdv-2',
          dc_empleado_id: 'dc-1',
          tareas_requeridas: ['Instalar POP'],
          tareas_cumplidas: ['Instalar POP'],
          estatus_cumplimiento: 'CUMPLIDA',
          avance_porcentaje: 100,
          evidencias_cargadas: 2,
          comentarios: null,
          metadata: {},
          created_at: '2026-03-10T11:00:00.000Z',
          updated_at: '2026-03-12T11:00:00.000Z',
        },
        {
          id: 'cp-3',
          campana_id: 'cam-2',
          cuenta_cliente_id: 'c2',
          pdv_id: 'pdv-3',
          dc_empleado_id: 'dc-2',
          tareas_requeridas: ['Otro'],
          tareas_cumplidas: [],
          estatus_cumplimiento: 'PENDIENTE',
          avance_porcentaje: 0,
          evidencias_cargadas: 0,
          comentarios: null,
          metadata: {},
          created_at: '2026-03-10T11:00:00.000Z',
          updated_at: '2026-03-10T11:00:00.000Z',
        },
      ],
      error: null,
    },
    cuenta_cliente_pdv: {
      data: [
        { id: 'rel-1', cuenta_cliente_id: 'c1', pdv_id: 'pdv-1', activo: true, fecha_fin: null },
        { id: 'rel-2', cuenta_cliente_id: 'c1', pdv_id: 'pdv-2', activo: true, fecha_fin: null },
        { id: 'rel-3', cuenta_cliente_id: 'c2', pdv_id: 'pdv-3', activo: true, fecha_fin: null },
      ],
      error: null,
    },
    cuenta_cliente: {
      data: [
        { id: 'c1', identificador: 'isdin_mexico', nombre: 'ISDIN Mexico', activa: true },
        { id: 'c2', identificador: 'be_te_ele_demo', nombre: 'Be Te Ele Demo', activa: true },
      ],
      error: null,
    },
    pdv: {
      data: [
        { id: 'pdv-1', clave_btl: 'SP001', nombre: 'San Pablo Valle', zona: 'NORTE', direccion: 'Av Uno', cadena_id: 'cadena-1', estatus: 'ACTIVO' },
        { id: 'pdv-2', clave_btl: 'SP002', nombre: 'San Pablo Centro', zona: 'CENTRO', direccion: 'Av Dos', cadena_id: 'cadena-1', estatus: 'ACTIVO' },
        { id: 'pdv-3', clave_btl: 'SP003', nombre: 'Otro PDV', zona: 'SUR', direccion: 'Av Tres', cadena_id: null, estatus: 'ACTIVO' },
      ],
      error: null,
    },
    cadena: {
      data: [{ id: 'cadena-1', codigo: 'SAN', nombre: 'San Pablo' }],
      error: null,
    },
    producto: {
      data: [{ id: 'prod-1', sku: 'SKU-1', nombre: 'Producto completo', nombre_corto: 'Foco', activo: true }],
      error: null,
    },
    asignacion: {
      data: [
        {
          id: 'asg-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'dc-1',
          supervisor_empleado_id: 'sup-1',
          pdv_id: 'pdv-1',
          fecha_inicio: '2026-03-01',
          fecha_fin: '2026-03-31',
          estado_publicacion: 'PUBLICADA',
          created_at: '2026-03-01T10:00:00.000Z',
        },
        {
          id: 'asg-2',
          cuenta_cliente_id: 'c1',
          empleado_id: 'dc-1',
          supervisor_empleado_id: 'sup-1',
          pdv_id: 'pdv-2',
          fecha_inicio: '2026-03-01',
          fecha_fin: '2026-03-31',
          estado_publicacion: 'PUBLICADA',
          created_at: '2026-03-01T10:00:00.000Z',
        },
      ],
      error: null,
    },
    empleado: {
      data: [
        { id: 'dc-1', nombre_completo: 'Ana DC', puesto: 'DERMOCONSEJERO' },
        { id: 'sup-1', nombre_completo: 'Luis Supervisor', puesto: 'SUPERVISOR' },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelCampanas(actorAdmin, {
    scopeAccountId: 'c1',
    serviceClient: client as never,
  })

  expect(data.infraestructuraLista).toBe(true)
  expect(data.puedeGestionar).toBe(true)
  expect(data.resumen).toMatchObject({
    totalCampanas: 1,
    activas: 0,
    pdvsObjetivo: 2,
    pdvsCumplidos: 1,
    cuotaAdicionalTotal: 1500,
  })
  expect(data.campanas[0]).toMatchObject({
    id: 'cam-1',
    nombre: 'Spring ISDIN',
    cuentaCliente: 'ISDIN Mexico',
    cadena: 'San Pablo',
    estado: 'CERRADA',
    totalPdvs: 2,
    pdvsCumplidos: 1,
  })
  expect(data.campanas[0].productosFoco).toEqual(['SKU-1 - Foco'])
  expect(data.reportePorDc[0]).toMatchObject({
    empleado: 'Ana DC',
    pdvsObjetivo: 2,
    pdvsCumplidos: 1,
  })
  expect(data.reportePorPdv).toHaveLength(2)
  expect(data.pdvsDisponibles).toHaveLength(2)
})

test('filtra campanas por PDVs asignados cuando entra una dermoconsejera', async () => {
  const client = createFakeCampaignServiceClient({
    campana: {
      data: [
        {
          id: 'cam-1',
          cuenta_cliente_id: 'c1',
          cadena_id: null,
          nombre: 'Campana DC',
          descripcion: null,
          fecha_inicio: '2026-03-10',
          fecha_fin: '2026-03-20',
          estado: 'ACTIVA',
          productos_foco: [],
          cuota_adicional: 0,
          instrucciones: null,
          evidencias_requeridas: [],
          metadata: {},
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-10T10:00:00.000Z',
        },
      ],
      error: null,
    },
    campana_pdv: {
      data: [
        {
          id: 'cp-1',
          campana_id: 'cam-1',
          cuenta_cliente_id: 'c1',
          pdv_id: 'pdv-1',
          dc_empleado_id: 'dc-1',
          tareas_requeridas: ['POP'],
          tareas_cumplidas: [],
          estatus_cumplimiento: 'PENDIENTE',
          avance_porcentaje: 0,
          evidencias_cargadas: 0,
          comentarios: null,
          metadata: {},
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-10T10:00:00.000Z',
        },
        {
          id: 'cp-2',
          campana_id: 'cam-1',
          cuenta_cliente_id: 'c1',
          pdv_id: 'pdv-2',
          dc_empleado_id: 'dc-2',
          tareas_requeridas: ['POP'],
          tareas_cumplidas: [],
          estatus_cumplimiento: 'PENDIENTE',
          avance_porcentaje: 0,
          evidencias_cargadas: 0,
          comentarios: null,
          metadata: {},
          created_at: '2026-03-10T10:00:00.000Z',
          updated_at: '2026-03-10T10:00:00.000Z',
        },
      ],
      error: null,
    },
    cuenta_cliente_pdv: {
      data: [
        { id: 'rel-1', cuenta_cliente_id: 'c1', pdv_id: 'pdv-1', activo: true, fecha_fin: null },
        { id: 'rel-2', cuenta_cliente_id: 'c1', pdv_id: 'pdv-2', activo: true, fecha_fin: null },
      ],
      error: null,
    },
    cuenta_cliente: {
      data: [{ id: 'c1', identificador: 'isdin_mexico', nombre: 'ISDIN Mexico', activa: true }],
      error: null,
    },
    pdv: {
      data: [
        { id: 'pdv-1', clave_btl: 'SP001', nombre: 'San Pablo Valle', zona: 'NORTE', direccion: 'Av Uno', cadena_id: null, estatus: 'ACTIVO' },
        { id: 'pdv-2', clave_btl: 'SP002', nombre: 'San Pablo Centro', zona: 'CENTRO', direccion: 'Av Dos', cadena_id: null, estatus: 'ACTIVO' },
      ],
      error: null,
    },
    cadena: {
      data: [],
      error: null,
    },
    producto: {
      data: [],
      error: null,
    },
    asignacion: {
      data: [
        {
          id: 'asg-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'dc-1',
          supervisor_empleado_id: 'sup-1',
          pdv_id: 'pdv-1',
          fecha_inicio: '2026-03-01',
          fecha_fin: '2026-03-31',
          estado_publicacion: 'PUBLICADA',
          created_at: '2026-03-01T10:00:00.000Z',
        },
        {
          id: 'asg-2',
          cuenta_cliente_id: 'c1',
          empleado_id: 'dc-2',
          supervisor_empleado_id: 'sup-1',
          pdv_id: 'pdv-2',
          fecha_inicio: '2026-03-01',
          fecha_fin: '2026-03-31',
          estado_publicacion: 'PUBLICADA',
          created_at: '2026-03-01T10:00:00.000Z',
        },
      ],
      error: null,
    },
    empleado: {
      data: [{ id: 'dc-1', nombre_completo: 'Ana DC', puesto: 'DERMOCONSEJERO' }],
      error: null,
    },
  })

  const data = await obtenerPanelCampanas(
    {
      ...actorAdmin,
      empleadoId: 'dc-1',
      cuentaClienteId: 'c1',
      puesto: 'DERMOCONSEJERO',
      nombreCompleto: 'Ana DC',
    },
    {
      serviceClient: client as never,
    }
  )

  expect(data.puedeGestionar).toBe(false)
  expect(data.campanas).toHaveLength(1)
  expect(data.campanas[0].pdvs).toHaveLength(1)
  expect(data.campanas[0].pdvs[0].pdvId).toBe('pdv-1')
  expect(data.reportePorPdv).toHaveLength(1)
})

test('degrada el panel cuando la tabla campana no esta disponible', async () => {
  const client = createFakeCampaignServiceClient({
    campana: {
      data: null,
      error: { message: 'relation "public.campana" does not exist' },
    },
    campana_pdv: {
      data: [],
      error: null,
    },
    cuenta_cliente_pdv: {
      data: [],
      error: null,
    },
    cuenta_cliente: {
      data: [],
      error: null,
    },
  })

  const data = await obtenerPanelCampanas(actorAdmin, {
    serviceClient: client as never,
  })

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('campana')
})