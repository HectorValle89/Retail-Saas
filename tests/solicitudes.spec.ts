import { expect, test } from '@playwright/test'
import { obtenerPanelSolicitudes } from '../src/features/solicitudes/services/solicitudService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
  count?: number | null
}

type FakeResults = Record<string, QueryResult>

function createFakeSolicitudesClient(results: FakeResults) {
  return {
    from(table: string) {
      const entry = results[table] ?? { data: null, error: null }
      const state = {
        head: false,
      }

      const chain = {
        select(_columns?: string, options?: { head?: boolean; count?: 'exact' }) {
          state.head = Boolean(options?.head)
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
          if (state.head) {
            return Promise.resolve({
              data: null,
              error: entry.error,
              count: Array.isArray(entry.data) ? entry.data.length : 0,
            })
          }

          return Promise.resolve(entry)
        },
        maybeSingle() {
          return Promise.resolve(entry)
        },
        then(resolve: (value: QueryResult) => void) {
          if (state.head) {
            return Promise.resolve({
              data: null,
              error: entry.error,
              count: Array.isArray(entry.data) ? entry.data.length : 0,
            }).then(resolve)
          }

          return Promise.resolve(entry).then(resolve)
        },
      }

      return chain
    },
  }
}

test('consolida solicitudes operativas, deriva resolucion y expone bandeja accionable', async () => {
  const fakeClient = createFakeSolicitudesClient({
    solicitud: {
      data: [
        {
          id: 'sol-1',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          tipo: 'INCAPACIDAD',
          fecha_inicio: '2026-03-16',
          fecha_fin: '2026-03-18',
          motivo: 'Reposo por incapacidad medica',
          justificante_url: 'operacion-evidencias/solicitudes/file.pdf',
          justificante_hash: 'hash-1',
          estatus: 'VALIDADA_SUP',
          comentarios: 'Pendiente formalizacion RH',
          metadata: {
            approval_path: ['SUPERVISOR', 'NOMINA'],
            justifica_asistencia: true,
            notificaciones: [
              {
                canal: 'IN_APP',
                mensaje: 'Solicitud validada por supervisor y en espera de resolucion final.',
                estado: 'GENERADA',
                destinatario_puesto: 'DERMOCONSEJERO',
                creada_en: '2026-03-16T12:00:00.000Z',
              },
            ],
          },
          cuenta_cliente: { id: 'cuenta-1', nombre: 'Cuenta Principal' },
          empleado: { id: 'emp-1', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          supervisor: { id: 'sup-1', nombre_completo: 'Carlos Sup', puesto: 'SUPERVISOR' },
        },
        {
          id: 'sol-2',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-2',
          supervisor_empleado_id: 'sup-2',
          tipo: 'VACACIONES',
          fecha_inicio: '2026-04-01',
          fecha_fin: '2026-04-05',
          motivo: 'Vacaciones planificadas',
          justificante_url: null,
          justificante_hash: null,
          estatus: 'REGISTRADA',
          comentarios: null,
          metadata: {
            approval_path: ['SUPERVISOR', 'COORDINADOR'],
            justifica_asistencia: true,
            notificaciones: [
              {
                canal: 'IN_APP',
                mensaje: 'Tu solicitud fue aprobada.',
                estado: 'GENERADA',
                destinatario_puesto: 'DERMOCONSEJERO',
                creada_en: '2026-04-02T10:00:00.000Z',
              },
            ],
          },
          cuenta_cliente: { id: 'cuenta-1', nombre: 'Cuenta Principal' },
          empleado: { id: 'emp-2', nombre_completo: 'Brenda Dos', puesto: 'DERMOCONSEJERO' },
          supervisor: { id: 'sup-2', nombre_completo: 'Lucia Coord', puesto: 'COORDINADOR' },
        },
      ],
      error: null,
    },
    cuenta_cliente: {
      data: [{ id: 'cuenta-1', nombre: 'Cuenta Principal', activa: true }],
      error: null,
    },
    empleado: {
      data: [
        { id: 'emp-1', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
        { id: 'emp-2', nombre_completo: 'Brenda Dos', puesto: 'DERMOCONSEJERO' },
        { id: 'sup-1', nombre_completo: 'Carlos Sup', puesto: 'SUPERVISOR' },
        { id: 'sup-2', nombre_completo: 'Lucia Coord', puesto: 'COORDINADOR' },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelSolicitudes(fakeClient as never, {
    serviceClient: fakeClient as never,
    actorPuesto: 'NOMINA',
  })

  expect(data.solicitudes).toHaveLength(2)
  expect(data.resumen).toMatchObject({
    total: 2,
    pendientes: 1,
    aprobadas: 1,
    validadasSupervisor: 1,
    registradasRh: 1,
    rechazadas: 0,
    pendientesAccionables: 1,
  })
  expect(data.pendientesAccionables[0]).toMatchObject({
    tipo: 'INCAPACIDAD',
    estatus: 'VALIDADA_SUP',
    estadoResolucion: 'PENDIENTE',
    siguienteActor: 'NOMINA',
    requiereAccionActor: true,
  })
  expect(data.solicitudes[0]).toMatchObject({
    tipo: 'INCAPACIDAD',
    approvalPath: ['SUPERVISOR', 'NOMINA'],
    justificaAsistencia: true,
  })
  expect(data.solicitudes[0]?.notificaciones[0]).toMatchObject({
    mensaje: 'Solicitud validada por supervisor y en espera de resolucion final.',
  })
  expect(data.solicitudes[1]).toMatchObject({
    tipo: 'VACACIONES',
    estadoResolucion: 'APROBADA',
    diaJustificado: true,
  })
  expect(data.filtros.month).toBeTruthy()
  expect(data.calendario.days.length).toBeGreaterThanOrEqual(35)
})

test('degrada con mensaje de infraestructura cuando falla consulta de solicitudes', async () => {
  const fakeClient = createFakeSolicitudesClient({
    solicitud: { data: null, error: { message: 'tabla no existe' } },
    cuenta_cliente: { data: [], error: null },
    empleado: { data: [], error: null },
  })

  const data = await obtenerPanelSolicitudes(fakeClient as never, { serviceClient: fakeClient as never })

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('La tabla `solicitud` aun no esta disponible')
})

test('expone filtros seleccionados y calendario mensual de ausencias para supervision', async () => {
  const fakeClient = createFakeSolicitudesClient({
    solicitud: {
      data: [
        {
          id: 'sol-10',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-10',
          supervisor_empleado_id: 'sup-1',
          tipo: 'VACACIONES',
          fecha_inicio: '2026-03-10',
          fecha_fin: '2026-03-12',
          motivo: 'Descanso anual',
          justificante_url: null,
          justificante_hash: null,
          estatus: 'REGISTRADA',
          comentarios: null,
          metadata: {
            approval_path: ['SUPERVISOR', 'COORDINADOR'],
            justifica_asistencia: true,
            notificaciones: [],
          },
          cuenta_cliente: { id: 'cuenta-1', nombre: 'Cuenta Principal' },
          empleado: { id: 'emp-10', nombre_completo: 'Carla Tres', puesto: 'DERMOCONSEJERO' },
          supervisor: { id: 'sup-1', nombre_completo: 'Carlos Sup', puesto: 'SUPERVISOR' },
        },
      ],
      error: null,
    },
    cuenta_cliente: {
      data: [{ id: 'cuenta-1', nombre: 'Cuenta Principal', activa: true }],
      error: null,
    },
    empleado: {
      data: [
        { id: 'emp-10', nombre_completo: 'Carla Tres', puesto: 'DERMOCONSEJERO' },
        { id: 'sup-1', nombre_completo: 'Carlos Sup', puesto: 'SUPERVISOR' },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelSolicitudes(fakeClient as never, {
    serviceClient: fakeClient as never,
    actorPuesto: 'SUPERVISOR',
    filters: {
      tipo: 'VACACIONES',
      estatus: 'REGISTRADA',
      empleadoId: 'emp-10',
      fechaInicio: '2026-03-01',
      fechaFin: '2026-03-31',
      month: '2026-03',
    },
  })

  expect(data.filtros).toEqual({
    tipo: 'VACACIONES',
    estatus: 'REGISTRADA',
    empleadoId: 'emp-10',
    fechaInicio: '2026-03-01',
    fechaFin: '2026-03-31',
    month: '2026-03',
  })
  expect(data.calendario.canView).toBe(true)
  expect(data.calendario.month).toBe('2026-03')
  expect(data.calendario.days.find((day) => day.date === '2026-03-10')?.events[0]).toMatchObject({
    empleado: 'Carla Tres',
    tipo: 'VACACIONES',
    estatus: 'REGISTRADA',
  })
})
