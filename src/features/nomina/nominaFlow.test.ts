import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  revalidatePathMock,
  requerirOperadorNominaMock,
  createClientMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requerirOperadorNominaMock: vi.fn(),
  createClientMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('@/lib/auth/session', () => ({
  requerirOperadorNomina: requerirOperadorNominaMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

import type { ActorActual } from '@/lib/auth/session'
import { collectReportExportPayload } from '@/features/reportes/services/reporteExport'
import { actualizarEstadoPeriodoNomina } from './actions'
import { obtenerPanelNomina } from './services/nominaService'
import { ESTADO_NOMINA_INICIAL } from './state'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
  count?: number | null
}

function createIntegratedClient(results: Record<string, QueryResult>) {
  const updates = new Map<string, Array<Record<string, unknown>>>()

  return {
    from(table: string) {
      const entry = results[table] ?? { data: [], error: null }
      const state = {
        filters: [] as Array<{ op: string; column: string; value: unknown }>,
      }

      const applyFilters = () => {
        const source = Array.isArray(entry.data) ? [...entry.data] : entry.data

        if (!Array.isArray(source)) {
          return source
        }

        return source.filter((row) => {
          return state.filters.every((filter) => {
            const rowValue = (row as Record<string, unknown>)[filter.column]

            if (filter.op === 'eq') {
              return rowValue === filter.value
            }

            if (filter.op === 'neq') {
              return rowValue !== filter.value
            }

            if (filter.op === 'in') {
              return Array.isArray(filter.value) && filter.value.includes(rowValue)
            }

            if (filter.op === 'gte') {
              return String(rowValue ?? '') >= String(filter.value ?? '')
            }

            if (filter.op === 'lte') {
              return String(rowValue ?? '') <= String(filter.value ?? '')
            }

            if (filter.op === 'lt') {
              return String(rowValue ?? '') < String(filter.value ?? '')
            }

            return true
          })
        })
      }

      const chain = {
        select() {
          return chain
        },
        eq(column: string, value: unknown) {
          state.filters.push({ op: 'eq', column, value })
          return chain
        },
        neq(column: string, value: unknown) {
          state.filters.push({ op: 'neq', column, value })
          return chain
        },
        in(column: string, value: unknown[]) {
          state.filters.push({ op: 'in', column, value })
          return chain
        },
        gte(column: string, value: unknown) {
          state.filters.push({ op: 'gte', column, value })
          return chain
        },
        lte(column: string, value: unknown) {
          state.filters.push({ op: 'lte', column, value })
          return chain
        },
        lt(column: string, value: unknown) {
          state.filters.push({ op: 'lt', column, value })
          return chain
        },
        order() {
          return chain
        },
        limit() {
          return Promise.resolve({
            data: applyFilters(),
            error: entry.error,
            count: entry.count ?? (Array.isArray(entry.data) ? entry.data.length : null),
          })
        },
        then(resolve: (value: QueryResult) => void) {
          return Promise.resolve({
            data: applyFilters(),
            error: entry.error,
            count: entry.count ?? (Array.isArray(entry.data) ? entry.data.length : null),
          }).then(resolve)
        },
        maybeSingle() {
          const filtered = applyFilters()
          return Promise.resolve({
            data: Array.isArray(filtered) ? filtered[0] ?? null : filtered,
            error: entry.error,
          })
        },
        update(payload: Record<string, unknown>) {
          const current = updates.get(table) ?? []
          current.push(payload)
          updates.set(table, current)

          const source = results[table]?.data
          if (Array.isArray(source)) {
            for (const row of source) {
              const matches = state.filters.every((filter) => {
                if (filter.op !== 'eq') {
                  return true
                }
                return (row as Record<string, unknown>)[filter.column] === filter.value
              })

              if (matches) {
                Object.assign(row as Record<string, unknown>, payload)
              }
            }
          }

          return {
            eq(column: string, value: unknown) {
              state.filters.push({ op: 'eq', column, value })
              return Promise.resolve({ error: null })
            },
          }
        },
      }

      return chain
    },
    getUpdates(table: string) {
      return updates.get(table) ?? []
    },
  }
}

const adminActor: ActorActual = {
  authUserId: 'auth-admin',
  usuarioId: 'user-admin',
  empleadoId: 'emp-admin',
  cuentaClienteId: null,
  username: 'admin',
  correoElectronico: 'admin@example.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Admin Principal',
  puesto: 'ADMINISTRADOR',
}

describe('nomina end-to-end flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requerirOperadorNominaMock.mockResolvedValue({
      usuarioId: 'user-admin',
      puesto: 'NOMINA',
      nombreCompleto: 'Nomina Admin',
    })
  })

  it('consolida prenomina con sueldo base, comision y deducciones, luego aprueba, dispersa y exporta', async () => {
    const client = createIntegratedClient({
      nomina_periodo: {
        data: [
          {
            id: 'periodo-1',
            clave: '2026-03-Q1',
            fecha_inicio: '2026-03-10',
            fecha_fin: '2026-03-10',
            estado: 'BORRADOR',
            fecha_cierre: null,
            observaciones: null,
            metadata: { empleados_incluidos: 1 },
          },
        ],
        error: null,
      },
      cuota_empleado_periodo: {
        data: [
          {
            id: 'cuota-1',
            periodo_id: 'periodo-1',
            cuenta_cliente_id: 'c1',
            empleado_id: 'emp-1',
            cadena_id: 'cadena-1',
            objetivo_monto: 1500,
            objetivo_unidades: 3,
            avance_monto: 1800,
            avance_unidades: 4,
            factor_cuota: 1,
            cumplimiento_porcentaje: 120,
            bono_estimado: 200,
            estado: 'CUMPLIDA',
            metadata: { love_objetivo: 2, visitas_objetivo: 1 },
            created_at: '2026-03-10T20:00:00.000Z',
            cuenta_cliente: { nombre: 'ISDIN Mexico' },
            cadena: { nombre: 'Liverpool' },
            empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
            periodo: { clave: '2026-03-Q1', estado: 'BORRADOR' },
          },
        ],
        error: null,
      },
      nomina_ledger: {
        data: [
          {
            id: 'ledger-1',
            periodo_id: 'periodo-1',
            cuenta_cliente_id: 'c1',
            empleado_id: 'emp-1',
            tipo_movimiento: 'PERCEPCION',
            concepto: 'BONO_VENTA',
            referencia_tabla: 'venta',
            referencia_id: 'venta-1',
            monto: 1000,
            moneda: 'MXN',
            notas: 'Bono comercial',
            created_at: '2026-03-10T20:00:00.000Z',
            cuenta_cliente: { nombre: 'ISDIN Mexico' },
            empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
            periodo: { clave: '2026-03-Q1', estado: 'BORRADOR' },
          },
        ],
        error: null,
      },
      asistencia: {
        data: [
          {
            id: 'asis-1',
            cuenta_cliente_id: 'c1',
            empleado_id: 'emp-1',
            empleado_nombre: 'Ana Uno',
            fecha_operacion: '2026-03-10',
            check_in_utc: '2026-03-10T15:00:00.000Z',
            check_out_utc: '2026-03-10T23:00:00.000Z',
            estatus: 'CERRADA',
            cuenta_cliente: { nombre: 'ISDIN Mexico' },
          },
        ],
        error: null,
      },
      venta: {
        data: [
          {
            cuenta_cliente_id: 'c1',
            empleado_id: 'emp-1',
            total_unidades: 4,
            total_monto: 1800,
            fecha_utc: '2026-03-10T15:00:00.000Z',
            confirmada: true,
            cuenta_cliente: { nombre: 'ISDIN Mexico' },
          },
        ],
        error: null,
      },
      configuracion: {
        data: [
          { clave: 'asistencias.tolerancia_checkin_minutos', valor: 15 },
          { clave: 'nomina.bono_cumplimiento_pct', valor: 10 },
          { clave: 'nomina.deduccion_falta_dias', valor: 1 },
          { clave: 'nomina.deduccion_retardo_pct', valor: 10 },
          { clave: 'nomina.imss_pct', valor: 2.5 },
          { clave: 'nomina.isr_pct', valor: 10 },
        ],
        error: null,
      },
      empleado: {
        data: [{ id: 'emp-1', sueldo_base_mensual: 18000 }],
        error: null,
      },
      asignacion: {
        data: [
          {
            id: 'asg-1',
            empleado_id: 'emp-1',
            cuenta_cliente_id: 'c1',
            supervisor_empleado_id: 'sup-1',
            fecha_inicio: '2026-03-10',
            fecha_fin: '2026-03-10',
            tipo: 'FIJA',
            dias_laborales: 'LUN,MAR,MIE,JUE,VIE,SAB,DOM',
            dia_descanso: null,
            horario_referencia: '09:00',
            estado_publicacion: 'PUBLICADA',
          },
        ],
        error: null,
      },
      solicitud: { data: [], error: null },
      ruta_semanal_visita: {
        data: [
          {
            supervisor_empleado_id: 'emp-1',
            cuenta_cliente_id: 'c1',
            estatus: 'COMPLETADA',
            completada_en: '2026-03-08T17:00:00.000Z',
          },
        ],
        error: null,
      },
      gasto: { data: [], error: null },
      love_isdin: {
        data: [
          { empleado_id: 'emp-1', cuenta_cliente_id: 'c1', estatus: 'VALIDA', fecha_utc: '2026-03-09T12:00:00.000Z' },
        ],
        error: null,
      },
      audit_log: { data: [], error: null },
    })

    createClientMock.mockResolvedValue(client)

    const panel = await obtenerPanelNomina(client as never)

    expect(panel.infraestructuraLista).toBe(true)
    expect(panel.periodoActivoId).toBe('periodo-1')
    expect(panel.periodos[0]).toMatchObject({
      estado: 'BORRADOR',
      empleadosIncluidos: 1,
    })
    expect(panel.preNomina[0]).toMatchObject({
      empleado: 'Ana Uno',
      sueldoBaseDiario: 600,
      sueldoBaseDevengado: 600,
      comisionVentas: 180,
      bonoCuotaAplicado: 200,
      percepciones: 1980,
      deduccionImss: 49.5,
      deduccionIsr: 193.05,
      deducciones: 242.55,
      netoEstimado: 1737.45,
    })
    expect(panel.cuotas[0]).toMatchObject({
      semaforo: 'VERDE',
      loveObjetivo: 2,
      visitasObjetivo: 1,
    })

    const aprobar = new FormData()
    aprobar.set('periodo_id', 'periodo-1')
    aprobar.set('estado_destino', 'APROBADO')

    const aprobado = await actualizarEstadoPeriodoNomina(ESTADO_NOMINA_INICIAL, aprobar)
    expect(aprobado.ok).toBe(true)
    expect(client.getUpdates('nomina_periodo')[0]).toMatchObject({ estado: 'APROBADO' })

    const dispersar = new FormData()
    dispersar.set('periodo_id', 'periodo-1')
    dispersar.set('estado_destino', 'DISPERSADO')

    const dispersado = await actualizarEstadoPeriodoNomina(ESTADO_NOMINA_INICIAL, dispersar)
    expect(dispersado.ok).toBe(true)
    expect(client.getUpdates('nomina_periodo')[1]).toMatchObject({ estado: 'DISPERSADO' })

    const exportPayload = await collectReportExportPayload(
      client as never,
      adminActor,
      'nomina',
      '2026-03'
    )

    expect(exportPayload.filenameBase).toBe('nomina-2026-03')
    expect(exportPayload.rows).toContainEqual([
      '2026-03-Q1',
      'Ana Uno',
      'DC-001',
      'DERMOCONSEJERO',
      'ISDIN Mexico',
      1000,
      0,
      1000,
      1,
      0,
      0,
      0,
      0,
      1,
    ])
  })
})
