import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { obtenerPanelMensajes } from '../src/features/mensajes/services/mensajeService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

type FakeResults = Record<string, QueryResult>

function createFakeMensajesClient(results: FakeResults) {
  return {
    from(table: string) {
      const entry = results[table] ?? { data: null, error: null }

      const chain = {
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
        range() {
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

const actor: ActorActual = {
  authUserId: 'auth-1',
  usuarioId: 'user-1',
  empleadoId: 'emp-1',
  cuentaClienteId: 'cuenta-1',
  username: 'usuario',
  correoElectronico: 'usuario@example.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Usuario Principal',
  puesto: 'DERMOCONSEJERO',
}

test('consolida mensajes, adjuntos y estados enviados/recibidos', async () => {
  const fakeClient = createFakeMensajesClient({
    mensaje_interno: {
      data: [
        {
          id: 'msg-1',
          cuenta_cliente_id: 'cuenta-1',
          creado_por_usuario_id: 'user-9',
          titulo: 'Corte nocturno',
          cuerpo: 'Enviar reporte antes de las 18:00.',
          tipo: 'MENSAJE',
          grupo_destino: 'TODOS_DCS',
          zona: null,
          supervisor_empleado_id: null,
          opciones_respuesta: [],
          metadata: {},
          created_at: '2026-03-16T18:00:00.000Z',
          updated_at: '2026-03-16T18:00:00.000Z',
        },
        {
          id: 'msg-2',
          cuenta_cliente_id: 'cuenta-1',
          creado_por_usuario_id: 'user-1',
          titulo: 'Encuesta de ruta',
          cuerpo: 'Como calificas la visita?',
          tipo: 'ENCUESTA',
          grupo_destino: 'ZONA',
          zona: 'Centro',
          supervisor_empleado_id: null,
          opciones_respuesta: [{ id: 'opt-1', label: 'Alta' }, { id: 'opt-2', label: 'Media' }],
          metadata: {},
          created_at: '2026-03-16T17:00:00.000Z',
          updated_at: '2026-03-16T17:00:00.000Z',
        },
      ],
      error: null,
    },
    mensaje_receptor: {
      data: [
        {
          id: 'rec-1',
          mensaje_id: 'msg-1',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          leido_en: null,
          respondido_en: null,
          respuesta: null,
          estado: 'PENDIENTE',
          metadata: {},
          created_at: '2026-03-16T18:00:00.000Z',
          updated_at: '2026-03-16T18:00:00.000Z',
        },
        {
          id: 'rec-2',
          mensaje_id: 'msg-2',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          leido_en: '2026-03-16T17:05:00.000Z',
          respondido_en: null,
          respuesta: null,
          estado: 'LEIDO',
          metadata: {},
          created_at: '2026-03-16T17:00:00.000Z',
          updated_at: '2026-03-16T17:05:00.000Z',
        },
      ],
      error: null,
    },
    mensaje_adjunto: {
      data: [
        {
          id: 'adj-1',
          mensaje_id: 'msg-1',
          nombre_archivo_original: 'brief.pdf',
          mime_type: 'application/pdf',
          tamano_bytes: 91234,
          metadata: {
            archivo_url: 'operacion-evidencias/mensajes/cu-1/msg-1/brief.pdf',
            archivo_hash: 'hash-1',
            miniatura_url: null,
            miniatura_hash: null,
          },
          created_at: '2026-03-16T18:00:00.000Z',
        },
      ],
      error: null,
    },
    usuario: {
      data: [
        { id: 'user-9', empleado_id: 'sup-1' },
        { id: 'user-1', empleado_id: 'emp-1' },
      ],
      error: null,
    },
    empleado: {
      data: [
        { id: 'emp-1', nombre_completo: 'Ana', puesto: 'DERMOCONSEJERO', zona: 'Centro', supervisor_empleado_id: 'sup-1' },
        { id: 'sup-1', nombre_completo: 'Laura', puesto: 'SUPERVISOR', zona: 'Centro', supervisor_empleado_id: null },
      ],
      error: null,
    },
  })

  const data = await obtenerPanelMensajes(actor, { serviceClient: fakeClient as never })

  expect(data.mensajes).toHaveLength(2)
  expect(data.resumen.totalMensajes).toBe(2)
  expect(data.resumen.noLeidos).toBe(1)
  expect(data.resumen.encuestasPendientes).toBe(1)
  expect(data.resumen.enviados).toBe(1)
  expect(data.resumen.recibidos).toBe(2)
  expect(data.unreadCount).toBe(1)
  expect(data.mensajes[0]?.adjuntos).toHaveLength(1)
  expect(data.mensajes[0]?.adjuntos[0]?.archivoHash).toBe('hash-1')
  expect(data.mensajes[0]?.creadoPor).toBe('Laura')
  expect(data.mensajes[1]?.enviadoPorMi).toBe(true)
  expect(data.mensajes[1]?.recibidoPorMi).toBe(true)
  expect(data.mensajes[1]?.opcionesRespuesta).toHaveLength(2)
})

test('filtra historial de mensajes recibidos del actor autenticado', async () => {
  const fakeClient = createFakeMensajesClient({
    mensaje_interno: {
      data: [
        {
          id: 'msg-1',
          creado_por_usuario_id: 'user-9',
          titulo: 'Recibido',
          cuerpo: 'Solo lectura',
          tipo: 'MENSAJE',
          grupo_destino: 'TODOS_DCS',
          zona: null,
          supervisor_empleado_id: null,
          opciones_respuesta: [],
          created_at: '2026-03-16T18:00:00.000Z',
          updated_at: '2026-03-16T18:00:00.000Z',
        },
      ],
      error: null,
    },
    mensaje_receptor: {
      data: [
        {
          id: 'rec-1',
          mensaje_id: 'msg-1',
          empleado_id: 'emp-1',
          leido_en: null,
          respondido_en: null,
          respuesta: null,
          estado: 'PENDIENTE',
        },
      ],
      error: null,
    },
    usuario: {
      data: [{ id: 'user-9', empleado_id: 'sup-1' }],
      error: null,
    },
    mensaje_adjunto: { data: [], error: null },
    empleado: {
      data: [{ id: 'sup-1', nombre_completo: 'Laura', puesto: 'SUPERVISOR', zona: 'Centro', supervisor_empleado_id: null }],
      error: null,
    },
  })

  const data = await obtenerPanelMensajes(actor, {
    serviceClient: fakeClient as never,
    direction: 'recibidos',
  })

  expect(data.direction).toBe('recibidos')
  expect(data.mensajes).toHaveLength(1)
  expect(data.mensajes[0]?.enviadoPorMi).toBe(false)
  expect(data.mensajes[0]?.recibidoPorMi).toBe(true)
})

test('resuelve audience label para mensajes dirigidos por rol operativo', async () => {
  const fakeClient = createFakeMensajesClient({
    mensaje_interno: {
      data: [
        {
          id: 'msg-rol-1',
          creado_por_usuario_id: 'user-9',
          titulo: 'Pendiente de alta IMSS',
          cuerpo: 'Revisar expediente antes de las 14:00.',
          tipo: 'MENSAJE',
          grupo_destino: 'PUESTO',
          zona: null,
          supervisor_empleado_id: null,
          opciones_respuesta: [],
          metadata: { puesto_destino: 'RECLUTAMIENTO' },
          created_at: '2026-03-16T19:00:00.000Z',
          updated_at: '2026-03-16T19:00:00.000Z',
        },
      ],
      error: null,
    },
    mensaje_receptor: {
      data: [
        {
          id: 'rec-rol-1',
          mensaje_id: 'msg-rol-1',
          empleado_id: 'emp-1',
          leido_en: null,
          respondido_en: null,
          respuesta: null,
          estado: 'PENDIENTE',
        },
      ],
      error: null,
    },
    usuario: {
      data: [{ id: 'user-9', empleado_id: 'sup-1' }],
      error: null,
    },
    mensaje_adjunto: { data: [], error: null },
    empleado: {
      data: [
        { id: 'emp-1', nombre_completo: 'Ana', puesto: 'RECLUTAMIENTO', zona: 'Centro', supervisor_empleado_id: null },
        { id: 'sup-1', nombre_completo: 'Laura', puesto: 'SUPERVISOR', zona: 'Centro', supervisor_empleado_id: null },
      ],
      error: null,
    },
  })

  const recruitmentActor: ActorActual = {
    ...actor,
    puesto: 'RECLUTAMIENTO',
  }

  const data = await obtenerPanelMensajes(recruitmentActor, { serviceClient: fakeClient as never })

  expect(data.mensajes).toHaveLength(1)
  expect(data.mensajes[0]?.audienceLabel).toBe('Rol RECLUTAMIENTO')
  expect(data.mensajes[0]?.creadoPor).toBe('Laura')
})

test('degrada con mensaje de infraestructura cuando falla consulta', async () => {
  const fakeClient = createFakeMensajesClient({
    mensaje_interno: { data: null, error: { message: 'tabla no existe' } },
    mensaje_receptor: { data: [], error: null },
    empleado: { data: [], error: null },
  })

  const data = await obtenerPanelMensajes(actor, { serviceClient: fakeClient as never })

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('tabla no existe')
})