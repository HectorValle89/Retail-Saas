import { expect, test } from '@playwright/test'
import type { ActorActual } from '../src/lib/auth/session'
import { obtenerPanelAsistencias } from '../src/features/asistencias/services/asistenciaService'
import { obtenerPanelVentas } from '../src/features/ventas/services/ventaService'
import { obtenerPanelReportes } from '../src/features/reportes/services/reporteService'
import { obtenerPanelNomina } from '../src/features/nomina/services/nominaService'
import { obtenerPanelAsignaciones } from '../src/features/asignaciones/services/asignacionService'
import { obtenerPanelSolicitudes } from '../src/features/solicitudes/services/solicitudService'

type QueryResult = {
  data: unknown[] | Record<string, unknown> | null
  error: { message: string } | null
}

function createFakeClient(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      const entry = results[table] ?? { data: [], error: null }

      let headRequested = false
      let countRequested = false

      const buildPayload = () => {
        const count = Array.isArray(entry.data) ? entry.data.length : 0
        if (headRequested) {
          return {
            data: null,
            error: entry.error,
            count,
          }
        }

        return countRequested
          ? {
              ...entry,
              count,
            }
          : entry
      }

      const chain = {
        select(
          _columns?: string,
          options?: {
            count?: 'exact' | 'planned' | 'estimated'
            head?: boolean
          }
        ) {
          headRequested = options?.head === true
          countRequested = Boolean(options?.count)
          return chain
        },
        eq() {
          return chain
        },
        neq() {
          return chain
        },
        in() {
          return chain
        },
        not() {
          return chain
        },
        gte() {
          return chain
        },
        lte() {
          return chain
        },
        lt() {
          return chain
        },
        or() {
          return chain
        },
        order() {
          return chain
        },
        range() {
          return Promise.resolve(buildPayload())
        },
        limit() {
          return Promise.resolve(buildPayload())
        },
        maybeSingle() {
          return Promise.resolve(buildPayload())
        },
        then(resolve: (value: QueryResult & { count?: number | null } | { data: null; error: { message: string } | null; count: number }) => void) {
          return Promise.resolve(buildPayload()).then(resolve)
        },
      }

      return chain
    },
  }
}

const adminActor: ActorActual = {
  authUserId: 'auth-admin',
  usuarioId: 'user-admin',
  empleadoId: 'emp-admin',
  cuentaClienteId: null,
  username: 'admin',
  correoElectronico: 'admin@example.com',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Admin Principal',
  puesto: 'ADMINISTRADOR',
}

