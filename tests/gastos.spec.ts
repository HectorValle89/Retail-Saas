import { expect, test } from '@playwright/test'
import { obtenerPanelGastos } from '../src/features/gastos/services/gastoService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

type FakeResults = Record<string, QueryResult>

function createFakeGastosClient(results: FakeResults) {
  return {
    from(table: string) {
      const entry = results[table] ?? { data: null, error: null }

      const chain = {
        table,
        select() {
          return chain
        },
        eq() {
          return chain
        },
        in() {
          return chain
        },
        order() {
          return chain
        },
        limit() {
          return chain
        },
        maybeSingle() {
          return Promise.resolve(entry)
        },
        then(resolve: (value: QueryResult) => void) {
          return Promise.resolve(entry).then(resolve)
        },
      }

      return chain
    },
  }
}

test('consolida gastos operativos por cuenta, empleado y categoria', async () => {
  const fakeClient = createFakeGastosClient({
    gasto: {
      data: [
        {
          id: 'gasto-1',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'emp-2',
          pdv_id: 'pdv-1',
          formacion_evento_id: null,
          fecha_gasto: '2026-03-15',
          tipo: 'VIATICOS',
          monto: 1500.5,
          moneda: 'MXN',
          estatus: 'SOLICITADO',
          notas: 'Gasto de viaje para formacion',
          metadata: {},
          created_at: '2026-03-15T10:00:00.000Z',
          updated_at: '2026-03-15T10:00:00.000Z',
          cuenta_cliente: { id: 'cuenta-1', nombre: 'Cuenta Principal' },
          empleado: { id: 'emp-1', nombre_completo: 'Ana', puesto: 'COORDINADOR' },
          supervisor: { id: 'emp-2', nombre_completo: 'Carlos', puesto: 'SUPERVISOR' },
          pdv: { id: 'pdv-1', clave_btl: 'CLAVE-001', nombre: 'Farmacia Centro' },
          formacion_evento: null,
        },
        {
          id: 'gasto-2',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'emp-2',
          pdv_id: 'pdv-1',
          formacion_evento_id: 'evento-1',
          fecha_gasto: '2026-03-15',
          tipo: 'FORMACION',
          monto: 350.0,
          moneda: 'MXN',
          estatus: 'REEMBOLSADO',
          notas: 'Taxis para equipo',
          metadata: { approval_stage: 'REEMBOLSADO' },
          created_at: '2026-03-15T11:00:00.000Z',
          updated_at: '2026-03-15T12:00:00.000Z',
          cuenta_cliente: { id: 'cuenta-1', nombre: 'Cuenta Principal' },
          empleado: { id: 'emp-1', nombre_completo: 'Ana', puesto: 'COORDINADOR' },
          supervisor: { id: 'emp-2', nombre_completo: 'Carlos', puesto: 'SUPERVISOR' },
          pdv: { id: 'pdv-1', clave_btl: 'CLAVE-001', nombre: 'Farmacia Centro' },
          formacion_evento: { id: 'evento-1', nombre: 'Induccion' },
        },
      ],
      error: null,
    },
    formacion_evento: {
      data: [
        {
          id: 'evento-1',
          cuenta_cliente_id: 'cuenta-1',
          nombre: 'Induccion',
          descripcion: 'Evento base',
          sede: 'Sede centro',
          ciudad: 'CDMX',
          tipo: 'Induccion',
          responsable: { id: 'emp-99', nombre_completo: 'Laura', puesto: 'COORDINADOR' },
          fecha_inicio: '2026-03-20',
          fecha_fin: '2026-03-21',
          estado: 'PROGRAMADA',
          metadata: {},
          created_at: '2026-03-10T12:00:00.000Z',
          updated_at: '2026-03-10T12:00:00.000Z',
        },
      ],
      error: null,
    },
    empleado: {
      data: [
        { id: 'emp-1', nombre_completo: 'Ana', puesto: 'COORDINADOR' },
        { id: 'emp-2', nombre_completo: 'Carlos', puesto: 'SUPERVISOR' },
      ],
      error: null,
    },
    pdv: {
      data: [
        { id: 'pdv-1', clave_btl: 'CLAVE-001', nombre: 'Farmacia Centro' },
        { id: 'pdv-2', clave_btl: 'CLAVE-002', nombre: 'Farmacia Norte' },
      ],
      error: null,
    },
    cuenta_cliente: {
      data: [
        { id: 'cuenta-1', nombre: 'Cuenta Principal', activo: true },
        { id: 'cuenta-2', nombre: 'Cuenta Secundaria', activo: true },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelGastos(fakeClient as never, { serviceClient: fakeClient as never })

  expect(data.gastos).toHaveLength(2)
  expect(data.resumen.total).toBe(2)
  expect(data.resumen.montoSolicitado).toBe(1850.5)
  expect(data.resumen.pendientes).toBe(1)
  expect(data.resumen.aprobados).toBe(1)
  expect(data.reporteEmpleado).toEqual([
    {
      key: '2026-03::Ana::VIATICOS',
      periodo: '2026-03',
      empleado: 'Ana',
      tipo: 'VIATICOS',
      registros: 1,
      montoSolicitado: 1500.5,
      montoAprobado: 0,
      montoReembolsado: 0,
    },
    {
      key: '2026-03::Ana::FORMACION',
      periodo: '2026-03',
      empleado: 'Ana',
      tipo: 'FORMACION',
      registros: 1,
      montoSolicitado: 350,
      montoAprobado: 350,
      montoReembolsado: 350,
    },
  ])
  expect(data.cuentas).toHaveLength(2)
  expect(data.empleados).toHaveLength(2)
  expect(data.supervisores).toHaveLength(2)
  expect(data.pdvs).toHaveLength(2)
  expect(data.formaciones).toHaveLength(1)
})

test('degrada con mensaje de infraestructura cuando falla consulta', async () => {
  const fakeClient = createFakeGastosClient({
    gasto: { data: null, error: { message: 'tabla no existe' } },
    formacion_evento: { data: [], error: null },
    empleado: { data: [], error: null },
    pdv: { data: [], error: null },
    cuenta_cliente: { data: [], error: null },
  })

  const data = await obtenerPanelGastos(fakeClient as never, { serviceClient: fakeClient as never })

  expect(data.infraestructuraLista).toBe(false)
  expect(data.reporteEmpleado).toEqual([])
  expect(data.mensajeInfraestructura).toContain('control operativo')
})