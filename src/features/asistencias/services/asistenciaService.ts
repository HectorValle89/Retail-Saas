import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asistencia, Asignacion, ConfiguracionSistema, CuentaCliente, Empleado, MisionDia, Solicitud, Venta } from '@/types/database'
import { deriveAttendanceDiscipline, type AttendanceDisciplineAssignment, type AttendanceDisciplineFormation, type AttendanceDisciplineRecord } from '@/features/asistencias/lib/attendanceDiscipline'
import type { AttendanceMissionCatalogItem } from '@/features/asistencias/lib/attendanceMission'
import { formacionTargetsEmployee } from '@/features/formaciones/lib/formacionTargeting'

type MaybeMany<T> = T | T[] | null

type CuentaClienteRelacion = Pick<CuentaCliente, 'nombre'>

type SolicitudAsistenciaRow = Pick<
  Solicitud,
  'id' | 'empleado_id' | 'tipo' | 'fecha_inicio' | 'fecha_fin' | 'estatus' | 'metadata'
>

type FormacionJustificacionRow = {
  id: string
  nombre: string
  tipo: string | null
  fecha_inicio: string
  fecha_fin: string
  estado: string
  participantes: Array<Record<string, unknown>> | null
  metadata: Record<string, unknown> | null
}

type VentaAsistenciaRow = Pick<Venta, 'asistencia_id' | 'confirmada'>

type MissionCatalogRow = Pick<MisionDia, 'id' | 'codigo' | 'instruccion' | 'orden' | 'peso'>

type RecentMissionRow = Pick<
  Asistencia,
  'empleado_id' | 'pdv_id' | 'mision_dia_id' | 'mision_codigo' | 'fecha_operacion' | 'created_at'
>

interface AsistenciaQueryRow
  extends Pick<
    Asistencia,
    | 'id'
    | 'cuenta_cliente_id'
    | 'asignacion_id'
    | 'empleado_id'
    | 'supervisor_empleado_id'
    | 'pdv_id'
    | 'mision_dia_id'
    | 'fecha_operacion'
    | 'empleado_nombre'
    | 'pdv_clave_btl'
    | 'pdv_nombre'
    | 'pdv_zona'
    | 'cadena_nombre'
    | 'check_in_utc'
    | 'check_out_utc'
    | 'distancia_check_in_metros'
    | 'estado_gps'
    | 'justificacion_fuera_geocerca'
    | 'mision_codigo'
    | 'mision_instruccion'
    | 'biometria_estado'
    | 'estatus'
  > {
  cuenta_cliente: MaybeMany<CuentaClienteRelacion>
}

interface GeocercaContextRow {
  pdv_id: string
  latitud: number
  longitud: number
  radio_tolerancia_metros: number
  permite_checkin_con_justificacion: boolean
}

type AsignacionDisciplinaRow = Pick<
  Asignacion,
  | 'id'
  | 'empleado_id'
  | 'cuenta_cliente_id'
  | 'supervisor_empleado_id'
  | 'pdv_id'
  | 'fecha_inicio'
  | 'fecha_fin'
  | 'tipo'
  | 'dias_laborales'
  | 'dia_descanso'
  | 'horario_referencia'
  | 'naturaleza'
  | 'prioridad'
  | 'estado_publicacion'
>

type ConfiguracionAsistenciaRow = Pick<ConfiguracionSistema, 'clave' | 'valor'>

type EmpleadoSalaryRow = Pick<Empleado, 'id' | 'sueldo_base_mensual'>

export interface AsistenciaDisciplinaResumen {
  retardos: number
  faltas: number
  ausenciasJustificadas: number
  pendientesValidacion: number
  faltasAdministrativas: number
}

export interface AsistenciaDisciplinaItem {
  assignmentId: string
  empleadoId: string
  cuentaClienteId: string | null
  supervisorEmpleadoId: string | null
  empleado: string
  cuentaCliente: string | null
  fecha: string
  estado: AttendanceDisciplineRecord['estado']
  minutosRetardo: number | null
  horarioEsperado: string | null
}
export interface AsistenciaResumen {
  total: number
  abiertas: number
  pendientesValidacion: number
  fueraGeocerca: number
  cerradas: number
  justificadas: number
}

