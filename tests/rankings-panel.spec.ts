import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { buildPublicRankingPanel, obtenerPanelRanking, resetRankingCache } from '../src/features/rankings/services/rankingService'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function createFakeRankingSupabase(results: {
  ventas: QueryResult
  love: QueryResult
  empleados?: QueryResult
  cuotas?: QueryResult
}) {
  const eqValues = new Map<string, string>()
  let ventasCalls = 0
  let loveCalls = 0
  let cuotasCalls = 0

  return {
    from(table: 'venta' | 'love_isdin' | 'empleado' | 'cuota_empleado_periodo') {
      return {
        select() {
          return this
        },
        eq(column: string, value: string) {
          eqValues.set(`${table}:${column}`, value)
          return this
        },
        gte() {
          return this
        },
        lt() {
          return this
        },
        order() {
          return this
        },
        in() {
          return Promise.resolve(results.empleados ?? { data: [], error: null })
        },
        limit() {
          if (table === 'venta') {
            ventasCalls += 1
            return Promise.resolve(results.ventas)
          }

          if (table === 'love_isdin') {
            loveCalls += 1
            return Promise.resolve(results.love)
          }

          if (table === 'cuota_empleado_periodo') {
            cuotasCalls += 1
            return Promise.resolve(results.cuotas ?? { data: [], error: null })
          }

          return Promise.resolve(results.empleados ?? { data: [], error: null })
        },
      }
    },
    getEqValue(table: string, column: string) {
      return eqValues.get(`${table}:${column}`) ?? null
    },
    getCalls() {
      return { ventasCalls, loveCalls, cuotasCalls }
    },
  }
}

const actorBase: ActorActual = {
  authUserId: 'auth-1',
  usuarioId: 'user-1',
  empleadoId: 'emp-1',
  cuentaClienteId: 'c1',
  username: 'dc-uno',
  correoElectronico: 'dc-uno@example.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'DC Uno',
  puesto: 'DERMOCONSEJERO',
}

test.beforeEach(() => {
  resetRankingCache()
})

