import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { obtenerPanelFormaciones } from '../src/features/formaciones/services/formacionService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

type FakeResults = Record<string, QueryResult>

function createFakeFormacionClient(results: FakeResults) {
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
        order() {
          return chain
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
  puesto: 'ADMINISTRADOR',
}

test('consolida eventos y targeting operativo por estado, supervisor y pdv', async () => {
  const fakeClient = createFakeFormacionClient({
    formacion_evento: {
      data: [
        {
          id: 'evento-1',
          cuenta_cliente_id: 'cuenta-1',
          nombre: 'Formacion Sonora',
          descripcion: 'Entrenamiento de temporada',
          sede: 'Hotel Hermosillo',
          ciudad: 'Hermosillo',
          tipo: 'PRODUCTO',
          responsable_empleado_id: 'coord-1',
          responsable: { id: 'coord-1', nombre_completo: 'Laura Coord', puesto: 'COORDINADOR' },
          fecha_inicio: '2026-03-20',
          fecha_fin: '2026-03-20',
          estado: 'PROGRAMADA',
          participantes: [
            { empleado_id: 'dc-1', nombre: 'Ana DC', puesto: 'DERMOCONSEJERO', estado: 'PENDIENTE', notificado: false, confirmado: true },
          ],
          gastos_operativos: [{ tipo: 'Viaticos', monto: 1200, comentario: 'Traslado' }],
          notificaciones: [{ canal: 'EMAIL', mensaje: 'Bienvenida', estado: 'PENDIENTE' }],
          metadata: {
            targeting_mode: 'PDV_SCOPE',
            state_names: ['Sonora'],
            supervisor_ids: ['sup-1'],
            coordinator_ids: ['coord-1'],
            pdv_ids: ['pdv-1', 'pdv-2'],
          },
          created_at: '2026-03-10T12:00:00.000Z',
          updated_at: '2026-03-10T12:00:00.000Z',
        },
      ],
      error: null,
    },
    formacion_asistencia: {
      data: [
        {
          id: 'asis-1',
          evento_id: 'evento-1',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'dc-1',
          participante_nombre: 'Ana DC',
          puesto: 'DERMOCONSEJERO',
          confirmado: true,
          presente: true,
          estado: 'CONFIRMADO',
          evidencias: [],
          comentarios: 'Listo',
        },
      ],
      error: null,
    },
    empleado: {
      data: [
        { id: 'coord-1', nombre_completo: 'Laura Coord', puesto: 'COORDINADOR', zona: 'Noroeste' },
        { id: 'sup-1', nombre_completo: 'Susana Supervisor', puesto: 'SUPERVISOR', zona: 'Noroeste' },
        { id: 'dc-1', nombre_completo: 'Ana DC', puesto: 'DERMOCONSEJERO', zona: 'Noroeste' },
      ],
      error: null,
    },
    pdv: {
      data: [
        {
          id: 'pdv-1',
          clave_btl: 'BTL-SON-001',
          nombre: 'Farmacia Uno',
          zona: 'Noroeste',
          ciudad: { id: 'city-1', nombre: 'Hermosillo', zona: 'Noroeste', estado: 'Sonora' },
          supervisor_pdv: {
            id: 'sp-1',
            activo: true,
            fecha_inicio: '2026-03-01',
            fecha_fin: null,
            empleado: { id: 'sup-1', nombre_completo: 'Susana Supervisor', puesto: 'SUPERVISOR', zona: 'Noroeste' },
          },
        },
        {
          id: 'pdv-2',
          clave_btl: 'BTL-SON-002',
          nombre: 'Farmacia Dos',
          zona: 'Noroeste',
          ciudad: { id: 'city-1', nombre: 'Hermosillo', zona: 'Noroeste', estado: 'Sonora' },
          supervisor_pdv: {
            id: 'sp-1',
            activo: true,
            fecha_inicio: '2026-03-01',
            fecha_fin: null,
            empleado: { id: 'sup-1', nombre_completo: 'Susana Supervisor', puesto: 'SUPERVISOR', zona: 'Noroeste' },
          },
        },
      ],
      error: null,
    },
    cuenta_cliente_pdv: {
      data: [{ pdv_id: 'pdv-1' }, { pdv_id: 'pdv-2' }],
      error: null,
    },
  })

  const data = await obtenerPanelFormaciones(actor, { serviceClient: fakeClient as never })

  expect(data.resumen.totalEventos).toBe(1)
  expect(data.estadosDisponibles).toContain('Sonora')
  expect(data.supervisoresDisponibles[0]).toMatchObject({
    id: 'sup-1',
    nombre: 'Susana Supervisor',
    pdvCount: 2,
  })
  expect(data.coordinadoresDisponibles[0]).toMatchObject({
    id: 'coord-1',
    nombre: 'Laura Coord',
  })
  expect(data.pdvGroups[0]).toMatchObject({
    stateName: 'Sonora',
    totalPdvs: 2,
  })
  expect(data.eventos[0]).toMatchObject({
    selectedStateNames: ['Sonora'],
    selectedSupervisorIds: ['sup-1'],
    selectedCoordinatorIds: ['coord-1'],
    selectedPdvIds: ['pdv-1', 'pdv-2'],
  })
})

test('degrada con mensaje de infraestructura cuando falla consulta', async () => {
  const fakeClient = createFakeFormacionClient({
    formacion_evento: { data: null, error: { message: 'tabla no existe' } },
    formacion_asistencia: { data: [], error: null },
    empleado: { data: [], error: null },
    pdv: { data: [], error: null },
    cuenta_cliente_pdv: { data: [], error: null },
  })

  const data = await obtenerPanelFormaciones(actor, { serviceClient: fakeClient as never })

  expect(data.infraestructuraLista).toBe(false)
  expect(data.mensajeInfraestructura).toContain('tabla no existe')
})