export interface AsistenciaListadoItem {
  id: string
  cuentaClienteId: string
  asignacionId: string | null
  empleadoId: string
  supervisorEmpleadoId: string | null
  pdvId: string
  misionDiaId: string | null
  fechaOperacion: string
  cuentaCliente: string | null
  empleado: string
  pdvClaveBtl: string
  pdvNombre: string
  zona: string | null
  cadena: string | null
  checkInUtc: string | null
  checkOutUtc: string | null
  distanciaCheckInMetros: number | null
  estadoGps: string
  biometriaEstado: string
  estatus: string
  misionCodigo: string | null
  misionInstruccion: string | null
  justificacionFueraGeocerca: string | null
  geocercaLatitud: number | null
  geocercaLongitud: number | null
  geocercaRadioMetros: number | null
  permiteCheckinConJustificacion: boolean
  solicitudRelacionadaId: string | null
  solicitudRelacionadaTipo: string | null
  solicitudRelacionadaEstatus: string | null
  diaJustificado: boolean
  detalleJustificacion: string | null
  ventasConfirmadas: number
  ventasPendientesConfirmacion: number
  ultimaMisionDiaId: string | null
  ultimaMisionCodigo: string | null
}

export interface AsistenciasPanelData {
  resumen: AsistenciaResumen
  disciplinaResumen: AsistenciaDisciplinaResumen
  incidenciasDisciplina: AsistenciaDisciplinaItem[]
  asistencias: AsistenciaListadoItem[]
  misionesCatalogo: AttendanceMissionCatalogItem[]
  paginacion: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

interface ObtenerAsistenciasOptions {
  page?: number
  pageSize?: number
}

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function isApprovedSolicitud(estatus: Solicitud['estatus']) {
  return estatus === 'REGISTRADA_RH' || estatus === 'REGISTRADA'
}

function isSameOrWithinRange(date: string, start: string, end: string) {
  return date >= start && date <= end
}

function normalizePage(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 1
  }

  return Math.max(1, Math.floor(value))
}

function normalizePageSize(value?: number) {
  if (!value || Number.isNaN(value)) {
    return 50
  }

  return Math.min(50, Math.max(10, Math.floor(value)))
}

function buildEmptyDisciplinaResumen(): AsistenciaDisciplinaResumen {
  return {
    retardos: 0,
    faltas: 0,
    ausenciasJustificadas: 0,
    pendientesValidacion: 0,
    faltasAdministrativas: 0,
  }
}

