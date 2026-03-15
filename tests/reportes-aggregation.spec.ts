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

test('consolida reportes, rankings y bitacora con datos agregados', async () => {
  const client = createFakeSupabase({
    asistencia: {
      data: [
        {
          id: 'a1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'e1',
          estatus: 'VALIDA',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
        },
        {
          id: 'a2',
          cuenta_cliente_id: 'c1',
          empleado_id: 'e1',
          estatus: 'PENDIENTE_VALIDACION',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
        },
        {
          id: 'a3',
          cuenta_cliente_id: 'c2',
          empleado_id: 'e2',
          estatus: 'CERRADA',
          cuenta_cliente: { nombre: 'Demo', identificador: 'be_te_ele_demo' },
          empleado: { id_nomina: 'DC-002', nombre_completo: 'Beto Dos', puesto: 'SUPERVISOR' },
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
          total_monto: 1800,
          total_unidades: 6,
          confirmada: true,
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
        },
        {
          id: 'v2',
          cuenta_cliente_id: 'c2',
          empleado_id: 'e2',
          total_monto: 900,
          total_unidades: 3,
          confirmada: false,
          cuenta_cliente: { nombre: 'Demo', identificador: 'be_te_ele_demo' },
          empleado: { id_nomina: 'DC-002', nombre_completo: 'Beto Dos', puesto: 'SUPERVISOR' },
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
          monto: 1000,
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
        },
        {
          id: 'l2',
          cuenta_cliente_id: 'c1',
          empleado_id: 'e1',
          tipo_movimiento: 'DEDUCCION',
          monto: 100,
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
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

  const data = await obtenerPanelReportes(client as never)

  expect(data.infraestructuraLista).toBe(true)
  expect(data.resumen).toEqual({
    jornadasValidas: 2,
    jornadasPendientes: 1,
    ventasConfirmadas: 1,
    montoConfirmado: 1800,
    cuotasCumplidas: 1,
    netoNominaEstimado: 900,
  })
  expect(data.clientes[0]).toMatchObject({
    cuentaCliente: 'ISDIN Mexico',
    ventasConfirmadas: 1,
    montoConfirmado: 1800,
    cuotasCumplidas: 1,
    netoNominaEstimado: 900,
  })
  expect(data.rankingVentas[0]).toMatchObject({
    empleado: 'Ana Uno',
    montoConfirmado: 1800,
    unidadesConfirmadas: 6,
  })
  expect(data.rankingCuotas[0]).toMatchObject({
    empleado: 'Ana Uno',
    cumplimiento: 118,
    jornadasValidas: 1,
    jornadasPendientes: 1,
  })
  expect(data.bitacora[0]).toMatchObject({
    tabla: 'venta',
    usuario: 'admin',
    resumen: 'Venta confirmada',
  })
})

test('degrada a infraestructura pendiente cuando falla una consulta fuente', async () => {
  const client = createFakeSupabase({
    asistencia: { data: [], error: null },
    venta: { data: [], error: null },
    cuota_empleado_periodo: { data: [], error: null },
    nomina_ledger: { data: [], error: null },
    audit_log: { data: null, error: { message: 'audit_log unavailable' } },
  })

  const data = await obtenerPanelReportes(client as never)

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('audit_log unavailable')
  expect(data.clientes).toEqual([])
  expect(data.bitacora).toEqual([])
})