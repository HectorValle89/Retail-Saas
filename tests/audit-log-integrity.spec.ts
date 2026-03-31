import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { calcularHashPayload } from '../src/lib/audit/integrity'
import { obtenerBitacoraPanel } from '../src/features/bitacora/services/bitacoraService'

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
  hash_sha256: string
}

function createFakeBitacoraClient(rows: AuditSeedRow[]) {
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
            return Promise.resolve({
              data: [{ id: 'user-1' }],
              error: null,
            })
          },
        }
      }

      if (table === 'configuracion') {
        return {
          select() {
            return this
          },
          in() {
            return Promise.resolve({
              data: [],
              error: null,
            })
          },
        }
      }

      const state = {
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
        order() {
          return chain
        },
        lt() {
          return chain
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

          const result: QueryResult = {
            data: rows.slice(0, limit),
            error: null,
          }
          return Promise.resolve(result)
        },
        then(resolve: (value: QueryResult) => void) {
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
  }
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

test('bitacora detecta payload adulterado y resume integridad del audit_log', async () => {
  const validPayload = {
    before: { id: 'sol-1', estatus: 'BORRADOR' },
    after: { id: 'sol-1', estatus: 'REGISTRADA' },
  }
  const tamperedPayload = {
    before: { id: 'venta-1', total_monto: 1800 },
    after: { id: 'venta-1', total_monto: 2500 },
  }

  const client = createFakeBitacoraClient([
    {
      id: 2,
      tabla: 'solicitud',
      registro_id: 'sol-1',
      accion: 'UPDATE',
      payload: validPayload,
      hash_sha256: calcularHashPayload(validPayload),
      created_at: '2026-03-18T17:00:00.000Z',
      usuario_id: 'user-1',
      cuenta_cliente_id: 'c1',
      usuario: { username: 'admin' },
      cuenta_cliente: { nombre: 'Cuenta Demo', identificador: 'cuenta_demo' },
    },
    {
      id: 1,
      tabla: 'venta',
      registro_id: 'venta-1',
      accion: 'UPDATE',
      payload: tamperedPayload,
      hash_sha256: calcularHashPayload({
        before: { id: 'venta-1', total_monto: 1800 },
        after: { id: 'venta-1', total_monto: 1800 },
      }),
      created_at: '2026-03-18T16:00:00.000Z',
      usuario_id: 'user-1',
      cuenta_cliente_id: 'c1',
      usuario: { username: 'admin' },
      cuenta_cliente: { nombre: 'Cuenta Demo', identificador: 'cuenta_demo' },
    },
  ])

  const data = await obtenerBitacoraPanel(client as never, {
    actor,
    pageSize: 10,
  })

  expect(data.resumen).toMatchObject({
    registros: 2,
    integridadValida: 1,
    integridadInvalida: 1,
  })
  expect(data.items[0]).toMatchObject({
    tabla: 'solicitud',
    accion: 'UPDATE',
    integridad: 'VALIDO',
  })
  expect(data.items[1]).toMatchObject({
    tabla: 'venta',
    accion: 'UPDATE',
    integridad: 'INVALIDO',
  })
  expect(data.items[1]?.hashGuardado).not.toBe(data.items[1]?.hashCalculado)
  expect(data.alertaIntegridad).toMatchObject({
    activa: true,
    totalInvalidos: 1,
    ids: [1],
  })
  expect(data.alertaIntegridad?.mensaje).toContain('discrepancia')
  expect(data.retencion).toEqual([
    { key: 'audit.retencion.operacion_dias', label: 'Operacion', dias: 730 },
    { key: 'audit.retencion.configuracion_dias', label: 'Configuracion', dias: 730 },
    { key: 'audit.retencion.seguridad_dias', label: 'Seguridad', dias: 730 },
  ])
})

test('la migracion de auditoria mantiene append-only y agrega triggers para tablas criticas', async () => {
  const sql = readFileSync(
    'supabase/migrations/20260318180000_audit_log_row_change_triggers.sql',
    'utf8'
  )
  const baselineSql = readFileSync(
    'supabase/migrations/20260314145500_fase0_estructura_maestra_retail.sql',
    'utf8'
  )

  expect(baselineSql).toContain("create trigger trg_audit_log_append_only")
  expect(baselineSql).toContain("before update or delete on public.audit_log")
  expect(baselineSql).toContain("raise exception 'audit_log es append-only: no se permite %'")
  expect(baselineSql).toContain('create trigger trg_audit_log_hash')
  expect(sql).toContain('create or replace function public.audit_log_capture_row_change()')
  expect(sql).toContain("jsonb_build_object(")
  expect(sql).toContain("'before', row_before")
  expect(sql).toContain("'after', row_after")

  ;[
    'empleado',
    'usuario',
    'pdv',
    'asignacion',
    'ruta_semanal',
    'ruta_semanal_visita',
    'campana',
    'campana_pdv',
    'formacion_evento',
    'formacion_asistencia',
    'asistencia',
    'venta',
    'love_isdin',
    'solicitud',
    'gasto',
    'entrega_material',
    'nomina_periodo',
    'cuota_empleado_periodo',
    'nomina_ledger',
  ].forEach((tableName) => {
    expect(sql).toContain(`create trigger trg_${tableName}_audit_log`)
    expect(sql).toContain(`on public.${tableName}`)
    expect(sql).toContain('for each row execute function public.audit_log_capture_row_change();')
  })
})