function resolveNumericConfigValue(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const payload = value as Record<string, unknown>
    const parsed = Number(payload.value ?? payload.numero ?? payload.defaultValue)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

export async function obtenerPanelAsistencias(
  supabase: SupabaseClient,
  options?: ObtenerAsistenciasOptions
): Promise<AsistenciasPanelData> {
  const page = normalizePage(options?.page)
  const pageSize = normalizePageSize(options?.pageSize)

  const { count, error: countError } = await supabase
    .from('asistencia')
    .select('id', { count: 'exact', head: true })

  if (countError) {
    return {
      resumen: {
        total: 0,
        abiertas: 0,
        pendientesValidacion: 0,
        fueraGeocerca: 0,
        cerradas: 0,
        justificadas: 0,
      },
      disciplinaResumen: buildEmptyDisciplinaResumen(),
      incidenciasDisciplina: [],
      asistencias: [],
      misionesCatalogo: [],
      paginacion: {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 1,
      },
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `asistencia` aun no esta disponible en Supabase. Ejecuta la migracion de ejecucion diaria.',
    }
  }

  const totalItems = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(page, totalPages)
  const from = (safePage - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error } = await supabase
    .from('asistencia')
    .select(`
      id,
      cuenta_cliente_id,
      asignacion_id,
      empleado_id,
      supervisor_empleado_id,
      pdv_id,
      mision_dia_id,
      fecha_operacion,
      empleado_nombre,
      pdv_clave_btl,
      pdv_nombre,
      pdv_zona,
      cadena_nombre,
      check_in_utc,
      check_out_utc,
      distancia_check_in_metros,
      estado_gps,
      justificacion_fuera_geocerca,
      mision_codigo,
      mision_instruccion,
      biometria_estado,
      estatus,
      cuenta_cliente:cuenta_cliente_id(nombre)
    `)
    .order('fecha_operacion', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    return {
      resumen: {
        total: 0,
        abiertas: 0,
        pendientesValidacion: 0,
        fueraGeocerca: 0,
        cerradas: 0,
        justificadas: 0,
      },
      disciplinaResumen: buildEmptyDisciplinaResumen(),
      incidenciasDisciplina: [],
      asistencias: [],
      misionesCatalogo: [],
      paginacion: {
        page: safePage,
        pageSize,
        totalItems,
        totalPages,
      },
      infraestructuraLista: false,
      mensajeInfraestructura:
        'La tabla `asistencia` aun no esta disponible en Supabase. Ejecuta la migracion de ejecucion diaria.',
    }
  }

  const asistenciasBase = (data ?? []) as unknown as AsistenciaQueryRow[]
  const pdvIds = Array.from(new Set(asistenciasBase.map((item) => item.pdv_id)))
  const empleadoIds = Array.from(new Set(asistenciasBase.map((item) => item.empleado_id)))
  const fechas = asistenciasBase.map((item) => item.fecha_operacion)
  const fechaMin =
    fechas.length > 0
      ? fechas.reduce((minimo, actual) => (actual < minimo ? actual : minimo), fechas[0])
      : null
  const fechaMax =
    fechas.length > 0
      ? fechas.reduce((maximo, actual) => (actual > maximo ? actual : maximo), fechas[0])
      : null

  const geocercasResult =
    pdvIds.length > 0
      ? await supabase
          .from('geocerca_pdv')
          .select(
            'pdv_id, latitud, longitud, radio_tolerancia_metros, permite_checkin_con_justificacion'
          )
          .in('pdv_id', pdvIds)
      : { data: [] as GeocercaContextRow[], error: null }

  const solicitudesResult =
    empleadoIds.length > 0 && fechaMin && fechaMax
      ? await supabase
          .from('solicitud')
          .select('id, empleado_id, tipo, fecha_inicio, fecha_fin, estatus, metadata')
          .in('empleado_id', empleadoIds)
          .lte('fecha_inicio', fechaMax)
          .gte('fecha_fin', fechaMin)
      : { data: [] as SolicitudAsistenciaRow[], error: null }

  const formacionesResult =
    empleadoIds.length > 0 && fechaMin && fechaMax
      ? await supabase
          .from('formacion_evento')
          .select('id, nombre, tipo, fecha_inicio, fecha_fin, estado, participantes, metadata')
          .lte('fecha_inicio', fechaMax)
          .gte('fecha_fin', fechaMin)
      : { data: [] as FormacionJustificacionRow[], error: null }

  const ventaRowsResult =
    asistenciasBase.length > 0
      ? await supabase
          .from('venta')
          .select('asistencia_id, confirmada')
          .in(
            'asistencia_id',
            asistenciasBase.map((item) => item.id)
          )
      : { data: [] as VentaAsistenciaRow[], error: null }

  const assignmentsResult =
    empleadoIds.length > 0 && fechaMin && fechaMax
      ? await supabase
          .from('asignacion')
          .select(
            'id, empleado_id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, tipo, dias_laborales, dia_descanso, horario_referencia, naturaleza, prioridad, estado_publicacion'
          )
          .in('empleado_id', empleadoIds)
          .eq('estado_publicacion', 'PUBLICADA')
          .lte('fecha_inicio', fechaMax)
          .or(`fecha_fin.gte.${fechaMin},fecha_fin.is.null`)
      : { data: [] as AsignacionDisciplinaRow[], error: null }

  const configuracionResult = await supabase
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['asistencias.tolerancia_checkin_minutos', 'nomina.deduccion_falta_dias'])

  const empleadosSalaryResult =
    empleadoIds.length > 0
      ? await supabase.from('empleado').select('id, sueldo_base_mensual').in('id', empleadoIds)
      : { data: [] as EmpleadoSalaryRow[], error: null }

  const misionesCatalogoResult = await supabase
    .from('mision_dia')
    .select('id, codigo, instruccion, orden, peso')
    .eq('activa', true)
    .order('orden', { ascending: true, nullsFirst: false })
    .order('peso', { ascending: false })
    .order('created_at', { ascending: true })

  const recentMissionRowsResult =
    empleadoIds.length > 0 && pdvIds.length > 0
      ? await supabase
          .from('asistencia')
          .select('empleado_id, pdv_id, mision_dia_id, mision_codigo, fecha_operacion, created_at')
          .in('empleado_id', empleadoIds)
          .in('pdv_id', pdvIds)
          .not('mision_dia_id', 'is', null)
          .order('fecha_operacion', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(500)
      : { data: [] as RecentMissionRow[], error: null }

  const geocercasPorPdv = ((geocercasResult.data ?? []) as GeocercaContextRow[]).reduce<
    Record<string, GeocercaContextRow>
  >((acumulado, item) => {
    acumulado[item.pdv_id] = item
    return acumulado
  }, {})

  const solicitudesPorEmpleado = ((solicitudesResult.data ?? []) as SolicitudAsistenciaRow[]).reduce<
    Record<string, SolicitudAsistenciaRow[]>
  >((acumulado, item) => {
    acumulado[item.empleado_id] ??= []
    acumulado[item.empleado_id].push(item)
    return acumulado
  }, {})

  const formacionesJustificacion = (formacionesResult.data ?? []) as FormacionJustificacionRow[]

  const ventasPorAsistencia = ((ventaRowsResult.data ?? []) as VentaAsistenciaRow[]).reduce<
    Record<string, { confirmadas: number; pendientes: number }>
  >((acumulado, item) => {
    acumulado[item.asistencia_id] ??= { confirmadas: 0, pendientes: 0 }
    if (item.confirmada) {
      acumulado[item.asistencia_id].confirmadas += 1
    } else {
      acumulado[item.asistencia_id].pendientes += 1
    }
    return acumulado
  }, {})

  const misionesCatalogo = ((misionesCatalogoResult.data ?? []) as MissionCatalogRow[]).map<AttendanceMissionCatalogItem>((item) => ({
    id: item.id,
    codigo: item.codigo,
    instruccion: item.instruccion,
    orden: item.orden,
    peso: item.peso,
  }))

  const ultimaMisionPorEmpleadoPdv = ((recentMissionRowsResult.data ?? []) as RecentMissionRow[]).reduce<
    Record<string, { misionDiaId: string | null; misionCodigo: string | null }>
  >((acumulado, item) => {
    const pairKey = `${item.empleado_id}::${item.pdv_id}`
    if (!acumulado[pairKey]) {
      acumulado[pairKey] = {
        misionDiaId: item.mision_dia_id,
        misionCodigo: item.mision_codigo,
      }
    }
    return acumulado
  }, {})

  const asistencias = asistenciasBase.map((asistencia) => {
    const geocerca = geocercasPorPdv[asistencia.pdv_id]
    const solicitudRelacionada = (solicitudesPorEmpleado[asistencia.empleado_id] ?? []).find(
      (item) => {
        const metadata = normalizeMetadata(item.metadata)
        return (
          Boolean(metadata.justifica_asistencia) &&
          isApprovedSolicitud(item.estatus) &&
          isSameOrWithinRange(asistencia.fecha_operacion, item.fecha_inicio, item.fecha_fin)
        )
      }
    )
    const formacionRelacionada = formacionesJustificacion.find(
      (item) =>
        ['PROGRAMADA', 'EN_CURSO'].includes(item.estado) &&
        isSameOrWithinRange(asistencia.fecha_operacion, item.fecha_inicio, item.fecha_fin) &&
        formacionTargetsEmployee(
          {
            participantes: item.participantes,
            metadata: item.metadata,
          },
          {
            empleadoId: asistencia.empleado_id,
            puesto: null,
            pdvId: asistencia.pdv_id,
          }
        )
    )
    const justificacionRelacionada = solicitudRelacionada
      ? {
          id: solicitudRelacionada.id,
          tipo: solicitudRelacionada.tipo,
          estatus: solicitudRelacionada.estatus,
          detalle: `${solicitudRelacionada.tipo} ${solicitudRelacionada.fecha_inicio} -> ${solicitudRelacionada.fecha_fin}`,
        }
      : formacionRelacionada
        ? {
            id: formacionRelacionada.id,
            tipo: 'FORMACION',
            estatus: formacionRelacionada.estado,
            detalle: `${formacionRelacionada.nombre} · ${formacionRelacionada.fecha_inicio} -> ${formacionRelacionada.fecha_fin}`,
          }
        : null
    const resumenVentas = ventasPorAsistencia[asistencia.id] ?? { confirmadas: 0, pendientes: 0 }
    const ultimaMision = ultimaMisionPorEmpleadoPdv[`${asistencia.empleado_id}::${asistencia.pdv_id}`]

    return {
      id: asistencia.id,
      cuentaClienteId: asistencia.cuenta_cliente_id,
      asignacionId: asistencia.asignacion_id,
      empleadoId: asistencia.empleado_id,
      supervisorEmpleadoId: asistencia.supervisor_empleado_id,
      pdvId: asistencia.pdv_id,
      misionDiaId: asistencia.mision_dia_id,
      fechaOperacion: asistencia.fecha_operacion,
      cuentaCliente: obtenerPrimero(asistencia.cuenta_cliente)?.nombre ?? null,
      empleado: asistencia.empleado_nombre,
      pdvClaveBtl: asistencia.pdv_clave_btl,
      pdvNombre: asistencia.pdv_nombre,
      zona: asistencia.pdv_zona,
      cadena: asistencia.cadena_nombre,
      checkInUtc: asistencia.check_in_utc,
      checkOutUtc: asistencia.check_out_utc,
      distanciaCheckInMetros: asistencia.distancia_check_in_metros,
      estadoGps: asistencia.estado_gps,
      biometriaEstado: asistencia.biometria_estado,
      estatus: asistencia.estatus,
      misionCodigo: asistencia.mision_codigo,
      misionInstruccion: asistencia.mision_instruccion,
      justificacionFueraGeocerca: asistencia.justificacion_fuera_geocerca,
      geocercaLatitud: geocerca?.latitud ?? null,
      geocercaLongitud: geocerca?.longitud ?? null,
      geocercaRadioMetros: geocerca?.radio_tolerancia_metros ?? null,
      permiteCheckinConJustificacion: geocerca?.permite_checkin_con_justificacion ?? true,
      solicitudRelacionadaId: justificacionRelacionada?.id ?? null,
      solicitudRelacionadaTipo: justificacionRelacionada?.tipo ?? null,
      solicitudRelacionadaEstatus: justificacionRelacionada?.estatus ?? null,
      diaJustificado: Boolean(justificacionRelacionada),
      detalleJustificacion: justificacionRelacionada?.detalle ?? null,
      ventasConfirmadas: resumenVentas.confirmadas,
      ventasPendientesConfirmacion: resumenVentas.pendientes,
      ultimaMisionDiaId: ultimaMision?.misionDiaId ?? null,
      ultimaMisionCodigo: ultimaMision?.misionCodigo ?? null,
    }
  })

  const toleranceMinutes = resolveNumericConfigValue(
    ((configuracionResult.data ?? []) as ConfiguracionAsistenciaRow[]).find(
      (item) => item.clave === 'asistencias.tolerancia_checkin_minutos'
    )?.valor,
    15
  )
  const disciplina = deriveAttendanceDiscipline({
    assignments: ((assignmentsResult.data ?? []) as AsignacionDisciplinaRow[]).map<AttendanceDisciplineAssignment>((item) => ({
      id: item.id,
      empleadoId: item.empleado_id,
      cuentaClienteId: item.cuenta_cliente_id,
      supervisorEmpleadoId: item.supervisor_empleado_id,
      fechaInicio: item.fecha_inicio,
      fechaFin: item.fecha_fin,
      tipo: item.tipo,
      diasLaborales: item.dias_laborales,
      diaDescanso: item.dia_descanso,
      horarioReferencia: item.horario_referencia,
      naturaleza: item.naturaleza ?? 'BASE',
      prioridad: item.prioridad ?? null,
    })),
    attendances: asistencias.map((item) => ({
      id: item.id,
      empleadoId: item.empleadoId,
      cuentaClienteId: item.cuentaClienteId,
      fechaOperacion: item.fechaOperacion,
      checkInUtc: item.checkInUtc,
      checkOutUtc: item.checkOutUtc,
      estatus: item.estatus as 'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'CERRADA',
    })),
    solicitudes: ((solicitudesResult.data ?? []) as SolicitudAsistenciaRow[]).map((item) => ({
      id: item.id,
      empleadoId: item.empleado_id,
      fechaInicio: item.fecha_inicio,
      fechaFin: item.fecha_fin,
      tipo: item.tipo,
      estatus: item.estatus,
      metadata: normalizeMetadata(item.metadata),
    })),
    formaciones: Array.from(
      new Map(
        ((formacionesResult.data ?? []) as FormacionJustificacionRow[]).flatMap((item) =>
          ((assignmentsResult.data ?? []) as AsignacionDisciplinaRow[])
            .filter((assignment) =>
              formacionTargetsEmployee(
                {
                  participantes: item.participantes,
                  metadata: item.metadata,
                },
                {
                  empleadoId: assignment.empleado_id,
                  puesto: null,
                  pdvId: assignment.pdv_id,
                }
              )
            )
            .map<readonly [string, AttendanceDisciplineFormation]>((assignment) => [
              `${item.id}::${assignment.empleado_id}`,
              {
                id: item.id,
                empleadoId: assignment.empleado_id,
                fechaInicio: item.fecha_inicio,
                fechaFin: item.fecha_fin,
                nombre: item.nombre ?? null,
                tipo: item.tipo,
                estatus: item.estado,
              },
            ])
        )
      ).values()
    ),
    toleranceMinutes,
    payrollDeductionDays: resolveNumericConfigValue(
      ((configuracionResult.data ?? []) as ConfiguracionAsistenciaRow[]).find(
        (item) => item.clave === 'nomina.deduccion_falta_dias'
      )?.valor,
      1
    ),
    salaries: ((empleadosSalaryResult.data ?? []) as EmpleadoSalaryRow[]).map((item) => ({
      empleadoId: item.id,
      sueldoBaseMensual: item.sueldo_base_mensual,
    })),
    periodStart: fechaMin ?? new Date().toISOString().slice(0, 10),
    periodEnd: fechaMax ?? new Date().toISOString().slice(0, 10),
  })
  const empleadoLabelMap = new Map(asistencias.map((item) => [item.empleadoId, item.empleado] as const))
  const cuentaLabelMap = new Map(
    asistencias
      .filter((item) => item.cuentaClienteId)
      .map((item) => [item.cuentaClienteId, item.cuentaCliente] as const)
  )
  const disciplinaResumen = disciplina.summaries.reduce<AsistenciaDisciplinaResumen>(
    (acc, item) => {
      acc.retardos += item.retardos
      acc.faltas += item.faltas
      acc.ausenciasJustificadas += item.ausenciasJustificadas
      acc.pendientesValidacion += item.pendientesValidacion
      acc.faltasAdministrativas += item.faltasAdministrativas
      return acc
    },
    buildEmptyDisciplinaResumen()
  )
  const incidenciasDisciplina = disciplina.records
    .filter((item) => item.estado !== 'ASISTENCIA')
    .slice(0, 24)
    .map<AsistenciaDisciplinaItem>((item) => ({
      assignmentId: item.assignmentId,
      empleadoId: item.empleadoId,
      cuentaClienteId: item.cuentaClienteId,
      supervisorEmpleadoId: item.supervisorEmpleadoId,
      empleado: empleadoLabelMap.get(item.empleadoId) ?? item.empleadoId,
      cuentaCliente: (item.cuentaClienteId ? cuentaLabelMap.get(item.cuentaClienteId) : null) ?? null,
      fecha: item.fecha,
      estado: item.estado,
      minutosRetardo: item.minutosRetardo,
      horarioEsperado: item.horarioEsperado,
    }))

  return {
    resumen: {
      total: totalItems,
      abiertas: asistencias.filter((item) => !item.checkOutUtc && item.estatus !== 'RECHAZADA')
        .length,
      pendientesValidacion: asistencias.filter((item) => item.estatus === 'PENDIENTE_VALIDACION')
        .length,
      fueraGeocerca: asistencias.filter((item) => item.estadoGps === 'FUERA_GEOCERCA').length,
      cerradas: asistencias.filter((item) => item.estatus === 'CERRADA').length,
      justificadas: asistencias.filter((item) => item.diaJustificado).length,
    },
    disciplinaResumen,
    incidenciasDisciplina,
    asistencias,
    misionesCatalogo,
    paginacion: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    infraestructuraLista: true,
  }
}