test('consolida ranking de ventas, love, zona y supervisor con filtros operativos', async () => {
  const client = createFakeRankingSupabase({
    ventas: {
      data: [
        {
          id: 'venta-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          fecha_utc: '2026-03-16T12:00:00.000Z',
          total_unidades: 3,
          total_monto: 1500,
          confirmada: true,
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: {
            id: 'emp-1',
            id_nomina: 'DC-001',
            nombre_completo: 'DC Uno',
            puesto: 'DERMOCONSEJERO',
            zona: 'Centro',
            supervisor_empleado_id: 'sup-1',
          },
          pdv: { zona: 'Centro', nombre: 'PDV Centro', clave_btl: 'BTL-001' },
        },
        {
          id: 'venta-2',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-2',
          pdv_id: 'pdv-2',
          fecha_utc: '2026-03-16T13:00:00.000Z',
          total_unidades: 2,
          total_monto: 900,
          confirmada: true,
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: {
            id: 'emp-2',
            id_nomina: 'DC-002',
            nombre_completo: 'DC Dos',
            puesto: 'DERMOCONSEJERO',
            zona: 'Norte',
            supervisor_empleado_id: 'sup-2',
          },
          pdv: { zona: 'Norte', nombre: 'PDV Norte', clave_btl: 'BTL-002' },
        },
      ],
      error: null,
    },
    love: {
      data: [
        {
          id: 'love-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          fecha_utc: '2026-03-16T14:00:00.000Z',
          estatus: 'VALIDA',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: {
            id: 'emp-1',
            id_nomina: 'DC-001',
            nombre_completo: 'DC Uno',
            puesto: 'DERMOCONSEJERO',
            zona: 'Centro',
            supervisor_empleado_id: 'sup-1',
          },
          pdv: { zona: 'Centro', nombre: 'PDV Centro', clave_btl: 'BTL-001' },
        },
        {
          id: 'love-2',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          fecha_utc: '2026-03-16T15:00:00.000Z',
          estatus: 'PENDIENTE_VALIDACION',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: {
            id: 'emp-1',
            id_nomina: 'DC-001',
            nombre_completo: 'DC Uno',
            puesto: 'DERMOCONSEJERO',
            zona: 'Centro',
            supervisor_empleado_id: 'sup-1',
          },
          pdv: { zona: 'Centro', nombre: 'PDV Centro', clave_btl: 'BTL-001' },
        },
      ],
      error: null,
    },
    empleados: {
      data: [
        { id: 'sup-1', nombre_completo: 'Supervisora Centro' },
        { id: 'sup-2', nombre_completo: 'Supervisor Norte' },
      ],
      error: null,
    },
    cuotas: {
      data: [
        {
          id: 'cuota-1',
          periodo_id: 'periodo-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          cumplimiento_porcentaje: 115,
          estado: 'CUMPLIDA',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: {
            id: 'emp-1',
            id_nomina: 'DC-001',
            nombre_completo: 'DC Uno',
            puesto: 'DERMOCONSEJERO',
            zona: 'Centro',
            supervisor_empleado_id: 'sup-1',
          },
          periodo: { clave: '2026-03-Q1' },
        },
        {
          id: 'cuota-2',
          periodo_id: 'periodo-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-2',
          cumplimiento_porcentaje: 65,
          estado: 'RIESGO',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: {
            id: 'emp-2',
            id_nomina: 'DC-002',
            nombre_completo: 'DC Dos',
            puesto: 'DERMOCONSEJERO',
            zona: 'Norte',
            supervisor_empleado_id: 'sup-2',
          },
          periodo: { clave: '2026-03-Q1' },
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelRanking(actorBase, client as never, {
    periodo: '2026-03',
    corte: 'MES',
  })

  expect(client.getEqValue('venta', 'cuenta_cliente_id')).toBe('c1')
  expect(data.filtros).toEqual({ periodo: '2026-03', corte: 'MES', zona: '', supervisorId: '' })
  expect(data.resumen).toMatchObject({ totalDcs: 2, totalSupervisores: 2, totalZonas: 2, totalPdvs: 2, miPosicionVentas: 1, miPosicionLove: 1 })
  expect(data.ventasDcs[0]).toMatchObject({ empleado: 'DC Uno', montoConfirmado: 1500, supervisorNombre: 'Supervisora Centro', esActorActual: true })
  expect(data.loveDcs[0]).toMatchObject({ empleado: 'DC Uno', afiliacionesLove: 2, validasLove: 1 })
  expect(data.pdvs[0]).toMatchObject({ pdv: 'PDV Centro', montoConfirmado: 1500, ventasConfirmadas: 1, dcsActivos: 1 })
  expect(data.supervisores[0]).toMatchObject({ supervisorNombre: 'Supervisora Centro', dcsActivos: 1 })
  expect(data.zonas[0]).toMatchObject({ zona: 'Centro', afiliacionesLove: 2 })
  expect(data.cuotasZonas[0]).toMatchObject({ zona: 'Centro', cuotasCumplidas: 1, cumplimientoPromedio: 115 })
})

test('cachea el snapshot de ranking por 15 minutos para la misma combinacion de actor y filtros', async () => {
  const client = createFakeRankingSupabase({
    ventas: { data: [], error: null },
    love: { data: [], error: null },
    cuotas: { data: [], error: null },
    empleados: { data: [], error: null },
  })

  await obtenerPanelRanking(actorBase, client as never, { periodo: '2026-03', corte: 'MES' })
  await obtenerPanelRanking(actorBase, client as never, { periodo: '2026-03', corte: 'MES' })

  expect(client.getCalls()).toMatchObject({ ventasCalls: 1, loveCalls: 1, cuotasCalls: 1 })
})

test('acota automaticamente el ranking de supervisor a su propio equipo', async () => {
  const client = createFakeRankingSupabase({
    ventas: {
      data: [
        {
          id: 'venta-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          fecha_utc: '2026-03-16T12:00:00.000Z',
          total_unidades: 3,
          total_monto: 1500,
          confirmada: true,
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: {
            id: 'emp-1',
            id_nomina: 'DC-001',
            nombre_completo: 'DC Uno',
            puesto: 'DERMOCONSEJERO',
            zona: 'Centro',
            supervisor_empleado_id: 'sup-1',
          },
          pdv: { zona: 'Centro', nombre: 'PDV Centro', clave_btl: 'BTL-001' },
        },
        {
          id: 'venta-2',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-2',
          pdv_id: 'pdv-2',
          fecha_utc: '2026-03-16T13:00:00.000Z',
          total_unidades: 2,
          total_monto: 900,
          confirmada: true,
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: {
            id: 'emp-2',
            id_nomina: 'DC-002',
            nombre_completo: 'DC Dos',
            puesto: 'DERMOCONSEJERO',
            zona: 'Norte',
            supervisor_empleado_id: 'sup-2',
          },
          pdv: { zona: 'Norte', nombre: 'PDV Norte', clave_btl: 'BTL-002' },
        },
      ],
      error: null,
    },
    love: { data: [], error: null },
    cuotas: { data: [], error: null },
    empleados: {
      data: [{ id: 'sup-1', nombre_completo: 'Supervisora Centro' }, { id: 'sup-2', nombre_completo: 'Supervisor Norte' }],
      error: null,
    },
  })

  const data = await obtenerPanelRanking(
    {
      ...actorBase,
      empleadoId: 'sup-1',
      nombreCompleto: 'Supervisora Centro',
      puesto: 'SUPERVISOR',
    },
    client as never,
    { periodo: '2026-03', corte: 'MES', supervisorId: 'sup-2' }
  )

  expect(data.filtros.supervisorId).toBe('sup-1')
  expect(data.ventasDcs).toHaveLength(1)
  expect(data.ventasDcs[0].empleado).toBe('DC Uno')
})
test('genera una vista publica anonimizada sin datos sensibles', () => {
  const snapshot = buildPublicRankingPanel({
    filtros: { periodo: '2026-03', corte: 'MES', zona: '', supervisorId: '' },
    opcionesFiltro: { zonas: [], supervisores: [] },
    scopeLabel: 'Vista global',
    rangoEtiqueta: 'Mes 2026-03',
    resumen: {
      totalDcs: 2,
      totalSupervisores: 1,
      totalZonas: 1,
      totalPdvs: 1,
      miPosicionVentas: null,
      miPosicionLove: null,
    },
    ventasDcs: [
      {
        posicion: 1,
        empleadoId: 'emp-1',
        empleado: 'Ana Perez',
        idNomina: 'DC-001',
        puesto: 'DERMOCONSEJERO',
        cuentaCliente: 'ISDIN Mexico',
        zona: 'Centro',
        supervisorId: 'sup-1',
        supervisorNombre: 'Supervisora Centro',
        ventasConfirmadas: 3,
        unidadesConfirmadas: 7,
        montoConfirmado: 2500,
        afiliacionesLove: 1,
        validasLove: 1,
        loveObjetivo: 3,
        lovePendiente: 2,
        cumplimientoLovePct: 33.33,
        scoreVentas: 2570,
        scoreLove: 1,
        esActorActual: false,
      },
    ],
    loveDcs: [
      {
        posicion: 1,
        empleadoId: 'emp-1',
        empleado: 'Ana Perez',
        idNomina: 'DC-001',
        puesto: 'DERMOCONSEJERO',
        cuentaCliente: 'ISDIN Mexico',
        zona: 'Centro',
        supervisorId: 'sup-1',
        supervisorNombre: 'Supervisora Centro',
        ventasConfirmadas: 3,
        unidadesConfirmadas: 7,
        montoConfirmado: 2500,
        afiliacionesLove: 4,
        validasLove: 3,
        loveObjetivo: 3,
        lovePendiente: 0,
        cumplimientoLovePct: 133.33,
        scoreVentas: 2570,
        scoreLove: 4,
        esActorActual: false,
      },
    ],
    supervisores: [],
    zonas: [],
    cuotasZonas: [],
    pdvs: [
      {
        posicion: 1,
        pdvId: 'pdv-1',
        pdv: 'Farmacia Centro',
        claveBtl: 'BTL-001',
        zona: 'Centro',
        cuentaCliente: 'ISDIN Mexico',
        dcsActivos: 2,
        ventasConfirmadas: 5,
        unidadesConfirmadas: 9,
        montoConfirmado: 3900,
        scoreVentas: 3990,
      },
    ],
    generatedAt: '2026-03-18T23:00:00.000Z',
    infraestructuraLista: true,
  })

  expect(snapshot.scopeLabel).toBe('Muro publico de ranking')
  expect(snapshot.ventasDcs[0]).toEqual({
    posicion: 1,
    colaboradora: 'Ana P.',
    zona: 'Centro',
    montoConfirmado: 2500,
    unidadesConfirmadas: 7,
    afiliacionesLove: 1,
  })
  expect(snapshot.pdvs[0]).toEqual({
    posicion: 1,
    pdv: 'Farmacia Centro',
    zona: 'Centro',
    montoConfirmado: 3900,
    ventasConfirmadas: 5,
  })
})