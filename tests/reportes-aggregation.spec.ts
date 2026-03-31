import { expect, test } from '@playwright/test'
import { obtenerPanelReportes } from '../src/features/reportes/services/reporteService'

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

function createFakeSupabase(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      return {
        select() {
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
        limit() {
          const result = results[table] ?? { data: [], error: null }
          return Promise.resolve(result)
        },
      }
    },
  }
}

test('consolida reportes, filtros y subreportes operativos', async () => {
  const client = createFakeSupabase({
    asistencia: {
      data: [
        {
          id: 'a1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'e1',
          pdv_id: 'p1',
          fecha_operacion: '2026-03-10',
          estatus: 'VALIDA',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          pdv: { zona: 'Norte', nombre: 'Liverpool Norte', clave_btl: 'LIV-001' },
        },
        {
          id: 'a2',
          cuenta_cliente_id: 'c1',
          empleado_id: 'e1',
          pdv_id: 'p1',
          fecha_operacion: '2026-03-10',
          estatus: 'PENDIENTE_VALIDACION',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          pdv: { zona: 'Norte', nombre: 'Liverpool Norte', clave_btl: 'LIV-001' },
        },
      ],
      error: null,
    },
    venta: {
      data: [
        {
          id: 'v1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'e1',
          pdv_id: 'p1',
          producto_nombre: 'Fusion Water',
          total_monto: 1800,
          total_unidades: 6,
          confirmada: true,
          fecha_utc: '2026-03-10T10:00:00.000Z',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          pdv: { zona: 'Norte', nombre: 'Liverpool Norte', clave_btl: 'LIV-001' },
        },
      ],
      error: null,
    },
    cuota_empleado_periodo: {
      data: [
        {
          id: 'q1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'e1',
          cumplimiento_porcentaje: 118,
          bono_estimado: 250,
          estado: 'CUMPLIDA',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
        },
      ],
      error: null,
    },
    nomina_ledger: {
      data: [
        {
          id: 'l1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'e1',
          tipo_movimiento: 'PERCEPCION',
          concepto: 'BONO',
          referencia_tabla: null,
          monto: 1000,
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          periodo: { clave: '2026-03-Q1' },
        },
      ],
      error: null,
    },
    gasto: {
      data: [
        {
          id: 'g1',
          cuenta_cliente_id: 'c1',
          pdv_id: 'p1',
          tipo: 'TRANSPORTE',
          monto: 250,
          fecha_gasto: '2026-03-10',
          estatus: 'REEMBOLSADO',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          pdv: { zona: 'Norte', nombre: 'Liverpool Norte', clave_btl: 'LIV-001' },
        },
      ],
      error: null,
    },
    love_isdin: {
      data: [
        {
          id: 'love-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'e1',
          pdv_id: 'p1',
          fecha_utc: '2026-03-12T10:00:00.000Z',
          estatus: 'VALIDA',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          pdv: { zona: 'Norte', nombre: 'Liverpool Norte', clave_btl: 'LIV-001' },
        },
      ],
      error: null,
    },
    audit_log: {
      data: [
        {
          id: 1,
          tabla: 'venta',
          registro_id: 'v1',
          accion: 'EVENTO',
          payload: { evento: 'venta_confirmada', resumen: 'Venta confirmada' },
          created_at: '2026-03-15T03:00:00.000Z',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          usuario: { username: 'admin' },
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelReportes(client as never, {
    period: '2026-03',
    page: 1,
    pageSize: 25,
    campaignData: {
      campanas: [
        {
          id: 'camp-1',
          cuentaClienteId: 'c1',
          cuentaCliente: 'ISDIN Mexico',
          cadenaId: null,
          cadena: null,
          nombre: 'Proteccion Solar',
          descripcion: null,
          fechaInicio: '2026-03-01',
          fechaFin: '2026-03-31',
          estado: 'ACTIVA',
          ventanaActiva: true,
          productosFoco: [],
          productoIds: [],
          cuotaAdicional: 0,
          instrucciones: null,
          evidenciasRequeridas: ['Foto exhibicion'],
          totalPdvs: 1,
          pdvsCumplidos: 0,
          avancePromedio: 50,
          tareasPendientes: 1,
          pdvs: [
            {
              id: 'cp-1',
              pdvId: 'p1',
              pdv: 'Liverpool Norte',
              claveBtl: 'LIV-001',
              zona: 'Norte',
              cadena: 'Liverpool',
              cuentaCliente: 'ISDIN Mexico',
              dcEmpleadoId: 'e1',
              dcNombre: 'Ana Uno',
              supervisorNombre: 'Sup Uno',
              productGoals: [],
              tareasRequeridas: ['Montar exhibicion'],
              tareasCumplidas: [],
              tareasPendientes: 1,
              evidenciasRequeridas: ['Foto exhibicion'],
              evidenciasCargadas: 0,
              avancePorcentaje: 50,
              estatus: 'EN_PROGRESO',
              comentarios: null,
            },
          ],
        },
      ],
    },
  })

  expect(data.infraestructuraLista).toBe(true)
  expect(data.filtros).toEqual({ periodo: '2026-03', page: 1, pageSize: 25 })
  expect(data.paginacion.totalPages).toBe(1)
  expect(data.asistencias[0]).toMatchObject({ empleado: 'Ana Uno', pdv: 'LIV-001', totalJornadas: 2 })
  expect(data.ventas[0]).toMatchObject({ dc: 'Ana Uno', producto: 'Fusion Water', montoConfirmado: 1800 })
  expect(data.gastos[0]).toMatchObject({ tipo: 'TRANSPORTE', montoReembolsado: 250 })
  expect(data.love[0]).toMatchObject({ dc: 'Ana Uno', afiliaciones: 1 })
  expect(data.nomina[0]).toMatchObject({ empleado: 'Ana Uno', percepciones: 1000, neto: 1000 })
  expect(data.campanas[0]).toMatchObject({ campana: 'Proteccion Solar', pdv: 'LIV-001 - Liverpool Norte', dc: 'Ana Uno', tareasPendientes: 1 })
  expect(data.bitacora[0]).toMatchObject({ tabla: 'venta', usuario: 'admin' })
})

test('degrada a infraestructura pendiente cuando falla una consulta fuente', async () => {
  const client = createFakeSupabase({
    asistencia: { data: [], error: null },
    venta: { data: [], error: null },
    cuota_empleado_periodo: { data: [], error: null },
    nomina_ledger: { data: [], error: null },
    gasto: { data: [], error: null },
    love_isdin: { data: [], error: null },
    audit_log: { data: null, error: { message: 'audit_log unavailable' } },
  })

  const data = await obtenerPanelReportes(client as never, { period: '2026-03', page: 1, pageSize: 25 })

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('audit_log unavailable')
  expect(data.clientes).toEqual([])
  expect(data.campanas).toEqual([])
  expect(data.bitacora).toEqual([])
})
