import { describe, expect, it } from 'vitest'
import {
  getMaterializedMonthlyCalendar,
  mergeDirtyAssignmentRanges,
  recalculateMaterializedAssignmentsRange,
} from './asignacionMaterializationService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

function createMaterializationClient(results: Record<string, QueryResult>) {
  const upserts = new Map<string, unknown[]>()
  const inserts = new Map<string, unknown[]>()
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

            if (filter.op === 'in') {
              return Array.isArray(filter.value) && filter.value.includes(rowValue)
            }

            if (filter.op === 'gte') {
              return String(rowValue ?? '') >= String(filter.value ?? '')
            }

            if (filter.op === 'lte') {
              return String(rowValue ?? '') <= String(filter.value ?? '')
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
        or() {
          return chain
        },
        order() {
          return chain
        },
        limit() {
          return Promise.resolve({
            data: applyFilters(),
            error: entry.error,
          })
        },
        then(resolve: (value: QueryResult) => void) {
          return Promise.resolve({
            data: applyFilters(),
            error: entry.error,
          }).then(resolve)
        },
        insert(payload: unknown[]) {
          inserts.set(table, payload)
          return {
            select() {
              return Promise.resolve({ data: payload, error: null })
            },
          }
        },
        update(payload: Record<string, unknown>) {
          const current = updates.get(table) ?? []
          current.push(payload)
          updates.set(table, current)

          return {
            in() {
              return Promise.resolve({ error: null })
            },
          }
        },
        upsert(payload: unknown[]) {
          upserts.set(table, payload)
          return Promise.resolve({ error: null })
        },
      }

      return chain
    },
    getUpserts(table: string) {
      return upserts.get(table) ?? []
    },
    getInserts(table: string) {
      return inserts.get(table) ?? []
    },
    getUpdates(table: string) {
      return updates.get(table) ?? []
    },
  }
}

