import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import {
  obtenerInsightsDashboard,
  obtenerPanelDashboard,
  resolveDashboardWidgets,
} from '../src/features/dashboard/services/dashboardService'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function createFakeDashboardSupabase(results: {
  initial: QueryResult
  asistencia?: QueryResult
  geocercas?: QueryResult
  empleados?: QueryResult
  asignaciones?: QueryResult
  solicitudes?: QueryResult
  configuracion?: QueryResult
  periodos?: QueryResult
  cuotas?: QueryResult
  pdvs?: QueryResult
  ventas?: QueryResult
  love?: QueryResult
  campanas?: QueryResult
  campanasPdv?: QueryResult
}) {
  const eqValues = new Map<string, string>()
  const inValues = new Map<string, string[]>()

  return {
    from(table: 'dashboard_kpis' | 'asistencia' | 'geocerca_pdv' | 'empleado' | 'asignacion' | 'solicitud' | 'configuracion' | 'nomina_periodo' | 'cuota_empleado_periodo' | 'pdv' | 'venta' | 'love_isdin' | 'campana' | 'campana_pdv') {
      return {
        select() {
          return this
        },
        eq(column: string, value: string) {
          eqValues.set(`${table}:${column}`, value)
          return this
        },
        in(column: string, values: string[]) {
          inValues.set(`${table}:${column}`, values)
          return this
        },
        is() {
          return this
        },
        order() {
          return this
        },
        limit() {
          if (table === 'dashboard_kpis') {
            return Promise.resolve(results.initial)
          }

          if (table === 'asistencia') {
            return Promise.resolve(results.asistencia ?? { data: [], error: null })
          }

          if (table === 'geocerca_pdv') {
            return Promise.resolve(results.geocercas ?? { data: [], error: null })
          }

          if (table === 'empleado') {
            return Promise.resolve(results.empleados ?? { data: [], error: null })
          }

          if (table === 'asignacion') {
            return Promise.resolve(results.asignaciones ?? { data: [], error: null })
          }

          if (table === 'solicitud') {
            return Promise.resolve(results.solicitudes ?? { data: [], error: null })
          }

          if (table === 'configuracion') {
            return Promise.resolve(results.configuracion ?? { data: [], error: null })
          }

          if (table === 'nomina_periodo') {
            return Promise.resolve(results.periodos ?? { data: [], error: null })
          }

          if (table === 'pdv') {
            return Promise.resolve(results.pdvs ?? { data: [], error: null })
          }

          if (table === 'venta') {
            return Promise.resolve(results.ventas ?? { data: [], error: null })
          }

          if (table === 'love_isdin') {
            return Promise.resolve(results.love ?? { data: [], error: null })
          }

          if (table === 'campana') {
            return Promise.resolve(results.campanas ?? { data: [], error: null })
          }

          if (table === 'campana_pdv') {
            return Promise.resolve(results.campanasPdv ?? { data: [], error: null })
          }

          return Promise.resolve(results.cuotas ?? { data: [], error: null })
        },
      }
    },
    getEqValue(table = 'dashboard_kpis', column = 'cuenta_cliente_id') {
      return eqValues.get(`${table}:${column}`) ?? null
    },
    getInValues(table = 'empleado', column = 'id') {
      return inValues.get(`${table}:${column}`) ?? []
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

test('construye dashboard ejecutivo de cobertura para reclutamiento', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const overdue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const recruitmentClient = {
    from(table: string) {
      const query = {
        select() {
          return query
        },
        eq() {
          if (table === 'pdv_cobertura_operativa') {
            return Promise.resolve({
              data: [
                {
                  id: 'cov-1',
                  cuenta_cliente_id: 'c1',
                  pdv_id: 'pdv-2',
                  estado_operativo: 'RESERVADO_PENDIENTE_ACCESO',
                  motivo_operativo: 'PENDIENTE_ACCESO',
                  empleado_reservado_id: 'dc-2',
                  pdv_paso_id: 'pdv-1',
                  acceso_pendiente_desde: '2026-03-28T10:00:00.000Z',
                  proximo_recordatorio_at: overdue,
                  apartado_por_usuario_id: 'user-1',
                  observaciones: 'Acceso pendiente por cadena',
                  metadata: {},
                },
              ],
              error: null,
            })
          }

          if (table === 'usuario') {
            return Promise.resolve({
              data: [
                { empleado_id: 'dc-1', cuenta_cliente_id: 'c1' },
                { empleado_id: 'dc-2', cuenta_cliente_id: 'c1' },
                { empleado_id: 'cand-1', cuenta_cliente_id: 'c1' },
                { empleado_id: 'cand-2', cuenta_cliente_id: 'c1' },
              ],
              error: null,
            })
          }

          return query
        },
        in() {
          return Promise.resolve({
            data: [{ clave: 'reclutamiento.cobertura.meta_plantilla', valor: 250 }],
            error: null,
          })
        },
        lte() {
          return query
        },
        or() {
          return Promise.resolve({
            data: [
              {
                id: 'asg-1',
                cuenta_cliente_id: 'c1',
                empleado_id: 'dc-1',
                supervisor_empleado_id: 'sup-1',
                pdv_id: 'pdv-1',
                fecha_inicio: '2026-03-01',
                fecha_fin: null,
                estado_publicacion: 'PUBLICADA',
              },
            ],
            error: null,
          })
        },
        order() {
          if (table === 'cuenta_cliente_pdv') {
            return Promise.resolve({
              data: [
                {
                  id: 'rel-1',
                  cuenta_cliente_id: 'c1',
                  pdv_id: 'pdv-1',
                  activo: true,
                  fecha_inicio: '2026-03-01',
                  fecha_fin: null,
                  pdv: {
                    id: 'pdv-1',
                    nombre: 'Sucursal Norte',
                    clave_btl: 'BTL-001',
                    zona: 'NORTE',
                    estatus: 'ACTIVO',
                    cadena: { nombre: 'San Pablo' },
                    ciudad: { nombre: 'CDMX' },
                  },
                },
                {
                  id: 'rel-2',
                  cuenta_cliente_id: 'c1',
                  pdv_id: 'pdv-2',
                  activo: true,
                  fecha_inicio: '2026-03-01',
                  fecha_fin: null,
                  pdv: {
                    id: 'pdv-2',
                    nombre: 'Sucursal Centro',
                    clave_btl: 'BTL-002',
                    zona: 'CENTRO',
                    estatus: 'ACTIVO',
                    cadena: { nombre: 'Liverpool' },
                    ciudad: { nombre: 'CDMX' },
                  },
                },
                {
                  id: 'rel-3',
                  cuenta_cliente_id: 'c1',
                  pdv_id: 'pdv-3',
                  activo: true,
                  fecha_inicio: '2026-03-01',
                  fecha_fin: null,
                  pdv: {
                    id: 'pdv-3',
                    nombre: 'Sucursal Escuela',
                    clave_btl: 'BTL-003',
                    zona: 'SUR',
                    estatus: 'TEMPORAL',
                    cadena: { nombre: 'San Pablo' },
                    ciudad: { nombre: 'Puebla' },
                  },
                },
                {
                  id: 'rel-4',
                  cuenta_cliente_id: 'c1',
                  pdv_id: 'pdv-4',
                  activo: true,
                  fecha_inicio: '2026-03-01',
                  fecha_fin: null,
                  pdv: {
                    id: 'pdv-4',
                    nombre: 'Sucursal Cerrada',
                    clave_btl: 'BTL-004',
                    zona: 'OCCIDENTE',
                    estatus: 'INACTIVO',
                    cadena: { nombre: 'Farmacias del Ahorro' },
                    ciudad: { nombre: 'Guadalajara' },
                  },
                },
              ],
              error: null,
            })
          }

          if (table === 'empleado') {
            return Promise.resolve({
              data: [
                {
                  id: 'sup-1',
                  nombre_completo: 'Supervisor Uno',
                  puesto: 'SUPERVISOR',
                  estatus_laboral: 'ACTIVO',
                  supervisor_empleado_id: null,
                  metadata: {},
                },
                {
                  id: 'dc-1',
                  nombre_completo: 'DC Activa Uno',
                  puesto: 'DERMOCONSEJERO',
                  estatus_laboral: 'ACTIVO',
                  supervisor_empleado_id: 'sup-1',
                  metadata: {},
                },
                {
                  id: 'dc-2',
                  nombre_completo: 'DC En Espera',
                  puesto: 'DERMOCONSEJERO',
                  estatus_laboral: 'ACTIVO',
                  supervisor_empleado_id: 'sup-1',
                  metadata: {},
                },
                {
                  id: 'cand-1',
                  nombre_completo: 'Candidata Firma',
                  puesto: 'DERMOCONSEJERO',
                  estatus_laboral: 'SUSPENDIDO',
                  supervisor_empleado_id: 'sup-1',
                  metadata: {
                    workflow_stage: 'SELECCION_APROBADA',
                    onboarding_operativo: {
                      pdv_objetivo_id: 'pdv-3',
                    },
                  },
                },
                {
                  id: 'cand-2',
                  nombre_completo: 'Candidata Admin',
                  puesto: 'DERMOCONSEJERO',
                  estatus_laboral: 'SUSPENDIDO',
                  supervisor_empleado_id: 'sup-1',
                  metadata: {
                    workflow_stage: 'PENDIENTE_ACCESO_ADMIN',
                    admin_access_pending: true,
                    onboarding_operativo: {
                      fecha_isdinizacion: today,
                    },
                  },
                },
              ],
              error: null,
            })
          }

          return Promise.resolve({ data: [], error: null })
        },
        limit() {
          return Promise.resolve({ data: [], error: null })
        },
      }

      return query
    },
  }

  const data = await obtenerPanelDashboard(
    {
      ...actorBase,
      puesto: 'RECLUTAMIENTO',
      username: 'reclutamiento',
      nombreCompleto: 'Reclutamiento Uno',
    },
    {},
    recruitmentClient as never
  )

  expect(data.infraestructuraLista).toBe(true)
  expect(data.scopeLabel).toBe('Cobertura de reclutamiento')
  expect(data.recruitmentCoverage).toMatchObject({
    target: 250,
    plantillaActiva: 1,
    plantillaEsperaTransito: 1,
    totalContratadas: 2,
    pdvsCubiertos: 1,
    pdvsReservados: 1,
    pdvsVacantes: 1,
    pdvsBloqueados: 1,
    pendientesAccesoVencidos: 1,
    vacantesEnProcesoFirma: 1,
    listosAdministracion: 1,
    proximasIsdinizaciones: 1,
  })
  expect(data.widgets).toEqual(resolveDashboardWidgets('RECLUTAMIENTO'))
})
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

  const data = await obtenerPanelDashboard(actorBase, {}, client as never)

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
  expect(data.filtros).toEqual({ periodo: '', estado: '', zona: '', supervisorId: '' })
  expect(data.widgets).toEqual(resolveDashboardWidgets('ADMINISTRADOR'))
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
    {},
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

test('consume el snapshot disponible aunque ya este vencido', async () => {
  const staleDate = '2026-03-14T00:00:00.000Z'
  const client = createFakeDashboardSupabase({
    initial: {
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
          refreshed_at: staleDate,
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelDashboard(actorBase, {}, client as never)

  expect(data.stats.ventasConfirmadasHoy).toBe(2)
  expect(data.stats.montoConfirmadoHoy).toBe(1900)
  expect(data.refreshedAt).toBe(staleDate)
})

test('hidrata supervisoras en batch para evitar N+1 al construir filtros y mapa', async () => {
  const todayIso = new Date().toISOString().slice(0, 10)
  const currentPeriod = todayIso.slice(0, 7)
  const freshDate = new Date().toISOString()
  const client = createFakeDashboardSupabase({
    initial: {
      data: [
        {
          fecha_corte: todayIso,
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
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          empleado_nombre: 'DC Uno',
          pdv_id: 'pdv-1',
          pdv_clave_btl: 'BTL-001',
          pdv_nombre: 'PDV Centro',
          fecha_operacion: todayIso,
          check_in_utc: `${todayIso}T16:05:00.000Z`,
          check_out_utc: null,
          latitud_check_in: 19.4326,
          longitud_check_in: -99.1332,
          distancia_check_in_metros: 18,
          estado_gps: 'DENTRO_GEOCERCA',
          estatus: 'VALIDA',
          pdv_zona: 'Centro',
        },
        {
          id: 'asis-2',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-2',
          empleado_nombre: 'DC Dos',
          pdv_id: 'pdv-2',
          pdv_clave_btl: 'BTL-002',
          pdv_nombre: 'PDV Norte',
          fecha_operacion: todayIso,
          check_in_utc: `${todayIso}T16:05:00.000Z`,
          check_out_utc: null,
          latitud_check_in: 25.6866,
          longitud_check_in: -100.3161,
          distancia_check_in_metros: 22,
          estado_gps: 'DENTRO_GEOCERCA',
          estatus: 'VALIDA',
          pdv_zona: 'Norte',
        },
      ],
      error: null,
    },
    geocercas: {
      data: [
        { pdv_id: 'pdv-1', latitud: 19.4326, longitud: -99.1332, radio_tolerancia_metros: 30 },
        { pdv_id: 'pdv-2', latitud: 25.6866, longitud: -100.3161, radio_tolerancia_metros: 160 },
      ],
      error: null,
    },
    empleados: {
      data: [
        { id: 'sup-1', nombre: 'Supervisora Centro' },
        { id: 'sup-2', nombre: 'Supervisor Norte' },
      ],
      error: null,
    },
  })

  const insights = await obtenerInsightsDashboard(actorBase, { period: currentPeriod }, client as never)

  expect(client.getInValues()).toEqual(['sup-1', 'sup-2'])
  expect(insights.mapaPromotores).toHaveLength(2)
  expect(insights.mapaPromotores[0]?.supervisorNombre).toBeTruthy()
})

test('aplica filtros operativos y expone mapa con supervisor y zona', async () => {
  const todayIso = new Date().toISOString().slice(0, 10)
  const currentPeriod = todayIso.slice(0, 7)
  const freshDate = new Date().toISOString()
  const client = createFakeDashboardSupabase({
    initial: {
      data: [
        {
          fecha_corte: todayIso,
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
          fecha_corte: '2026-02-10',
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
          cuotas_cumplidas_periodo: 1,
          neto_nomina_periodo: 8000,
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
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          empleado_nombre: 'DC Uno',
          pdv_id: 'pdv-1',
          pdv_clave_btl: 'BTL-001',
          pdv_nombre: 'PDV Centro',
          fecha_operacion: todayIso,
          check_in_utc: `${todayIso}T16:05:00.000Z`,
          check_out_utc: null,
          latitud_check_in: 19.4326,
          longitud_check_in: -99.1332,
          distancia_check_in_metros: 18,
          estado_gps: 'DENTRO_GEOCERCA',
          estatus: 'VALIDA',
          pdv_zona: 'Centro',
        },
        {
          id: 'asis-2',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-2',
          empleado_nombre: 'DC Dos',
          pdv_id: 'pdv-2',
          pdv_clave_btl: 'BTL-002',
          pdv_nombre: 'PDV Norte',
          fecha_operacion: todayIso,
          check_in_utc: `${todayIso}T16:05:00.000Z`,
          check_out_utc: null,
          latitud_check_in: 25.6866,
          longitud_check_in: -100.3161,
          distancia_check_in_metros: 22,
          estado_gps: 'DENTRO_GEOCERCA',
          estatus: 'VALIDA',
          pdv_zona: 'Norte',
        },
      ],
      error: null,
    },
    geocercas: {
      data: [
        { pdv_id: 'pdv-1', latitud: 19.4326, longitud: -99.1332, radio_tolerancia_metros: 30 },
        { pdv_id: 'pdv-2', latitud: 25.6866, longitud: -100.3161, radio_tolerancia_metros: 160 },
      ],
      error: null,
    },
    empleados: {
      data: [
        { id: 'sup-1', nombre: 'Supervisora Centro' },
        { id: 'sup-2', nombre: 'Supervisor Norte' },
      ],
      error: null,
    },
    pdvs: {
      data: [
        { id: 'pdv-1', ciudad: { nombre: 'CDMX', estado: null } },
        { id: 'pdv-2', ciudad: { nombre: 'MONTERREY', estado: null } },
      ],
      error: null,
    },
  })

  const summary = await obtenerPanelDashboard(
    actorBase,
    { period: currentPeriod, estado: 'CIUDAD DE MEXICO', zona: 'Centro', supervisorId: 'sup-1' },
    client as never
  )
  const insights = await obtenerInsightsDashboard(
    actorBase,
    { period: currentPeriod, estado: 'CIUDAD DE MEXICO', zona: 'Centro', supervisorId: 'sup-1' },
    client as never
  )

  expect(summary.filtros).toEqual({
    periodo: currentPeriod,
    estado: 'CIUDAD DE MEXICO',
    zona: 'Centro',
    supervisorId: 'sup-1',
  })
  expect(summary.opcionesFiltro.estados).toEqual(['CIUDAD DE MEXICO'])
  expect(summary.opcionesFiltro.zonas).toEqual(['Centro'])
  expect(summary.opcionesFiltro.supervisores).toEqual([
    { id: 'sup-1', nombre: 'Supervisora Centro' },
  ])
  expect(client.getInValues()).toEqual(['sup-1'])
  expect(insights.alertasLive).toHaveLength(1)
  expect(insights.mapaPromotores).toHaveLength(1)
  expect(insights.mapaPromotores[0]).toMatchObject({
    empleado: 'DC Uno',
    supervisorNombre: 'Supervisora Centro',
    zona: 'Centro',
    pdv: 'PDV Centro',
  })
  expect(insights.widgets).toEqual(resolveDashboardWidgets('ADMINISTRADOR'))
})
test('define widgets compactos para supervisor y expande la vista para coordinacion', () => {
  expect(resolveDashboardWidgets('DERMOCONSEJERO')).toEqual(['dermoconsejo'])
  expect(resolveDashboardWidgets('SUPERVISOR')).toEqual([
    'snapshot',
    'filtros',
    'metricas',
    'compacto_supervisor',
    'autorizaciones_supervisor',
    'cartera',
    'mapa',
    'alertas',
    'pulso_comercial',
  ])
  expect(resolveDashboardWidgets('COORDINADOR')).toEqual([
    'snapshot',
    'filtros',
    'metricas',
    'cartera',
    'mapa',
    'alertas',
    'pulso_comercial',
    'disciplina',
  ])
  expect(resolveDashboardWidgets('NOMINA')).toEqual([
    'snapshot',
    'filtros',
    'metricas',
    'cartera',
    'alertas',
    'pulso_comercial',
  ])
})

test('construye dashboard operativo mobile-first para dermoconsejero', async () => {
  const todayIso = new Date().toISOString().slice(0, 10)
  const actorDermo: ActorActual = {
    ...actorBase,
    puesto: 'DERMOCONSEJERO',
    empleadoId: 'dc-1',
    nombreCompleto: 'Nancy Dermo',
  }
  const client = createFakeDashboardSupabase({
    initial: {
      data: [
        {
          fecha_corte: todayIso,
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
          afiliaciones_love: 1,
          asistencia_porcentaje: 100,
          cuotas_cumplidas_periodo: 0,
          neto_nomina_periodo: 0,
          refreshed_at: `${todayIso}T18:00:00.000Z`,
        },
      ],
      error: null,
    },
    asignaciones: {
      data: [
        {
          id: 'asg-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'dc-1',
          supervisor_empleado_id: null,
          pdv_id: 'pdv-1',
          fecha_inicio: todayIso,
          fecha_fin: null,
          tipo: 'FIJA',
          dias_laborales: 'L,M,X,J,V,S',
          dia_descanso: 'D',
          horario_referencia: '10:00',
          estado_publicacion: 'PUBLICADA',
        },
      ],
      error: null,
    },
    asistencia: {
      data: [
        {
          id: 'asis-1',
          cuenta_cliente_id: 'c1',
          asignacion_id: 'asg-1',
          empleado_id: 'dc-1',
          pdv_id: 'pdv-1',
          fecha_operacion: todayIso,
          check_in_utc: `${todayIso}T16:00:00.000Z`,
          check_out_utc: null,
          pdv_nombre: 'Plaza Oasis',
          pdv_clave_btl: 'BTL-010',
          mision_instruccion: 'Activar exhibidor',
          mision_codigo: 'M-01',
        },
      ],
      error: null,
    },
    pdvs: {
      data: [
        {
          id: 'pdv-1',
          nombre: 'Plaza Oasis',
          direccion: 'Av. Universidad 1778',
          clave_btl: 'BTL-010',
          zona: 'Sur',
        },
      ],
      error: null,
    },
    ventas: {
      data: [
        { id: 'venta-1', empleado_id: 'dc-1', fecha_utc: `${todayIso}T17:00:00.000Z` },
        { id: 'venta-2', empleado_id: 'dc-1', fecha_utc: `${todayIso}T18:00:00.000Z` },
      ],
      error: null,
    },
    love: {
      data: [{ id: 'love-1', empleado_id: 'dc-1', fecha_utc: `${todayIso}T18:15:00.000Z` }],
      error: null,
    },
    campanasPdv: {
      data: [
        {
          id: 'cp-1',
          campana_id: 'camp-1',
          cuenta_cliente_id: 'c1',
          pdv_id: 'pdv-1',
          dc_empleado_id: 'dc-1',
        },
      ],
      error: null,
    },
    campanas: {
      data: [
        {
          id: 'camp-1',
          nombre: 'Bloqueador solar marzo',
          fecha_inicio: todayIso,
          fecha_fin: todayIso,
          estado: 'ACTIVA',
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelDashboard(actorDermo, {}, client as never)

  expect(data.widgets).toEqual(['dermoconsejo'])
  expect(data.dermoconsejo).toMatchObject({
    greetingName: 'Nancy Dermo',
    store: {
      nombre: 'Plaza Oasis',
      direccion: 'Av. Universidad 1778',
      claveBtl: 'BTL-010',
    },
    shift: {
      isOpen: true,
      buttonLabel: 'Registrar Salida',
      buttonHref: '/asistencias',
    },
    activeCampaign: {
      nombre: 'Bloqueador solar marzo',
      ctaHref: '/campanas',
    },
  })
  expect(data.dermoconsejo?.counters).toEqual([
    {
      label: 'Ventas',
      value: 2,
      helper: 'Registros de ventas de hoy',
    },
    {
      label: 'Capturas',
      value: 1,
      helper: 'Clientes capturados hoy',
    },
  ])
})
test('combina alertas live de geocerca, retardo y cuota baja', async () => {
  const todayIso = new Date().toISOString().slice(0, 10)
  const todayCode = ['D', 'L', 'M', 'X', 'J', 'V', 'S'][new Date().getUTCDay()]
  const freshDate = `${todayIso}T17:40:00.000Z`
  const client = createFakeDashboardSupabase({
    initial: {
      data: [
        {
          fecha_corte: todayIso,
          cuenta_cliente_id: 'c1',
          cuenta_cliente: 'ISDIN Mexico',
          cuenta_cliente_identificador: 'isdin_mexico',
          promotores_activos: 2,
          checkins_validos: 2,
          jornadas_pendientes: 0,
          alertas_operativas: 1,
          jornadas_operadas: 2,
          ventas_confirmadas: 2,
          monto_confirmado: 2500,
          afiliaciones_love: 1,
          asistencia_porcentaje: 100,
          cuotas_cumplidas_periodo: 0,
          neto_nomina_periodo: 10000,
          refreshed_at: freshDate,
        },
      ],
      error: null,
    },
    asistencia: {
      data: [
        {
          id: 'asis-geo',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          empleado_nombre: 'DC Uno',
          pdv_id: 'pdv-1',
          pdv_clave_btl: 'BTL-001',
          pdv_nombre: 'PDV Centro',
          fecha_operacion: todayIso,
          check_in_utc: `${todayIso}T16:05:00.000Z`,
          check_out_utc: null,
          latitud_check_in: 19.4326,
          longitud_check_in: -99.1332,
          distancia_check_in_metros: 18,
          estado_gps: 'FUERA_GEOCERCA',
          estatus: 'VALIDA',
          pdv_zona: 'Centro',
        },
        {
          id: 'asis-tardy',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-2',
          supervisor_empleado_id: 'sup-2',
          empleado_nombre: 'DC Dos',
          pdv_id: 'pdv-2',
          pdv_clave_btl: 'BTL-002',
          pdv_nombre: 'PDV Norte',
          fecha_operacion: todayIso,
          check_in_utc: `${todayIso}T18:30:00.000Z`,
          check_out_utc: null,
          latitud_check_in: 25.6866,
          longitud_check_in: -100.3161,
          distancia_check_in_metros: 22,
          estado_gps: 'DENTRO_GEOCERCA',
          estatus: 'VALIDA',
          pdv_zona: 'Norte',
        },
      ],
      error: null,
    },
    geocercas: {
      data: [
        { pdv_id: 'pdv-1', latitud: 19.4326, longitud: -99.1332, radio_tolerancia_metros: 30 },
        { pdv_id: 'pdv-2', latitud: 25.6866, longitud: -100.3161, radio_tolerancia_metros: 160 },
      ],
      error: null,
    },
    empleados: {
      data: [
        { id: 'sup-1', nombre: 'Supervisora Centro' },
        { id: 'sup-2', nombre: 'Supervisor Norte' },
      ],
      error: null,
    },
    asignaciones: {
      data: [
        {
          id: 'asg-1',
          empleado_id: 'emp-1',
          cuenta_cliente_id: 'c1',
          supervisor_empleado_id: 'sup-1',
          fecha_inicio: todayIso,
          fecha_fin: null,
          tipo: 'FIJA',
          dias_laborales: todayCode,
          dia_descanso: null,
          horario_referencia: '10:00',
        },
        {
          id: 'asg-2',
          empleado_id: 'emp-2',
          cuenta_cliente_id: 'c1',
          supervisor_empleado_id: 'sup-2',
          fecha_inicio: todayIso,
          fecha_fin: null,
          tipo: 'FIJA',
          dias_laborales: todayCode,
          dia_descanso: null,
          horario_referencia: '10:00',
        },
      ],
      error: null,
    },
    solicitudes: { data: [], error: null },
    configuracion: {
      data: [{ clave: 'asistencias.tolerancia_checkin_minutos', valor: 15 }],
      error: null,
    },
    periodos: {
      data: [{ id: 'periodo-1', estado: 'ABIERTO', fecha_inicio: '2026-03-01', fecha_fin: todayIso }],
      error: null,
    },
    cuotas: {
      data: [
        {
          id: 'cuota-1',
          periodo_id: 'periodo-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-3',
          cumplimiento_porcentaje: 55,
          estado: 'RIESGO',
          empleado: { nombre_completo: 'DC Tres', supervisor_empleado_id: 'sup-1' },
        },
      ],
      error: null,
    },
  })

  const insights = await obtenerInsightsDashboard(actorBase, {}, client as never)

  expect(insights.alertasLive.map((item) => item.tipo)).toEqual(['GEOCERCA', 'RETARDO', 'CUOTA_BAJA'])
})

test('prioriza pendientes IMSS en dashboard de nomina y los cuenta en el resumen', async () => {
  const todayIso = new Date().toISOString().slice(0, 10)
  const freshDate = `${todayIso}T17:40:00.000Z`
  const actorNomina: ActorActual = {
    ...actorBase,
    puesto: 'NOMINA',
  }
  const client = createFakeDashboardSupabase({
    initial: {
      data: [
        {
          fecha_corte: todayIso,
          cuenta_cliente_id: 'c1',
          cuenta_cliente: 'ISDIN Mexico',
          cuenta_cliente_identificador: 'isdin_mexico',
          promotores_activos: 2,
          checkins_validos: 2,
          jornadas_pendientes: 0,
          alertas_operativas: 1,
          jornadas_operadas: 2,
          ventas_confirmadas: 2,
          monto_confirmado: 2500,
          afiliaciones_love: 1,
          asistencia_porcentaje: 100,
          cuotas_cumplidas_periodo: 0,
          neto_nomina_periodo: 10000,
          refreshed_at: freshDate,
        },
      ],
      error: null,
    },
    empleados: {
      data: [
        {
          id: 'emp-imss-1',
          nombre_completo: 'DC Pendiente Uno',
          expediente_estado: 'VALIDADO',
          expediente_validado_en: `${todayIso}T12:00:00.000Z`,
          imss_estado: 'NO_INICIADO',
          imss_fecha_solicitud: null,
          metadata: { workflow_stage: 'PENDIENTE_IMSS_NOMINA' },
          created_at: `${todayIso}T11:00:00.000Z`,
        },
        {
          id: 'emp-imss-2',
          nombre_completo: 'DC Pendiente Dos',
          expediente_estado: 'VALIDADO',
          expediente_validado_en: `${todayIso}T13:00:00.000Z`,
          imss_estado: 'EN_PROCESO',
          imss_fecha_solicitud: `${todayIso}`,
          metadata: { workflow_stage: 'EN_FLUJO_IMSS' },
          created_at: `${todayIso}T10:00:00.000Z`,
        },
      ],
      error: null,
    },
  })

  const summary = await obtenerPanelDashboard(actorNomina, {}, client as never)
  const insights = await obtenerInsightsDashboard(actorNomina, {}, client as never)

  expect(summary.stats.imssPendientes).toBe(2)
  expect(summary.widgets).toEqual(resolveDashboardWidgets('NOMINA'))
  expect(insights.alertasLive.map((item) => item.tipo)).toEqual([
    'IMSS_PENDIENTE',
    'IMSS_PENDIENTE',
  ])
  expect(insights.alertasLive[0]).toMatchObject({
    empleado: 'DC Pendiente Uno',
    pdv: 'Alta IMSS pendiente',
  })
})