test('cubre el flujo check-in -> jornada -> ventas -> check-out en paneles operativos y cierre de nomina', async () => {
  const client = createFakeClient({
    asistencia: {
      data: [
        {
          id: 'asis-1',
          cuenta_cliente_id: 'c1',
          asignacion_id: 'asg-1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          pdv_id: 'pdv-1',
          mision_dia_id: 'mision-1',
          fecha_operacion: '2026-03-10',
          empleado_nombre: 'Ana Uno',
          pdv_clave_btl: 'LIV-001',
          pdv_nombre: 'Liverpool Norte',
          pdv_zona: 'Norte',
          cadena_nombre: 'Liverpool',
          check_in_utc: '2026-03-10T10:00:00.000Z',
          check_out_utc: '2026-03-10T18:00:00.000Z',
          distancia_check_in_metros: 24,
          estado_gps: 'EN_RANGO',
          justificacion_fuera_geocerca: null,
          mision_codigo: 'MISION-001',
          mision_instruccion: 'Activar visibilidad solar',
          biometria_estado: 'VALIDADA',
          estatus: 'CERRADA',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          pdv: { zona: 'Norte', nombre: 'Liverpool Norte', clave_btl: 'LIV-001' },
        },
      ],
      error: null,
    },
    geocerca_pdv: {
      data: [
        {
          pdv_id: 'pdv-1',
          latitud: 19.4326,
          longitud: -99.1332,
          radio_tolerancia_metros: 100,
          permite_checkin_con_justificacion: true,
        },
      ],
      error: null,
    },
    venta: {
      data: [
        {
          id: 'venta-1',
          cuenta_cliente_id: 'c1',
          asistencia_id: 'asis-1',
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          producto_id: 'prod-1',
          producto_sku: 'SKU-001',
          producto_nombre: 'Fusion Water',
          producto_nombre_corto: 'Fusion',
          fecha_utc: '2026-03-10T15:00:00.000Z',
          total_unidades: 4,
          total_monto: 1800,
          confirmada: true,
          observaciones: 'Cierre jornada completo',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          asistencia: { estatus: 'CERRADA', check_out_utc: '2026-03-10T18:00:00.000Z' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          pdv: { zona: 'Norte', nombre: 'Liverpool Norte', clave_btl: 'LIV-001' },
        },
      ],
      error: null,
    },
    nomina_periodo: {
      data: [
        {
          id: 'periodo-1',
          clave: '2026-03-Q1',
          fecha_inicio: '2026-03-01',
          fecha_fin: '2026-03-15',
          estado: 'ABIERTO',
          fecha_cierre: null,
          observaciones: null,
        },
      ],
      error: null,
    },
    cuota_empleado_periodo: {
      data: [
        {
          id: 'cuota-1',
          periodo_id: 'periodo-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          cadena_id: 'cadena-1',
          objetivo_monto: 1500,
          objetivo_unidades: 3,
          avance_monto: 1800,
          avance_unidades: 4,
          factor_cuota: 1,
          cumplimiento_porcentaje: 120,
          bono_estimado: 200,
          estado: 'CUMPLIDA',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          periodo: { clave: '2026-03-Q1', estado: 'ABIERTO' },
        },
      ],
      error: null,
    },
    nomina_ledger: {
      data: [
        {
          id: 'ledger-1',
          periodo_id: 'periodo-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          tipo_movimiento: 'PERCEPCION',
          concepto: 'BONO_VENTA',
          referencia_tabla: 'venta',
          referencia_id: 'venta-1',
          monto: 1000,
          moneda: 'MXN',
          notas: 'Bono comercial',
          created_at: '2026-03-10T20:00:00.000Z',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          empleado: { id_nomina: 'DC-001', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          periodo: { clave: '2026-03-Q1', estado: 'ABIERTO' },
        },
      ],
      error: null,
    },
    gasto: { data: [], error: null },
    love_isdin: { data: [], error: null },
    audit_log: {
      data: [
        {
          id: 1,
          tabla: 'venta',
          registro_id: 'venta-1',
          accion: 'EVENTO',
          payload: { evento: 'venta_confirmada', resumen: 'Venta confirmada al cierre' },
          created_at: '2026-03-10T20:05:00.000Z',
          cuenta_cliente: { nombre: 'ISDIN Mexico', identificador: 'isdin_mexico' },
          usuario: { username: 'admin' },
        },
      ],
      error: null,
    },
  })

  const [asistencias, ventas, reportes, nomina] = await Promise.all([
    obtenerPanelAsistencias(client as never),
    obtenerPanelVentas(client as never),
    obtenerPanelReportes(client as never, {
      period: '2026-03',
      page: 1,
      pageSize: 25,
    }),
    obtenerPanelNomina(client as never),
  ])

  expect(asistencias.resumen).toMatchObject({
    total: 1,
    abiertas: 0,
    cerradas: 1,
    pendientesValidacion: 0,
  })
  expect(asistencias.asistencias[0]).toMatchObject({
    empleado: 'Ana Uno',
    pdvClaveBtl: 'LIV-001',
    estatus: 'CERRADA',
    estadoGps: 'EN_RANGO',
  })

  expect(ventas.resumen).toMatchObject({
    total: 1,
    confirmadas: 1,
    pendientesConfirmacion: 0,
    unidades: 4,
    monto: 1800,
  })
  expect(ventas.ventas[0]).toMatchObject({
    producto: 'Fusion Water',
    jornadaEstatus: 'CERRADA',
    jornadaAbierta: false,
  })

  expect(reportes.asistencias[0]).toMatchObject({
    empleado: 'Ana Uno',
    pdv: 'LIV-001',
    jornadasCerradas: 1,
  })
  expect(reportes.ventas[0]).toMatchObject({
    dc: 'Ana Uno',
    producto: 'Fusion Water',
    ventasConfirmadas: 1,
    montoConfirmado: 1800,
  })

  expect(nomina.preNomina[0]).toMatchObject({
    empleado: 'Ana Uno',
    jornadasValidadas: 1,
    ventasConfirmadas: 1,
    montoConfirmado: 1800,
    bonoEstimado: 200,
    percepciones: 1380,
    netoEstimado: 1210.95,
  })
  expect(nomina.resumen).toMatchObject({
    colaboradores: 1,
    percepciones: 1380,
    netoEstimado: 1210.95,
    cuotasCumplidas: 1,
  })
})

test('cubre el flujo de Assignment Validation Service con errores y alertas en asignaciones publicadas', async () => {
  const client = createFakeClient({
    asignacion: {
      data: [
        {
          id: 'asg-1',
          cuenta_cliente_id: null,
          empleado_id: 'emp-1',
          pdv_id: 'pdv-1',
          supervisor_empleado_id: null,
          tipo: 'FIJA',
          factor_tiempo: 1,
          dias_laborales: 'LUN,MAR,MIE,JUE,VIE',
          dia_descanso: 'DOM',
          horario_referencia: null,
          fecha_inicio: '2026-03-16',
          fecha_fin: '2026-03-31',
          observaciones: 'Asignacion publicada con validaciones pendientes',
          naturaleza: 'BASE',
          retorna_a_base: false,
          prioridad: 1,
          motivo_movimiento: null,
          generado_automaticamente: false,
          estado_publicacion: 'PUBLICADA',
          created_at: '2026-03-15T10:00:00.000Z',
          cuenta_cliente: null,
          empleado: {
            id: 'emp-1',
            nombre_completo: 'Ana Uno',
            puesto: 'DERMOCONSEJERO',
            estatus_laboral: 'ACTIVO',
            telefono: null,
            correo_electronico: null,
            supervisor_empleado_id: 'sup-2',
            zona: 'Norte',
          },
          pdv: {
            id: 'pdv-1',
            clave_btl: 'LIV-001',
            nombre: 'Liverpool Norte',
            zona: 'Norte',
            estatus: 'ACTIVO',
            horario_entrada: '11:00:00',
            horario_salida: '19:00:00',
            cadena: { codigo: 'SAN_PABLO', nombre: 'San Pablo', factor_cuota_default: 1 },
            geocerca_pdv: { latitud: 19.4, longitud: -99.1, radio_tolerancia_metros: 400 },
          },
        },
      ],
      error: null,
    },
    empleado: {
      data: [
        {
          id: 'emp-1',
          nombre_completo: 'Ana Uno',
          puesto: 'DERMOCONSEJERO',
          estatus_laboral: 'ACTIVO',
          telefono: null,
          correo_electronico: null,
          supervisor_empleado_id: 'sup-2',
          zona: 'Norte',
        },
      ],
      error: null,
    },
    pdv: {
      data: [
        {
          id: 'pdv-1',
          clave_btl: 'LIV-001',
          nombre: 'Liverpool Norte',
          zona: 'Norte',
          estatus: 'ACTIVO',
          horario_entrada: '11:00:00',
          horario_salida: '19:00:00',
          cadena: { codigo: 'SAN_PABLO', nombre: 'San Pablo', factor_cuota_default: 1 },
          geocerca_pdv: {
            latitud: 19.4,
            longitud: -99.1,
            radio_tolerancia_metros: 400,
          },
        },
      ],
      error: null,
    },
    supervisor_pdv: {
      data: [
        {
          pdv_id: 'pdv-1',
          activo: false,
          fecha_fin: '2026-03-10',
          empleado_id: 'sup-1',
        },
      ],
      error: null,
    },
    cuenta_cliente_pdv: {
      data: [
        {
          pdv_id: 'pdv-1',
          cuenta_cliente_id: 'c1',
          activo: true,
          fecha_fin: null,
        },
      ],
      error: null,
    },
    configuracion: {
      data: {
        valor: [
          {
            nomenclatura: 'A',
            turno: 'Apertura',
            horario: '11:00-19:00',
          },
        ],
      },
      error: null,
    },
    horario_pdv: {
      data: [],
      error: null,
    },
  })

  const data = await obtenerPanelAsignaciones(client as never, adminActor, {
    assignmentState: 'PUBLICADA',
  })

  expect(data.infraestructuraLista).toBe(true)
  expect(data.activeView).toBe('asignaciones')
  expect(data.assignmentsView?.estado).toBe('PUBLICADA')
  expect(data.assignmentsView?.items[0]).toMatchObject({
    cuentaClienteId: null,
    bloqueada: true,
  })
  expect(data.assignmentsView?.items[0]?.issues.map((item) => item.label)).toEqual(
    expect.arrayContaining([
      'Sin cuenta cliente',
      'PDV sin supervisor activo',
      'DC sin contacto',
      'Geocerca fuera de rango',
      'PDV sin horarios San Pablo',
    ])
  )
})

test('cubre el flujo de incapacidad con supervision, reclutamiento y formalizacion de nomina', async () => {
  const client = createFakeClient({
    solicitud: {
      data: [
        {
          id: 'sol-1',
          cuenta_cliente_id: 'c1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          tipo: 'INCAPACIDAD',
          fecha_inicio: '2026-03-16',
          fecha_fin: '2026-03-18',
          motivo: 'Incapacidad medica por tres dias',
          justificante_url: 'operacion-evidencias/solicitudes/hash.pdf',
          justificante_hash: 'hash-1',
          estatus: 'REGISTRADA_RH',
          comentarios: 'Formalizada por nomina',
          metadata: {
            approval_path: ['SUPERVISOR', 'RECLUTAMIENTO', 'NOMINA'],
            validada_supervisor_en: '2026-03-16T12:00:00.000Z',
            registrada_rh_en: '2026-03-16T18:00:00.000Z',
            justifica_asistencia: true,
          },
          cuenta_cliente: { id: 'c1', nombre: 'ISDIN Mexico' },
          empleado: { id: 'emp-1', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
          supervisor: { id: 'sup-1', nombre_completo: 'Carlos Supervisor', puesto: 'SUPERVISOR' },
        },
      ],
      error: null,
    },
    cuenta_cliente: {
      data: [{ id: 'c1', nombre: 'ISDIN Mexico', activa: true }],
      error: null,
    },
    empleado: {
      data: [
        { id: 'emp-1', nombre_completo: 'Ana Uno', puesto: 'DERMOCONSEJERO' },
        { id: 'sup-1', nombre_completo: 'Carlos Supervisor', puesto: 'SUPERVISOR' },
        { id: 'nom-1', nombre_completo: 'Laura Nomina', puesto: 'NOMINA' },
      ],
      error: null,
    },
  })

  const solicitudes = await obtenerPanelSolicitudes(client as never, {
    serviceClient: client as never,
  })

  expect(solicitudes.resumen).toMatchObject({
    total: 1,
    pendientes: 0,
    validadasSupervisor: 0,
    registradasRh: 1,
    rechazadas: 0,
  })
  expect(solicitudes.solicitudes[0]).toMatchObject({
    tipo: 'INCAPACIDAD',
    estatus: 'REGISTRADA_RH',
    approvalPath: ['SUPERVISOR', 'RECLUTAMIENTO', 'NOMINA'],
    justificaAsistencia: true,
  })
})
