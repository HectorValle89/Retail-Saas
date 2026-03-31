import { expect, test } from '@playwright/test'
import { obtenerPanelLoveIsdin } from '../src/features/love-isdin/services/loveIsdinService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

type FakeResults = Record<string, QueryResult>

function createFakeLoveIsdinClient(results: FakeResults) {
  return {
    from(table: string) {
      const entry = results[table] ?? { data: null, error: null }

      const chain = {
        select(
          _columns?: string,
          options?: {
            count?: 'exact' | 'planned' | 'estimated'
            head?: boolean
          }
        ) {
          if (options?.head) {
            return Promise.resolve({
              data: null,
              error: entry.error,
              count: Array.isArray(entry.data) ? entry.data.length : 0,
            })
          }

          return chain
        },
        eq() {
          return chain
        },
        gte() {
          return chain
        },
        lte() {
          return chain
        },
        is() {
          return chain
        },
        in() {
          return chain
        },
        order() {
          return chain
        },
        range() {
          return Promise.resolve(entry)
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

test('consolida afiliaciones LOVE ISDIN, QR oficial y agregados por PDV/DC', async () => {
  const todayIso = new Date().toISOString().slice(0, 10)
  const fakeClient = createFakeLoveIsdinClient({
    love_isdin: {
      data: [
        {
          id: 'love-1',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          asistencia_id: null,
          fecha_utc: `${todayIso}T10:00:00.000Z`,
          qr_codigo_id: 'qr-1',
          qr_asignacion_id: 'qra-1',
          qr_personal: 'QR-LOVE-001',
          ticket_folio: 'TK-45811',
          afiliado_nombre: 'Juan Perez',
          afiliado_contacto: '5551234567',
          estatus: 'VALIDA',
          evidencia_url: 'operacion-evidencias/love-isdin/cuenta-1/emp-1/hash-1.jpg',
          evidencia_hash: 'hash-1',
          metadata: {},
          cuenta_cliente: { id: 'cuenta-1', nombre: 'Cuenta Principal' },
          empleado: {
            id: 'emp-1',
            id_nomina: '594',
            nombre_completo: 'Ana',
            puesto: 'DERMOCONSEJERO',
            supervisor_empleado_id: 'sup-1',
            zona: 'Centro',
            estatus_laboral: 'ACTIVO',
          },
          pdv: {
            id: 'pdv-1',
            clave_btl: 'CLAVE-001',
            nombre: 'Farmacia Centro',
            zona: 'Centro',
            cadena_id: 'cadena-1',
          },
        },
        {
          id: 'love-2',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          asistencia_id: null,
          fecha_utc: `${todayIso}T11:00:00.000Z`,
          qr_codigo_id: 'qr-1',
          qr_asignacion_id: 'qra-1',
          qr_personal: 'QR-LOVE-001',
          ticket_folio: 'TK-45812',
          afiliado_nombre: 'Maria Lopez',
          afiliado_contacto: '5559876543',
          estatus: 'PENDIENTE_VALIDACION',
          evidencia_url: null,
          evidencia_hash: null,
          metadata: {},
          cuenta_cliente: { id: 'cuenta-1', nombre: 'Cuenta Principal' },
          empleado: {
            id: 'emp-1',
            id_nomina: '594',
            nombre_completo: 'Ana',
            puesto: 'DERMOCONSEJERO',
            supervisor_empleado_id: 'sup-1',
            zona: 'Centro',
            estatus_laboral: 'ACTIVO',
          },
          pdv: {
            id: 'pdv-1',
            clave_btl: 'CLAVE-001',
            nombre: 'Farmacia Centro',
            zona: 'Centro',
            cadena_id: 'cadena-1',
          },
        },
        {
          id: 'love-3',
          cuenta_cliente_id: 'cuenta-2',
          empleado_id: 'emp-2',
          pdv_id: 'pdv-2',
          asistencia_id: null,
          fecha_utc: '2026-03-01T11:00:00.000Z',
          qr_codigo_id: 'qr-2',
          qr_asignacion_id: 'qra-2',
          qr_personal: 'QR-LOVE-003',
          ticket_folio: 'TK-45813',
          afiliado_nombre: 'Laura Ruiz',
          afiliado_contacto: '5554448888',
          estatus: 'DUPLICADA',
          evidencia_url: null,
          evidencia_hash: null,
          metadata: {},
          cuenta_cliente: { id: 'cuenta-2', nombre: 'Cuenta Secundaria' },
          empleado: {
            id: 'emp-2',
            id_nomina: '800',
            nombre_completo: 'Carlos',
            puesto: 'SUPERVISOR',
            supervisor_empleado_id: null,
            zona: 'Norte',
            estatus_laboral: 'ACTIVO',
          },
          pdv: {
            id: 'pdv-2',
            clave_btl: 'CLAVE-002',
            nombre: 'Farmacia Norte',
            zona: 'Norte',
            cadena_id: 'cadena-2',
          },
        },
      ],
      error: null,
    },
    love_isdin_resumen_diario: {
      data: [
        {
          fecha_operacion: todayIso,
          cuenta_cliente_id: 'cuenta-1',
          pdv_id: 'pdv-1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          zona: 'Centro',
          cadena: 'Cadena Centro',
          qr_codigo_id: 'qr-1',
          afiliaciones_total: 2,
          afiliaciones_validas: 1,
          afiliaciones_pendientes: 1,
          afiliaciones_rechazadas: 0,
          afiliaciones_duplicadas: 0,
        },
        {
          fecha_operacion: '2026-03-01',
          cuenta_cliente_id: 'cuenta-2',
          pdv_id: 'pdv-2',
          empleado_id: 'emp-2',
          supervisor_empleado_id: null,
          zona: 'Norte',
          cadena: 'Cadena Norte',
          qr_codigo_id: 'qr-2',
          afiliaciones_total: 1,
          afiliaciones_validas: 0,
          afiliaciones_pendientes: 0,
          afiliaciones_rechazadas: 0,
          afiliaciones_duplicadas: 1,
        },
      ],
      error: null,
    },
    asistencia: {
      data: [
        {
          id: 'asistencia-1',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          fecha_operacion: todayIso,
          empleado_nombre: 'Ana',
          pdv_clave_btl: 'CLAVE-001',
          pdv_nombre: 'Farmacia Centro',
          check_in_utc: `${todayIso}T15:00:00.000Z`,
          check_out_utc: null,
          cuenta_cliente: { id: 'cuenta-1', nombre: 'Cuenta Principal' },
        },
      ],
      error: null,
    },
    empleado: {
      data: [
        {
          id: 'emp-1',
          id_nomina: '594',
          nombre_completo: 'Ana',
          puesto: 'DERMOCONSEJERO',
          supervisor_empleado_id: 'sup-1',
          zona: 'Centro',
          estatus_laboral: 'ACTIVO',
        },
        {
          id: 'emp-2',
          id_nomina: '800',
          nombre_completo: 'Carlos',
          puesto: 'SUPERVISOR',
          supervisor_empleado_id: null,
          zona: 'Norte',
          estatus_laboral: 'ACTIVO',
        },
        { id: 'sup-1', nombre_completo: 'Supervisora Uno', puesto: 'SUPERVISOR' },
      ],
      error: null,
    },
    pdv: {
      data: [
        { id: 'pdv-1', clave_btl: 'CLAVE-001', nombre: 'Farmacia Centro', zona: 'Centro', cadena_id: 'cadena-1' },
        { id: 'pdv-2', clave_btl: 'CLAVE-002', nombre: 'Farmacia Norte', zona: 'Norte', cadena_id: 'cadena-2' },
      ],
      error: null,
    },
    cadena: {
      data: [
        { id: 'cadena-1', nombre: 'Cadena Centro' },
        { id: 'cadena-2', nombre: 'Cadena Norte' },
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
    love_isdin_qr_codigo: {
      data: [
        { id: 'qr-1', codigo: 'QR-LOVE-001', imagen_url: 'https://example.com/qr-1.png', estado: 'ACTIVO' },
        { id: 'qr-2', codigo: 'QR-LOVE-002', imagen_url: null, estado: 'DISPONIBLE' },
      ],
      error: null,
    },
    love_isdin_qr_asignacion: {
      data: [
        {
          id: 'qra-1',
          cuenta_cliente_id: 'cuenta-1',
          qr_codigo_id: 'qr-1',
          empleado_id: 'emp-1',
          fecha_inicio: `${todayIso}T09:00:00.000Z`,
          fecha_fin: null,
          motivo: 'ALTA_INICIAL',
          observaciones: null,
        },
      ],
      error: null,
    },
    usuario: {
      data: [
        {
          empleado_id: 'emp-1',
          estado_cuenta: 'ACTIVA',
          empleado: {
            id: 'emp-1',
            id_nomina: '594',
            nombre_completo: 'Ana',
            puesto: 'DERMOCONSEJERO',
            supervisor_empleado_id: 'sup-1',
            zona: 'Centro',
            estatus_laboral: 'ACTIVO',
          },
        },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelLoveIsdin(fakeClient as never, { serviceClient: fakeClient as never })

  expect(data.afiliaciones).toHaveLength(3)
  expect(data.resumen).toEqual({
    total: 3,
    validas: 1,
    pendientes: 1,
    rechazadas: 1,
    afiliacionesHoy: 2,
  })
  expect(data.afiliaciones[0]).toMatchObject({
    empleado: 'Ana',
    tieneEvidencia: true,
    afiliacionesHoyEmpleado: 2,
  })
  expect(data.afiliacionesKpi).toEqual({
    hoy: 2,
    semana: 2,
    mes: 3,
    validasMes: 1,
    pendientesMes: 1,
  })
  expect(data.porPdv[0]).toMatchObject({
    label: 'CLAVE-001 - Farmacia Centro',
    total: 2,
  })
  expect(data.timelineSemanal[0]).toMatchObject({
    total: 1,
  })
  expect(data.qrResumen).toMatchObject({
    activos: 1,
    disponibles: 1,
    dcActivasConQr: 1,
  })
  expect(data.jornadasContexto).toHaveLength(1)
  expect(data.cuentas).toHaveLength(2)
  expect(data.empleados).toHaveLength(3)
  expect(data.pdvs).toHaveLength(2)
})

test('degrada con mensaje de infraestructura cuando falla consulta', async () => {
  const fakeClient = createFakeLoveIsdinClient({
    love_isdin: { data: null, error: { message: 'tabla no existe' } },
    asistencia: { data: [], error: null },
    empleado: { data: [], error: null },
    pdv: { data: [], error: null },
    cuenta_cliente: { data: [], error: null },
  })

  const data = await obtenerPanelLoveIsdin(fakeClient as never, { serviceClient: fakeClient as never })

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('tabla `love_isdin`')
})
