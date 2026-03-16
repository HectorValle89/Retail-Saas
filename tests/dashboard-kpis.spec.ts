import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { obtenerPanelDashboard } from '../src/features/dashboard/services/dashboardService'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function createFakeDashboardSupabase(results: {
  initial: QueryResult
  refreshed?: QueryResult
  refreshError?: { message: string } | null
  asistencia?: QueryResult
  geocercas?: QueryResult
}) {
  const eqValues = new Map<string, string>()
  let refreshed = false

  return {
    from(table: 'dashboard_kpis' | 'asistencia' | 'geocerca_pdv') {
      return {
        select() {
          return this
        },
        eq(column: string, value: string) {
          eqValues.set(`${table}:${column}`, value)
          return this
        },
        order() {
          return this
        },
        limit() {
          if (table === 'dashboard_kpis') {
            if (refreshed && results.refreshed) {
              return Promise.resolve(results.refreshed)
            }

            return Promise.resolve(results.initial)
          }

          if (table === 'asistencia') {
            return Promise.resolve(results.asistencia ?? { data: [], error: null })
          }

          return Promise.resolve(results.geocercas ?? { data: [], error: null })
        },
      }
    },
    rpc() {
      refreshed = true
      return Promise.resolve({
        error: results.refreshError ?? null,
      })
    },
    getEqValue(table = 'dashboard_kpis', column = 'cuenta_cliente_id') {
      return eqValues.get(`${table}:${column}`) ?? null
    },
  }
}

