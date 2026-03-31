import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { calcularHashPayload } from '../src/lib/audit/integrity'
import { collectBitacoraExportPayload, obtenerBitacoraPanel } from '../src/features/bitacora/services/bitacoraService'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
  count?: number | null
}

type AuditSeedRow = {
  id: number
  tabla: string
  registro_id: string | null
  accion: 'INSERT' | 'UPDATE' | 'DELETE' | 'EVENTO'
  payload: unknown
  created_at: string
  usuario_id: string | null
  cuenta_cliente_id: string | null
  usuario: { username: string | null }
  cuenta_cliente: { nombre: string | null; identificador: string | null }
}

function createAuditRow(id: number, overrides: Partial<AuditSeedRow> = {}): AuditSeedRow & { hash_sha256: string } {
  const payload = overrides.payload ?? { resumen: `Evento ${id}` }
  return {
    id,
    tabla: overrides.tabla ?? 'venta',
    registro_id: overrides.registro_id ?? `registro-${id}`,
    accion: overrides.accion ?? 'INSERT',
    payload,
    hash_sha256: calcularHashPayload(payload),
    created_at: overrides.created_at ?? `2026-03-${String(10 + (id % 10)).padStart(2, '0')}T10:00:00.000Z`,
    usuario_id: overrides.usuario_id ?? 'user-1',
    cuenta_cliente_id: overrides.cuenta_cliente_id ?? 'c1',
    usuario: overrides.usuario ?? { username: 'admin' },
    cuenta_cliente: overrides.cuenta_cliente ?? { nombre: 'Cuenta Demo', identificador: 'cuenta_demo' },
  }
}

function createFakeBitacoraClient(
  rows: Array<AuditSeedRow & { hash_sha256: string }>,
  configRows: Array<{ clave: string; valor: unknown }> = []
) {
  const ltCalls = new Map<string, number[]>()

  return {
    from(table: 'usuario' | 'audit_log' | 'configuracion') {
      if (table === 'usuario') {
        return {
          select() {
            return this
          },
          ilike() {
            return this
          },
          limit() {
            const result: QueryResult = {
              data: [{ id: 'user-1' }],
              error: null,
            }
            return Promise.resolve(result)
          },
        }
      }

      if (table === 'configuracion') {
        return {
          select() {
            return this
          },
          in() {
            const result: QueryResult = {
              data: configRows,
              error: null,
            }
            return Promise.resolve(result)
          },
        }
      }

      const state = {
        cursor: null as number | null,
        head: false,
      }

      const chain = {
        select(_columns: string, options?: { count?: 'exact'; head?: boolean }) {
          state.head = Boolean(options?.head)
          return chain
        },
        eq() {
          return chain
        },
        ilike() {
          return chain
        },
        gte() {
          return chain
        },
        lte() {
          return chain
        },
        in() {
          return chain
        },
        lt(column: string, value: number) {
          if (column === 'id') {
            state.cursor = value
            const entries = ltCalls.get(column) ?? []
            entries.push(value)
            ltCalls.set(column, entries)
          }
          return chain
        },
        order() {
          return chain
        },
        range(offset: number, to: number) {
          const cursor = state.cursor
          const filtered = cursor === null ? rows : rows.filter((row) => row.id < cursor)
          const result: QueryResult = {
            data: filtered.slice(offset, to + 1),
            error: null,
          }
          return Promise.resolve(result)
        },
        limit(limit: number) {
          if (state.head) {
            const result: QueryResult = {
              data: null,
              error: null,
              count: rows.length,
            }
            return Promise.resolve(result)
          }

          const cursor = state.cursor
          const filtered = cursor === null ? rows : rows.filter((row) => row.id < cursor)
          const result: QueryResult = {
            data: filtered.slice(0, limit),
            error: null,
          }
          return Promise.resolve(result)
        },
        then(resolve: (value: QueryResult) => void) {
          if (!state.head) {
            return Promise.resolve(chain as never).then(resolve)
          }

          const result: QueryResult = {
            data: null,
            error: null,
            count: rows.length,
          }
          return Promise.resolve(result).then(resolve)
        },
      }

      return chain
    },
    getLtCalls(column = 'id') {
      return ltCalls.get(column) ?? []
    },
  }
}

