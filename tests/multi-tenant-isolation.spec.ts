import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { obtenerPanelDashboard } from '../src/features/dashboard/services/dashboardService'

type DashboardRow = {
  fecha_corte: string
  cuenta_cliente_id: string
  cuenta_cliente: string
  cuenta_cliente_identificador: string
  promotores_activos: number
  checkins_validos: number
  jornadas_pendientes: number
  alertas_operativas: number
  jornadas_operadas: number
  ventas_confirmadas: number
  monto_confirmado: number
  afiliaciones_love: number
  asistencia_porcentaje: number
  cuotas_cumplidas_periodo: number
  neto_nomina_periodo: number
  refreshed_at: string
}

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function createScopedDashboardClient(rows: DashboardRow[]) {
  let scopedAccountId: string | null = null

  return {
    from(table: 'dashboard_kpis' | 'asistencia' | 'geocerca_pdv' | 'empleado') {
      return {
        select() {
          return this
        },
        eq(column: string, value: string) {
          if (table === 'dashboard_kpis' && column === 'cuenta_cliente_id') {
            scopedAccountId = value
          }
          return this
        },
        in() {
          return this
        },
        order() {
          return this
        },
        gte() {
          return this
        },
        lte() {
          return this
        },
        limit() {
          if (table === 'dashboard_kpis') {
            const data = scopedAccountId
              ? rows.filter((row) => row.cuenta_cliente_id === scopedAccountId)
              : rows

            const result: QueryResult = {
              data,
              error: null,
            }

            return Promise.resolve(result)
          }

          return Promise.resolve({
            data: [],
            error: null,
          })
        },
      }
    },
  }
}

const baseActor: ActorActual = {
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

test('aisla datos multi-tenant: la cuenta A no ve la B y la cuenta B no ve la A', async () => {
  const refreshedAt = new Date().toISOString()
  const rows: DashboardRow[] = [
    {
      fecha_corte: '2026-03-18',
      cuenta_cliente_id: 'c1',
      cuenta_cliente: 'Cuenta A',
      cuenta_cliente_identificador: 'cuenta_a',
      promotores_activos: 4,
      checkins_validos: 3,
      jornadas_pendientes: 1,
      alertas_operativas: 2,
      jornadas_operadas: 4,
      ventas_confirmadas: 5,
      monto_confirmado: 7600,
      afiliaciones_love: 1,
      asistencia_porcentaje: 75,
      cuotas_cumplidas_periodo: 2,
      neto_nomina_periodo: 12500,
      refreshed_at: refreshedAt,
    },
    {
      fecha_corte: '2026-03-18',
      cuenta_cliente_id: 'c2',
      cuenta_cliente: 'Cuenta B',
      cuenta_cliente_identificador: 'cuenta_b',
      promotores_activos: 2,
      checkins_validos: 2,
      jornadas_pendientes: 0,
      alertas_operativas: 1,
      jornadas_operadas: 2,
      ventas_confirmadas: 1,
      monto_confirmado: 900,
      afiliaciones_love: 0,
      asistencia_porcentaje: 100,
      cuotas_cumplidas_periodo: 1,
      neto_nomina_periodo: 2000,
      refreshed_at: refreshedAt,
    },
  ]

  const actorCuentaA = {
    ...baseActor,
    cuentaClienteId: 'c1',
  }
  const actorCuentaB = {
    ...baseActor,
    cuentaClienteId: 'c2',
  }

  const dataCuentaA = await obtenerPanelDashboard(actorCuentaA, {}, createScopedDashboardClient(rows) as never)
  const dataCuentaB = await obtenerPanelDashboard(actorCuentaB, {}, createScopedDashboardClient(rows) as never)

  expect(dataCuentaA.scopeLabel).toBe('Cuenta A')
  expect(dataCuentaA.clientes).toHaveLength(1)
  expect(dataCuentaA.clientes[0]).toMatchObject({
    cuentaCliente: 'Cuenta A',
    ventasConfirmadas: 5,
  })
  expect(dataCuentaA.clientes.map((item) => item.cuentaCliente)).not.toContain('Cuenta B')

  expect(dataCuentaB.scopeLabel).toBe('Cuenta B')
  expect(dataCuentaB.clientes).toHaveLength(1)
  expect(dataCuentaB.clientes[0]).toMatchObject({
    cuentaCliente: 'Cuenta B',
    ventasConfirmadas: 1,
  })
  expect(dataCuentaB.clientes.map((item) => item.cuentaCliente)).not.toContain('Cuenta A')
})