const actorBase: ActorActual = {
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

test('consolida dashboard desde dashboard_kpis y filtra por cuenta operativa', async () => {
  const freshDate = new Date().toISOString()
  const client = createFakeDashboardSupabase({
    initial: {
      data: [
        {
          fecha_corte: '2026-03-14',
          cuenta_cliente_id: 'c1',
          cuenta_cliente: 'ISDIN Mexico',
          cuenta_cliente_identificador: 'isdin_mexico',
          promotores_activos: 4,
          checkins_validos: 3,
          jornadas_pendientes: 1,
          alertas_operativas: 2,
          jornadas_operadas: 4,
          ventas_confirmadas: 5,
          monto_confirmado: 7600,
          afiliaciones_love: 0,
          asistencia_porcentaje: 75,
          cuotas_cumplidas_periodo: 2,
          neto_nomina_periodo: 12500,
          refreshed_at: freshDate,
        },
        {
          fecha_corte: '2026-03-13',
          cuenta_cliente_id: 'c1',
          cuenta_cliente: 'ISDIN Mexico',
          cuenta_cliente_identificador: 'isdin_mexico',
          promotores_activos: 2,
          checkins_validos: 2,
          jornadas_pendientes: 0,
          alertas_operativas: 0,
          jornadas_operadas: 2,
          ventas_confirmadas: 3,
          monto_confirmado: 4200,
          afiliaciones_love: 0,
          asistencia_porcentaje: 100,
          cuotas_cumplidas_periodo: 2,
          neto_nomina_periodo: 12500,
          refreshed_at: freshDate,
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelDashboard(actorBase, client as never)

  expect(client.getEqValue()).toBe('c1')
  expect(data.infraestructuraLista).toBe(true)
  expect(data.scopeLabel).toBe('ISDIN Mexico')
  expect(data.stats).toMatchObject({
    fechaCorte: '2026-03-14',
    promotoresActivosHoy: 4,
    checkInsValidosHoy: 3,
    ventasConfirmadasHoy: 5,
    montoConfirmadoHoy: 7600,
    asistenciaPorcentajeHoy: 75,
    cuotasCumplidasPeriodo: 2,
    netoNominaPeriodo: 12500,
  })
  expect(data.clientes[0]).toMatchObject({
    cuentaCliente: 'ISDIN Mexico',
    jornadasPendientes: 1,
    ventasConfirmadas: 5,
  })
  expect(data.tendenciaSemana).toHaveLength(2)
  expect(data.alertasLive).toEqual([])
})

test('permite vista global consolidada para administradores multi-cuenta', async () => {
  const freshDate = new Date().toISOString()
  const client = createFakeDashboardSupabase({
    initial: {
      data: [
        {
          fecha_corte: '2026-03-14',
          cuenta_cliente_id: 'c1',
          cuenta_cliente: 'ISDIN Mexico',
          cuenta_cliente_identificador: 'isdin_mexico',
          promotores_activos: 4,
          checkins_validos: 3,
          jornadas_pendientes: 1,
          alertas_operativas: 2,
          jornadas_operadas: 4,
          ventas_confirmadas: 5,
          monto_confirmado: 7600,
          afiliaciones_love: 0,
          asistencia_porcentaje: 75,
          cuotas_cumplidas_periodo: 2,
          neto_nomina_periodo: 12500,
          refreshed_at: freshDate,
        },
        {
          fecha_corte: '2026-03-14',
          cuenta_cliente_id: 'c2',
          cuenta_cliente: 'Be Te Ele Demo',
          cuenta_cliente_identificador: 'be_te_ele_demo',
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
          refreshed_at: freshDate,
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelDashboard(
    {
      ...actorBase,
      cuentaClienteId: null,
    },
    client as never
  )

  expect(client.getEqValue()).toBeNull()
  expect(data.scopeLabel).toBe('Vista global')
  expect(data.stats).toMatchObject({
    promotoresActivosHoy: 6,
    checkInsValidosHoy: 5,
    ventasConfirmadasHoy: 6,
    montoConfirmadoHoy: 8500,
    alertasOperativas: 3,
  })
  expect(data.clientes).toHaveLength(2)
})

test('refresca la vista materializada cuando el snapshot esta vencido', async () => {
  const staleDate = '2026-03-14T00:00:00.000Z'
  const client = createFakeDashboardSupabase({
    initial: {
      data: [
        {
          fecha_corte: '2026-03-14',
          cuenta_cliente_id: 'c1',
          cuenta_cliente: 'ISDIN Mexico',
          cuenta_cliente_identificador: 'isdin_mexico',
          promotores_activos: 0,
          checkins_validos: 0,
          jornadas_pendientes: 0,
          alertas_operativas: 0,
          jornadas_operadas: 0,
          ventas_confirmadas: 0,
          monto_confirmado: 0,
          afiliaciones_love: 0,
          asistencia_porcentaje: 0,
          cuotas_cumplidas_periodo: 0,
          neto_nomina_periodo: 0,
          refreshed_at: staleDate,
        },
      ],
      error: null,
    },
    refreshed: {
      data: [
        {
          fecha_corte: '2026-03-14',
          cuenta_cliente_id: 'c1',
          cuenta_cliente: 'ISDIN Mexico',
          cuenta_cliente_identificador: 'isdin_mexico',
          promotores_activos: 1,
          checkins_validos: 1,
          jornadas_pendientes: 0,
          alertas_operativas: 0,
          jornadas_operadas: 1,
          ventas_confirmadas: 2,
          monto_confirmado: 1900,
          afiliaciones_love: 0,
          asistencia_porcentaje: 100,
          cuotas_cumplidas_periodo: 1,
          neto_nomina_periodo: 6000,
          refreshed_at: new Date().toISOString(),
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelDashboard(actorBase, client as never)

  expect(data.stats.ventasConfirmadasHoy).toBe(2)
  expect(data.stats.montoConfirmadoHoy).toBe(1900)
})

test('expone alertas live de geocercas fuera de rango durante jornada activa', async () => {
  const freshDate = new Date().toISOString()
  const today = new Date().toISOString().slice(0, 10)
  const client = createFakeDashboardSupabase({
    initial: {
      data: [
        {
          fecha_corte: '2026-03-15',
          cuenta_cliente_id: 'c1',
          cuenta_cliente: 'ISDIN Mexico',
          cuenta_cliente_identificador: 'isdin_mexico',
          promotores_activos: 4,
          checkins_validos: 3,
          jornadas_pendientes: 1,
          alertas_operativas: 2,
          jornadas_operadas: 4,
          ventas_confirmadas: 5,
          monto_confirmado: 7600,
          afiliaciones_love: 0,
          asistencia_porcentaje: 75,
          cuotas_cumplidas_periodo: 2,
          neto_nomina_periodo: 12500,
          refreshed_at: freshDate,
        },
      ],
      error: null,
    },
    asistencia: {
      data: [
        {
          id: 'asis-1',
          cuenta_cliente_id: 'c1',
          supervisor_empleado_id: 'sup-1',
          empleado_nombre: 'DC Uno',
          pdv_id: 'pdv-1',
          pdv_clave_btl: 'BTL-001',
          pdv_nombre: 'PDV Centro',
          fecha_operacion: today,
          check_in_utc: freshDate,
          check_out_utc: null,
          distancia_check_in_metros: 18,
          estado_gps: 'DENTRO_GEOCERCA',
          estatus: 'VALIDA',
        },
        {
          id: 'asis-2',
          cuenta_cliente_id: 'c1',
          supervisor_empleado_id: 'sup-1',
          empleado_nombre: 'DC Dos',
          pdv_id: 'pdv-2',
          pdv_clave_btl: 'BTL-002',
          pdv_nombre: 'PDV Norte',
          fecha_operacion: today,
          check_in_utc: freshDate,
          check_out_utc: null,
          distancia_check_in_metros: 22,
          estado_gps: 'DENTRO_GEOCERCA',
          estatus: 'VALIDA',
        },
        {
          id: 'asis-3',
          cuenta_cliente_id: 'c2',
          supervisor_empleado_id: 'sup-9',
          empleado_nombre: 'DC Tres',
          pdv_id: 'pdv-3',
          pdv_clave_btl: 'BTL-003',
          pdv_nombre: 'PDV Sur',
          fecha_operacion: today,
          check_in_utc: freshDate,
          check_out_utc: null,
          distancia_check_in_metros: 31,
          estado_gps: 'FUERA_GEOCERCA',
          estatus: 'PENDIENTE_VALIDACION',
        },
      ],
      error: null,
    },
    geocercas: {
      data: [
        { pdv_id: 'pdv-1', radio_tolerancia_metros: 30 },
        { pdv_id: 'pdv-2', radio_tolerancia_metros: 160 },
        { pdv_id: 'pdv-3', radio_tolerancia_metros: 420 },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelDashboard(actorBase, client as never)

  expect(client.getEqValue('asistencia', 'cuenta_cliente_id')).toBe('c1')
  expect(data.alertasLive).toHaveLength(1)
  expect(data.alertasLive[0]).toMatchObject({
    pdv: 'PDV Centro',
    pdvClaveBtl: 'BTL-001',
    empleado: 'DC Uno',
    radioToleranciaMetros: 30,
    distanciaCheckInMetros: 18,
  })
  expect(data.alertasLive[0]?.motivo).toContain('menor a 50m')
})