function createAuditRows(count: number, startId: number) {
  return Array.from({ length: count }, (_, index) => createAuditRow(startId - index))
}

const actor: ActorActual = {
  authUserId: 'auth-1',
  usuarioId: 'user-1',
  empleadoId: 'emp-1',
  cuentaClienteId: 'c1',
  username: 'admin',
  correoElectronico: 'admin@example.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Admin Uno',
  puesto: 'ADMINISTRADOR',
}

test('pagina el audit_log por cursor descendente y entrega nextCursor en el primer tramo', async () => {
  const client = createFakeBitacoraClient(createAuditRows(12, 112))

  const data = await obtenerBitacoraPanel(client as never, {
    actor,
    pageSize: 10,
  })

  expect(data.items.map((item) => item.id)).toEqual([112, 111, 110, 109, 108, 107, 106, 105, 104, 103])
  expect(data.paginacion.page).toBe(1)
  expect(data.paginacion.hasPreviousPage).toBe(false)
  expect(data.paginacion.hasNextPage).toBe(true)
  expect(data.paginacion.nextCursor).toBe(103)
  expect(data.paginacion.previousCursor).toBeNull()
  expect(data.paginacion.totalItems).toBe(12)
})

test('usa cursor e historial para navegar al segundo tramo sin offset', async () => {
  const client = createFakeBitacoraClient(createAuditRows(12, 112))

  const data = await obtenerBitacoraPanel(client as never, {
    actor,
    cursor: '103',
    history: '0',
    pageSize: 10,
  })

  expect(client.getLtCalls()).toEqual([103])
  expect(data.items.map((item) => item.id)).toEqual([102, 101])
  expect(data.paginacion.page).toBe(2)
  expect(data.paginacion.hasPreviousPage).toBe(true)
  expect(data.paginacion.previousCursor).toBeNull()
  expect(data.paginacion.previousHistory).toEqual([])
  expect(data.paginacion.hasNextPage).toBe(false)
  expect(data.paginacion.nextCursor).toBeNull()
})
test('genera payload de exportacion con firma reproducible y conteo de invalidos', async () => {
  const valid = createAuditRow(10, { payload: { resumen: 'Evento valido' } })
  const invalid = {
    ...createAuditRow(9, { payload: { resumen: 'Evento adulterado' } }),
    hash_sha256: calcularHashPayload({ resumen: 'Otro payload' }),
  }
  const client = createFakeBitacoraClient([valid, invalid])

  const firstPayload = await collectBitacoraExportPayload(client as never, { actor })
  const secondPayload = await collectBitacoraExportPayload(client as never, { actor })

  expect(firstPayload.signature.algorithm).toBe('SHA-256')
  expect(firstPayload.signature.totalRows).toBe(2)
  expect(firstPayload.signature.invalidRows).toBe(1)
  expect(firstPayload.signature.digest).toHaveLength(64)
  expect(firstPayload.signature.digest).toBe(secondPayload.signature.digest)
})
test('aplica retencion configurable por tipo de registro cuando existe en configuracion', async () => {
  const client = createFakeBitacoraClient(createAuditRows(2, 20), [
    { clave: 'audit.retencion.operacion_dias', valor: 1095 },
    { clave: 'audit.retencion.seguridad_dias', valor: 1825 },
  ])

  const data = await obtenerBitacoraPanel(client as never, {
    actor,
    pageSize: 10,
  })

  expect(data.retencion).toEqual([
    { key: 'audit.retencion.operacion_dias', label: 'Operacion', dias: 1095 },
    { key: 'audit.retencion.configuracion_dias', label: 'Configuracion', dias: 730 },
    { key: 'audit.retencion.seguridad_dias', label: 'Seguridad', dias: 1825 },
  ])
})