describe('asignacionMaterializationService', () => {
  it('mergeDirtyAssignmentRanges une rangos contiguos por empleada', () => {
    const merged = mergeDirtyAssignmentRanges([
      {
        empleadoId: 'emp-1',
        fechaInicio: '2026-03-01',
        fechaFin: '2026-03-03',
        motivo: 'VACACIONES',
      },
      {
        empleadoId: 'emp-1',
        fechaInicio: '2026-03-04',
        fechaFin: '2026-03-05',
        motivo: 'FORMACION',
      },
      {
        empleadoId: 'emp-2',
        fechaInicio: '2026-03-10',
        fechaFin: '2026-03-10',
        motivo: 'INCAPACIDAD',
      },
    ])

    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({
      empleadoId: 'emp-1',
      fechaInicio: '2026-03-01',
      fechaFin: '2026-03-05',
    })
    expect(merged[1]).toMatchObject({
      empleadoId: 'emp-2',
      fechaInicio: '2026-03-10',
      fechaFin: '2026-03-10',
    })
    expect((merged[0].payload?.motivos as string[]) ?? []).toEqual(['VACACIONES', 'FORMACION'])
  })

  it('materializa el rango afectado con bandera de cumpleanos y prioridad de solicitud aprobada', async () => {
    const client = createMaterializationClient({
      empleado: {
        data: [
          {
            id: 'emp-1',
            nombre_completo: 'Maria Demo',
            puesto: 'DERMOCONSEJERO',
            zona: 'CENTRO',
            fecha_nacimiento: '1990-03-02',
            supervisor_empleado_id: 'sup-1',
            estatus_laboral: 'ACTIVO',
          },
          {
            id: 'sup-1',
            supervisor_empleado_id: 'coord-1',
          },
        ],
        error: null,
      },
      asignacion: {
        data: [
          {
            id: 'asg-1',
            empleado_id: 'emp-1',
            pdv_id: 'pdv-1',
            supervisor_empleado_id: 'sup-1',
            cuenta_cliente_id: 'cuenta-1',
            fecha_inicio: '2026-03-01',
            fecha_fin: null,
            tipo: 'FIJA',
            dias_laborales: 'LUN,MAR,MIE,JUE,VIE,SAB,DOM',
            dia_descanso: 'SIN',
            horario_referencia: '09:00 - 18:00',
            naturaleza: 'BASE',
            prioridad: 100,
            estado_publicacion: 'PUBLICADA',
          },
        ],
        error: null,
      },
      solicitud: {
        data: [
          {
            id: 'sol-1',
            empleado_id: 'emp-1',
            fecha_inicio: '2026-03-02',
            fecha_fin: '2026-03-02',
            tipo: 'VACACIONES',
            estatus: 'REGISTRADA_RH',
            metadata: { justifica_asistencia: true },
          },
        ],
        error: null,
      },
      formacion: {
        data: [],
        error: null,
      },
      asignacion_diaria_resuelta: {
        data: [],
        error: null,
      },
    })

    const result = await recalculateMaterializedAssignmentsRange(
      {
        empleadoIds: ['emp-1'],
        fechaInicio: '2026-03-01',
        fechaFin: '2026-03-03',
      },
      client as never
    )

    expect(result.upserted).toBe(3)
    const rows = client.getUpserts('asignacion_diaria_resuelta') as Array<Record<string, unknown>>
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      fecha: '2026-03-01',
      estado_operativo: 'ASIGNADA_PDV',
      pdv_id: 'pdv-1',
      horario_inicio: '09:00',
      horario_fin: '18:00',
    })
    expect(rows[1]).toMatchObject({
      fecha: '2026-03-02',
      estado_operativo: 'VACACIONES',
      trabaja_en_tienda: false,
      referencia_tabla: 'solicitud',
      coordinador_empleado_id: 'coord-1',
    })
    expect(rows[1].flags).toMatchObject({ cumpleanos: true })
  })

  it('arma el calendario mensual solo con el mes visible y completa dias faltantes', async () => {
    const client = createMaterializationClient({
      asignacion_diaria_resuelta: {
        data: [
          {
            fecha: '2026-03-01',
            empleado_id: 'emp-1',
            pdv_id: 'pdv-1',
            supervisor_empleado_id: 'sup-1',
            coordinador_empleado_id: 'coord-1',
            cuenta_cliente_id: 'cuenta-1',
            estado_operativo: 'ASIGNADA_PDV',
            origen: 'BASE',
            referencia_tabla: 'asignacion',
            referencia_id: 'asg-1',
            mensaje_operativo: null,
            laborable: true,
            trabaja_en_tienda: true,
            sede_formacion: null,
            horario_inicio: '09:00',
            horario_fin: '18:00',
            flags: { cumpleanos: false },
            refreshed_at: '2026-03-01T12:00:00.000Z',
          },
        ],
        error: null,
      },
      empleado: {
        data: [
          { id: 'emp-1', nombre_completo: 'Maria Demo', zona: 'CENTRO' },
          { id: 'sup-1', nombre_completo: 'Supervisor Demo' },
          { id: 'coord-1', nombre_completo: 'Coordinador Demo' },
        ],
        error: null,
      },
      pdv: {
        data: [{ id: 'pdv-1', nombre: 'Sucursal 1' }],
        error: null,
      },
    })

    const calendar = await getMaterializedMonthlyCalendar(
      {
        month: '2026-03',
      },
      client as never
    )

    expect(calendar.fechaInicio).toBe('2026-03-01')
    expect(calendar.fechaFin).toBe('2026-03-31')
    expect(calendar.totalEmpleados).toBe(1)
    expect(calendar.empleados[0]?.dias).toHaveLength(31)
    expect(calendar.empleados[0]?.dias[0]).toMatchObject({
      fecha: '2026-03-01',
      estadoOperativo: 'ASIGNADA_PDV',
      pdvNombre: 'Sucursal 1',
    })
    expect(calendar.empleados[0]?.dias[1]).toMatchObject({
      fecha: '2026-03-02',
      estadoOperativo: 'SIN_ASIGNACION',
      origen: 'NINGUNO',
    })
  })
})
