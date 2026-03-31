import { describe, expect, it } from 'vitest'
import type { ActorActual } from '@/lib/auth/session'
import { collectReportExportPayload } from './reporteExport'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

function createFakeClient(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      const entry = results[table] ?? { data: [], error: null }
      const state = {
        filters: [] as Array<{ op: string; column?: string; value?: unknown; expression?: string }>,
      }

      const applyFilters = () => {
        const source = Array.isArray(entry.data) ? [...entry.data] : entry.data
        if (!Array.isArray(source)) {
          return source
        }

        return source.filter((row) =>
          state.filters.every((filter) => {
            const record = row as Record<string, unknown>
            if (filter.op === 'eq') {
              return record[filter.column!] === filter.value
            }
            if (filter.op === 'in') {
              return Array.isArray(filter.value) && filter.value.includes(record[filter.column!])
            }
            if (filter.op === 'gte') {
              return String(record[filter.column!] ?? '') >= String(filter.value ?? '')
            }
            if (filter.op === 'lte') {
              return String(record[filter.column!] ?? '') <= String(filter.value ?? '')
            }
            if (filter.op === 'or' && filter.expression?.startsWith('fecha_fin.is.null,fecha_fin.gte.')) {
              const limit = filter.expression.replace('fecha_fin.is.null,fecha_fin.gte.', '')
              return record.fecha_fin == null || String(record.fecha_fin) >= limit
            }
            return true
          })
        )
      }

      const resolveResult = () => Promise.resolve({ data: applyFilters(), error: entry.error })

      const chain: Record<string, unknown> = {
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
        or(expression: string) {
          state.filters.push({ op: 'or', expression })
          return chain
        },
        order() {
          return chain
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return resolveResult().then(onFulfilled, onRejected)
        },
        catch(onRejected: (reason: unknown) => unknown) {
          return resolveResult().catch(onRejected)
        },
        finally(onFinally: () => void) {
          return resolveResult().finally(onFinally)
        },
      }

      return chain
    },
  }
}

const actor: ActorActual = {
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

describe('reporteExport calendario operativo', () => {
  it('arma una matriz mensual con observaciones y encabezado de mes', async () => {
    const client = createFakeClient({
      asignacion_diaria_resuelta: {
        data: [
          {
            fecha: '2026-03-01',
            empleado_id: 'emp-1',
            pdv_id: 'pdv-1',
            supervisor_empleado_id: 'sup-1',
            coordinador_empleado_id: 'coord-1',
            cuenta_cliente_id: 'c1',
            estado_operativo: 'ASIGNADA_PDV',
            origen: 'BASE',
            referencia_tabla: 'asignacion',
            referencia_id: 'asg-1',
            mensaje_operativo: null,
            laborable: true,
            trabaja_en_tienda: true,
            sede_formacion: null,
            horario_inicio: '11:00',
            horario_fin: '19:00',
            flags: {},
            refreshed_at: '2026-03-01T00:00:00.000Z',
          },
          {
            fecha: '2026-03-02',
            empleado_id: 'emp-1',
            pdv_id: null,
            supervisor_empleado_id: 'sup-1',
            coordinador_empleado_id: 'coord-1',
            cuenta_cliente_id: 'c1',
            estado_operativo: 'VACACIONES',
            origen: 'VACACIONES',
            referencia_tabla: 'solicitud',
            referencia_id: 'sol-1',
            mensaje_operativo: null,
            laborable: false,
            trabaja_en_tienda: false,
            sede_formacion: null,
            horario_inicio: null,
            horario_fin: null,
            flags: { cumpleanos: true },
            refreshed_at: '2026-03-02T00:00:00.000Z',
          },
        ],
        error: null,
      },
      empleado: {
        data: [
          { id: 'emp-1', id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO', zona: 'CENTRO' },
          { id: 'sup-1', nombre_completo: 'Supervisor Uno', zona: 'CENTRO' },
          { id: 'coord-1', nombre_completo: 'Coordinador Uno', zona: 'CENTRO' },
        ],
        error: null,
      },
      pdv: {
        data: [
          {
            id: 'pdv-1',
            nombre: 'Liverpool Polanco',
            clave_btl: 'BTL-001',
            horario_entrada: '11:00',
            horario_salida: '19:00',
            zona: 'CENTRO',
            geocerca_pdv: [],
            cadena: { id: 'cad-1', nombre: 'Liverpool' },
            ciudad: { id: 'ciu-1', nombre: 'Ciudad de Mexico', estado: 'Ciudad de Mexico' },
          },
          {
            id: 'pdv-2',
            nombre: 'Liverpool Santa Fe',
            clave_btl: 'BTL-002',
            horario_entrada: '11:00',
            horario_salida: '19:00',
            zona: 'CENTRO',
            geocerca_pdv: [],
            cadena: { id: 'cad-1', nombre: 'Liverpool' },
            ciudad: { id: 'ciu-1', nombre: 'Ciudad de Mexico', estado: 'Ciudad de Mexico' },
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
            cuenta_cliente_id: 'c1',
            fecha_inicio: '2026-03-01',
            fecha_fin: '2026-03-15',
            dias_laborales: 'LUN,MAR,MIE,JUE,VIE,SAB',
            dia_descanso: 'DOM',
            horario_referencia: '11:00 a 19:00',
            naturaleza: 'BASE',
            prioridad: 100,
            estado_publicacion: 'PUBLICADA',
          },
          {
            id: 'asg-2',
            empleado_id: 'emp-1',
            pdv_id: 'pdv-2',
            cuenta_cliente_id: 'c1',
            fecha_inicio: '2026-03-16',
            fecha_fin: null,
            dias_laborales: 'LUN,MAR,MIE,JUE,VIE,SAB',
            dia_descanso: 'DOM',
            horario_referencia: '11:00 a 19:00',
            naturaleza: 'BASE',
            prioridad: 100,
            estado_publicacion: 'PUBLICADA',
          },
        ],
        error: null,
      },
      asistencia: {
        data: [
          {
            empleado_id: 'emp-1',
            fecha_operacion: '2026-03-01',
            estatus: 'CERRADA',
            check_in_utc: '2026-03-01T17:00:00.000Z',
          },
        ],
        error: null,
      },
      cuenta_cliente: {
        data: [{ id: 'c1', nombre: 'ISDIN Mexico' }],
        error: null,
      },
    })

    const payload = await collectReportExportPayload(client as never, actor, 'calendario_operativo', '2026-03')

    expect(payload.sheetName).toBe('calendario')
    expect(payload.headers[0]).toBe('CADENA')
    expect(payload.headers).toContain('OBSERVACIONES')
    expect(payload.headers).toContain('31')
    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0][0]).toBe('ISDIN Mexico')
    expect(payload.rows[0][2]).toBe('Liverpool Santa Fe')
    expect(payload.rows[0][4]).toBe(0.5)
    expect(String(payload.rows[0][13])).toContain('VAC')
    expect(String(payload.rows[0][13])).toContain('CUMP')
    expect(payload.xlsx?.leadingRows?.[0]?.some((value) => String(value).includes('MARZO'))).toBe(true)
  })
})



