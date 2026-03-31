import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import type {
  Asignacion,
  AsignacionDiariaDirtyQueue,
  AsignacionDiariaResuelta,
  Empleado,
} from '@/types/database'
import { resolveEffectiveAssignmentForEmployeeDate } from '@/features/asignaciones/services/asignacionResolverService'

type TypedSupabaseClient = SupabaseClient<any>

type DirtyQueueState = AsignacionDiariaDirtyQueue['estado']

interface MaterializationEmployeeRow
  extends Pick<
    Empleado,
    'id' | 'nombre_completo' | 'puesto' | 'zona' | 'fecha_nacimiento' | 'supervisor_empleado_id' | 'estatus_laboral'
  > {}

interface MaterializationAssignmentRow
  extends Pick<
    Asignacion,
    | 'id'
    | 'empleado_id'
    | 'pdv_id'
    | 'supervisor_empleado_id'
    | 'cuenta_cliente_id'
    | 'fecha_inicio'
    | 'fecha_fin'
    | 'tipo'
    | 'dias_laborales'
    | 'dia_descanso'
    | 'horario_referencia'
    | 'naturaleza'
    | 'prioridad'
  > {}

interface MaterializationRequestRow {
  id: string
  empleadoId: string
  fechaInicio: string
  fechaFin: string
  tipo: string
  estatus: string
  metadata: Record<string, unknown> | null | undefined
}

interface MaterializationFormationRow {
  id: string
  fechaInicio: string
  fechaFin: string
  estado: string
  nombre?: string | null
  tipo?: string | null
  sede?: string | null
  participantes?: Array<Record<string, unknown>> | null
  metadata?: Record<string, unknown> | null
}

interface MaterializationSupervisorRow extends Pick<Empleado, 'id' | 'supervisor_empleado_id'> {}

export interface DirtyAssignmentRangeInput {
  empleadoId: string
  fechaInicio: string
  fechaFin: string
  motivo: string
  payload?: Record<string, unknown>
}

export interface ProcessDirtyQueueOptions {
  limit?: number
}

export interface RecalculateAssignmentsRangeInput {
  empleadoIds: string[]
  fechaInicio: string
  fechaFin: string
}

export interface MaterializationImpactRange {
  fechaInicio: string
  fechaFin: string
}

export interface MaterializedMonthlyFilters {
  month: string
  supervisorEmpleadoId?: string | null
  coordinadorEmpleadoId?: string | null
  cuentaClienteId?: string | null
  zona?: string | null
  estadoOperativo?: AsignacionDiariaResuelta['estado_operativo'] | null
}

export interface MaterializedCalendarDay {
  fecha: string
  estadoOperativo: AsignacionDiariaResuelta['estado_operativo']
  origen: AsignacionDiariaResuelta['origen']
  pdvId: string | null
  pdvNombre: string | null
  pdvClaveBtl: string | null
  pdvZona: string | null
  latitud: number | null
  longitud: number | null
  radioToleranciaMetros: number | null
  laborable: boolean
  trabajaEnTienda: boolean
  sedeFormacion: string | null
  horarioInicio: string | null
  horarioFin: string | null
  flags: Record<string, unknown>
  mensajeOperativo: string | null
}

export interface MaterializedCalendarEmployeeRow {
  empleadoId: string
  nombreCompleto: string
  zona: string | null
  supervisorEmpleadoId: string | null
  supervisorNombre: string | null
  coordinadorEmpleadoId: string | null
  coordinadorNombre: string | null
  dias: MaterializedCalendarDay[]
}

export interface MaterializedMonthlyCalendar {
  month: string
  fechaInicio: string
  fechaFin: string
  dias: string[]
  totalEmpleados: number
  empleados: MaterializedCalendarEmployeeRow[]
}

function createService(serviceClient?: TypedSupabaseClient) {
  return serviceClient ?? (createServiceClient() as TypedSupabaseClient)
}

function normalizeDate(value: string) {
  return value.slice(0, 10)
}

function listDatesInclusive(start: string, end: string) {
  const dates: string[] = []
  const cursor = new Date(`${start}T12:00:00Z`)
  const limit = new Date(`${end}T12:00:00Z`)

  while (cursor.getTime() <= limit.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}

function addDays(dateIso: string, offset: number) {
  const date = new Date(`${dateIso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function startOfMonth(month: string) {
  return `${month}-01`
}

function endOfMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1, 0)
  return date.toISOString().slice(0, 10)
}

function getTodayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addMonths(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset, 1)
  return date.toISOString().slice(0, 7)
}

export function resolveMaterializationImpactRange(
  fechaInicio: string,
  fechaFin: string | null,
  baseDateIso = getTodayIso()
): MaterializationImpactRange | null {
  const currentMonth = baseDateIso.slice(0, 7)
  const nextMonth = addMonths(currentMonth, 1)
  const lowerBound = startOfMonth(currentMonth)
  const upperBound = endOfMonth(nextMonth)
  const normalizedStart = normalizeDate(fechaInicio)
  const normalizedEnd = fechaFin ? normalizeDate(fechaFin) : upperBound
  const effectiveStart = normalizedStart > lowerBound ? normalizedStart : lowerBound
  const effectiveEnd = normalizedEnd < upperBound ? normalizedEnd : upperBound

  if (effectiveStart > effectiveEnd) {
    return null
  }

  return {
    fechaInicio: effectiveStart,
    fechaFin: effectiveEnd,
  }
}
function rangesOverlapOrTouch(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
) {
  return leftStart <= addDays(rightEnd, 1) && rightStart <= addDays(leftEnd, 1)
}

function parseHorarioRange(horario: string | null) {
  const normalized = String(horario ?? '').trim()
  if (!normalized) {
    return { horarioInicio: null, horarioFin: null }
  }

  const matches = normalized.match(/(\d{1,2}:\d{2})/g)
  if (!matches || matches.length === 0) {
    return { horarioInicio: null, horarioFin: null }
  }

  return {
    horarioInicio: matches[0] ?? null,
    horarioFin: matches[1] ?? null,
  }
}

function isBirthdayOnDate(fechaNacimiento: string | null, targetDate: string) {
  if (!fechaNacimiento) {
    return false
  }

  const normalizedBirth = normalizeDate(fechaNacimiento)
  return normalizedBirth.slice(5) === targetDate.slice(5)
}

function buildDirtyQueuePayload(input: DirtyAssignmentRangeInput) {
  return {
    ...(input.payload ?? {}),
    motivo: input.motivo,
    fecha_inicio: input.fechaInicio,
    fecha_fin: input.fechaFin,
  }
}

function buildReferenceTable(input: {
  assignmentId: string | null
  requestId: string | null
  formationId: string | null
}): AsignacionDiariaResuelta['referencia_tabla'] {
  if (input.formationId) {
    return 'formacion'
  }
  if (input.requestId) {
    return 'solicitud'
  }
  if (input.assignmentId) {
    return 'asignacion'
  }
  return null
}

export function mergeDirtyAssignmentRanges(inputs: DirtyAssignmentRangeInput[]) {
  const sorted = [...inputs]
    .filter((item) => item.empleadoId && item.fechaInicio && item.fechaFin)
    .sort((left, right) => {
      const employeeDelta = left.empleadoId.localeCompare(right.empleadoId)
      if (employeeDelta !== 0) {
        return employeeDelta
      }

      const startDelta = left.fechaInicio.localeCompare(right.fechaInicio)
      if (startDelta !== 0) {
        return startDelta
      }

      return left.fechaFin.localeCompare(right.fechaFin)
    })

  const merged: DirtyAssignmentRangeInput[] = []

  for (const current of sorted) {
    const previous = merged[merged.length - 1]
    if (
      previous &&
      previous.empleadoId === current.empleadoId &&
      rangesOverlapOrTouch(previous.fechaInicio, previous.fechaFin, current.fechaInicio, current.fechaFin)
    ) {
      previous.fechaInicio = previous.fechaInicio < current.fechaInicio ? previous.fechaInicio : current.fechaInicio
      previous.fechaFin = previous.fechaFin > current.fechaFin ? previous.fechaFin : current.fechaFin
      previous.motivo = `${previous.motivo}; ${current.motivo}`
      previous.payload = {
        ...(previous.payload ?? {}),
        ...(current.payload ?? {}),
        motivos: Array.from(
          new Set(
            `${previous.motivo}; ${current.motivo}`
              .split(';')
              .map((item) => item.trim())
              .filter(Boolean)
          )
        ),
      }
      continue
    }

    merged.push({
      ...current,
      payload: current.payload ? { ...current.payload } : undefined,
    })
  }

  return merged
}

async function loadMaterializationSources(
  service: TypedSupabaseClient,
  empleadoIds: string[],
  fechaInicio: string,
  fechaFin: string
) {
  const normalizedEmpleadoIds = Array.from(new Set(empleadoIds.filter(Boolean)))
  if (normalizedEmpleadoIds.length === 0) {
    return {
      empleados: [] as MaterializationEmployeeRow[],
      assignments: [] as MaterializationAssignmentRow[],
      requests: [] as MaterializationRequestRow[],
      formations: [] as MaterializationFormationRow[],
      supervisors: [] as MaterializationSupervisorRow[],
    }
  }

  const [employeesResult, assignmentsResult, requestsResult, formationsResult] = await Promise.all([
    service
      .from('empleado')
      .select('id, nombre_completo, puesto, zona, fecha_nacimiento, supervisor_empleado_id, estatus_laboral')
      .in('id', normalizedEmpleadoIds),
    service
      .from('asignacion')
      .select(`
        id,
        empleado_id,
        pdv_id,
        supervisor_empleado_id,
        cuenta_cliente_id,
        fecha_inicio,
        fecha_fin,
        tipo,
        dias_laborales,
        dia_descanso,
        horario_referencia,
        naturaleza,
        prioridad,
        estado_publicacion
      `)
      .in('empleado_id', normalizedEmpleadoIds)
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', fechaFin)
      .or(`fecha_fin.is.null,fecha_fin.gte.${fechaInicio}`),
    service
      .from('solicitud')
      .select('id, empleado_id, fecha_inicio, fecha_fin, tipo, estatus, metadata')
      .in('empleado_id', normalizedEmpleadoIds)
      .lte('fecha_inicio', fechaFin)
      .gte('fecha_fin', fechaInicio),
    service
      .from('formacion')
      .select('id, fecha_inicio, fecha_fin, estado, nombre, tipo, sede, participantes, metadata')
      .lte('fecha_inicio', fechaFin)
      .gte('fecha_fin', fechaInicio),
  ])

  if (employeesResult.error) {
    throw new Error(employeesResult.error.message)
  }
  if (assignmentsResult.error) {
    throw new Error(assignmentsResult.error.message)
  }
  if (requestsResult.error) {
    throw new Error(requestsResult.error.message)
  }
  if (formationsResult.error) {
    throw new Error(formationsResult.error.message)
  }

  const empleados = (employeesResult.data ?? []) as MaterializationEmployeeRow[]
  const supervisorIds = Array.from(
    new Set(empleados.map((item) => item.supervisor_empleado_id).filter((item): item is string => Boolean(item)))
  )

  const supervisorsResult =
    supervisorIds.length > 0
      ? await service.from('empleado').select('id, supervisor_empleado_id').in('id', supervisorIds)
      : { data: [], error: null }

  if (supervisorsResult.error) {
    throw new Error(supervisorsResult.error.message)
  }

  return {
    empleados,
    assignments: ((assignmentsResult.data ?? []) as Array<MaterializationAssignmentRow & { estado_publicacion: string }>)
      .filter((item) => item.estado_publicacion === 'PUBLICADA')
      .map(({ estado_publicacion: _ignored, ...item }) => item),
    requests: ((requestsResult.data ?? []) as Array<{
      id: string
      empleado_id: string
      fecha_inicio: string
      fecha_fin: string
      tipo: string
      estatus: string
      metadata: Record<string, unknown> | null
    }>).map((item) => ({
      id: item.id,
      empleadoId: item.empleado_id,
      fechaInicio: item.fecha_inicio,
      fechaFin: item.fecha_fin,
      tipo: item.tipo,
      estatus: item.estatus,
      metadata: item.metadata,
    })),
    formations: ((formationsResult.data ?? []) as Array<{
      id: string
      fecha_inicio: string
      fecha_fin: string
      estado: string
      nombre?: string | null
      tipo?: string | null
      sede?: string | null
      participantes?: Array<Record<string, unknown>> | null
      metadata?: Record<string, unknown> | null
    }>).map((item) => ({
      id: item.id,
      fechaInicio: item.fecha_inicio,
      fechaFin: item.fecha_fin,
      estado: item.estado,
      nombre: item.nombre ?? null,
      tipo: item.tipo ?? null,
      sede: item.sede ?? null,
      participantes: item.participantes ?? null,
      metadata: item.metadata ?? null,
    })),
    supervisors: (supervisorsResult.data ?? []) as MaterializationSupervisorRow[],
  }
}

function buildMaterializedRows(params: {
  fechaInicio: string
  fechaFin: string
  empleados: MaterializationEmployeeRow[]
  assignments: MaterializationAssignmentRow[]
  requests: MaterializationRequestRow[]
  formations: MaterializationFormationRow[]
  supervisors: MaterializationSupervisorRow[]
}) {
  const supervisorCoordinatorMap = new Map(
    params.supervisors.map((item) => [item.id, item.supervisor_empleado_id ?? null] as const)
  )

  const rows: AsignacionDiariaResuelta[] = []

  for (const empleado of params.empleados) {
    const employeeAssignments = params.assignments.filter((item) => item.empleado_id === empleado.id)
    const pdvIds = Array.from(new Set(employeeAssignments.map((item) => item.pdv_id).filter(Boolean)))

    for (const fecha of listDatesInclusive(params.fechaInicio, params.fechaFin)) {
      const resolved = resolveEffectiveAssignmentForEmployeeDate(
        {
          empleadoId: empleado.id,
          puesto: empleado.puesto,
          pdvIds,
        },
        fecha,
        employeeAssignments,
        params.requests.filter((item) => item.empleadoId === empleado.id),
        params.formations
      )

      const horario = parseHorarioRange(resolved.assignment?.horario_referencia ?? null)
      const supervisorEmpleadoId =
        resolved.supervisorEmpleadoId ?? resolved.assignment?.supervisor_empleado_id ?? empleado.supervisor_empleado_id

      rows.push({
        fecha,
        empleado_id: empleado.id,
        pdv_id: resolved.pdvId,
        supervisor_empleado_id: supervisorEmpleadoId ?? null,
        coordinador_empleado_id: supervisorEmpleadoId ? supervisorCoordinatorMap.get(supervisorEmpleadoId) ?? null : null,
        cuenta_cliente_id: resolved.cuentaClienteId,
        estado_operativo: resolved.estadoOperativo,
        origen: resolved.origen,
        referencia_tabla: buildReferenceTable({
          assignmentId: resolved.assignment?.id ?? null,
          requestId: resolved.request?.id ?? null,
          formationId: resolved.formation?.id ?? null,
        }),
        referencia_id: resolved.referenciaId,
        mensaje_operativo: resolved.mensajeOperativo,
        laborable: resolved.estadoOperativo !== 'SIN_ASIGNACION',
        trabaja_en_tienda: resolved.estadoOperativo === 'ASIGNADA_PDV',
        sede_formacion: resolved.formation?.sede ?? null,
        horario_inicio: horario.horarioInicio,
        horario_fin: horario.horarioFin,
        flags: {
          cumpleanos: isBirthdayOnDate(empleado.fecha_nacimiento, fecha),
          zona: empleado.zona,
          naturaleza_asignacion: resolved.assignment?.naturaleza ?? null,
          tipo_solicitud: resolved.request?.tipo ?? null,
          tipo_formacion: resolved.formation?.tipo ?? null,
        },
        refreshed_at: new Date().toISOString(),
      })
    }
  }

  return rows
}

export async function enqueueDirtyAssignmentRanges(
  inputs: DirtyAssignmentRangeInput[],
  serviceClient?: TypedSupabaseClient
) {
  const service = createService(serviceClient)
  const merged = mergeDirtyAssignmentRanges(inputs)
  if (merged.length === 0) {
    return [] as AsignacionDiariaDirtyQueue[]
  }

  const { data, error } = await service
    .from('asignacion_diaria_dirty_queue')
    .insert(
      merged.map((item) => ({
        empleado_id: item.empleadoId,
        fecha_inicio: item.fechaInicio,
        fecha_fin: item.fechaFin,
        motivo: item.motivo,
        payload: buildDirtyQueuePayload(item),
      }))
    )
    .select('*')

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as AsignacionDiariaDirtyQueue[]
}

export async function enqueueAndProcessMaterializedAssignments(
  inputs: DirtyAssignmentRangeInput[],
  serviceClient?: TypedSupabaseClient
) {
  const service = createService(serviceClient)
  const merged = mergeDirtyAssignmentRanges(inputs)

  if (merged.length === 0) {
    return {
      enqueued: 0,
      processed: 0,
      jobs: 0,
    }
  }

  await enqueueDirtyAssignmentRanges(merged, service)
  const processed = await processMaterializationDirtyQueue(
    { limit: Math.max(merged.length, 1) },
    service
  )

  return {
    enqueued: merged.length,
    processed: processed.processed,
    jobs: processed.jobs,
  }
}
export async function recalculateMaterializedAssignmentsRange(
  input: RecalculateAssignmentsRangeInput,
  serviceClient?: TypedSupabaseClient
) {
  const service = createService(serviceClient)
  const empleadoIds = Array.from(new Set(input.empleadoIds.filter(Boolean)))

  if (empleadoIds.length === 0) {
    return { upserted: 0 }
  }

  const sources = await loadMaterializationSources(service, empleadoIds, input.fechaInicio, input.fechaFin)
  const rows = buildMaterializedRows({
    fechaInicio: input.fechaInicio,
    fechaFin: input.fechaFin,
    ...sources,
  })

  if (rows.length === 0) {
    return { upserted: 0 }
  }

  const { error } = await service.from('asignacion_diaria_resuelta').upsert(rows, {
    onConflict: 'empleado_id,fecha',
  })

  if (error) {
    throw new Error(error.message)
  }

  return { upserted: rows.length }
}

export async function processMaterializationDirtyQueue(
  options?: ProcessDirtyQueueOptions,
  serviceClient?: TypedSupabaseClient
) {
  const service = createService(serviceClient)
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 250))

  const { data: queueRowsRaw, error: queueError } = await service
    .from('asignacion_diaria_dirty_queue')
    .select('*')
    .in('estado', ['PENDIENTE', 'ERROR'] as DirtyQueueState[])
    .order('created_at', { ascending: true })
    .limit(limit)

  if (queueError) {
    throw new Error(queueError.message)
  }

  const queueRows = (queueRowsRaw ?? []) as AsignacionDiariaDirtyQueue[]
  if (queueRows.length === 0) {
    return { processed: 0, jobs: 0 }
  }

  const queueIds = queueRows.map((item) => item.id)
  const startedAt = new Date().toISOString()

  const { error: markProcessingError } = await service
    .from('asignacion_diaria_dirty_queue')
    .update({
      estado: 'PROCESANDO',
      updated_at: startedAt,
    })
    .in('id', queueIds)

  if (markProcessingError) {
    throw new Error(markProcessingError.message)
  }

  const mergedJobs = mergeDirtyAssignmentRanges(
    queueRows.map((item) => ({
      empleadoId: item.empleado_id,
      fechaInicio: item.fecha_inicio,
      fechaFin: item.fecha_fin,
      motivo: item.motivo,
      payload: item.payload,
    }))
  )

  try {
    for (const job of mergedJobs) {
      await recalculateMaterializedAssignmentsRange(
        {
          empleadoIds: [job.empleadoId],
          fechaInicio: job.fechaInicio,
          fechaFin: job.fechaFin,
        },
        service
      )
    }

    const { error: markDoneError } = await service
      .from('asignacion_diaria_dirty_queue')
      .update({
        estado: 'PROCESADO',
        procesado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .in('id', queueIds)

    if (markDoneError) {
      throw new Error(markDoneError.message)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al procesar la cola.'
    await service
      .from('asignacion_diaria_dirty_queue')
      .update({
        estado: 'ERROR',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .in('id', queueIds)

    throw error
  }

  return {
    processed: queueRows.length,
    jobs: mergedJobs.length,
  }
}

export async function getMaterializedMonthlyCalendar(
  filters: MaterializedMonthlyFilters,
  serviceClient?: TypedSupabaseClient
): Promise<MaterializedMonthlyCalendar> {
  const service = createService(serviceClient)
  const fechaInicio = startOfMonth(filters.month)
  const fechaFin = endOfMonth(filters.month)

  let rowsQuery = service
    .from('asignacion_diaria_resuelta')
    .select('*')
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin)
    .order('empleado_id', { ascending: true })
    .order('fecha', { ascending: true })

  if (filters.supervisorEmpleadoId) {
    rowsQuery = rowsQuery.eq('supervisor_empleado_id', filters.supervisorEmpleadoId)
  }
  if (filters.coordinadorEmpleadoId) {
    rowsQuery = rowsQuery.eq('coordinador_empleado_id', filters.coordinadorEmpleadoId)
  }
  if (filters.cuentaClienteId) {
    rowsQuery = rowsQuery.eq('cuenta_cliente_id', filters.cuentaClienteId)
  }
  if (filters.estadoOperativo) {
    rowsQuery = rowsQuery.eq('estado_operativo', filters.estadoOperativo)
  }

  const { data: rowsRaw, error: rowsError } = await rowsQuery

  if (rowsError) {
    throw new Error(rowsError.message)
  }

  const rows = (rowsRaw ?? []) as AsignacionDiariaResuelta[]
  const empleadoIds = Array.from(new Set(rows.map((item) => item.empleado_id)))
  const pdvIds = Array.from(new Set(rows.map((item) => item.pdv_id).filter((item): item is string => Boolean(item))))
  const supervisorIds = Array.from(
    new Set(rows.map((item) => item.supervisor_empleado_id).filter((item): item is string => Boolean(item)))
  )
  const coordinadorIds = Array.from(
    new Set(rows.map((item) => item.coordinador_empleado_id).filter((item): item is string => Boolean(item)))
  )

  const [employeesResult, pdvsResult, supervisorsResult, coordinatorsResult] = await Promise.all([
    empleadoIds.length > 0
      ? service.from('empleado').select('id, nombre_completo, zona').in('id', empleadoIds)
      : Promise.resolve({ data: [], error: null }),
    pdvIds.length > 0
      ? service
          .from('pdv')
          .select('id, nombre, clave_btl, zona, geocerca_pdv(latitud, longitud, radio_tolerancia_metros)')
          .in('id', pdvIds)
      : Promise.resolve({ data: [], error: null }),
    supervisorIds.length > 0
      ? service.from('empleado').select('id, nombre_completo').in('id', supervisorIds)
      : Promise.resolve({ data: [], error: null }),
    coordinadorIds.length > 0
      ? service.from('empleado').select('id, nombre_completo').in('id', coordinadorIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (employeesResult.error) {
    throw new Error(employeesResult.error.message)
  }
  if (pdvsResult.error) {
    throw new Error(pdvsResult.error.message)
  }
  if (supervisorsResult.error) {
    throw new Error(supervisorsResult.error.message)
  }
  if (coordinatorsResult.error) {
    throw new Error(coordinatorsResult.error.message)
  }

  const employeeById = new Map(
    ((employeesResult.data ?? []) as Array<Pick<Empleado, 'id' | 'nombre_completo' | 'zona'>>).map((item) => [item.id, item])
  )
  const pdvById = new Map(
    ((pdvsResult.data ?? []) as Array<{
      id: string
      nombre: string
      clave_btl: string | null
      zona: string | null
      geocerca_pdv: Array<{
        latitud: number | null
        longitud: number | null
        radio_tolerancia_metros: number | null
      }> | null
    }>).map((item) => [item.id, item])
  )
  const supervisorById = new Map(
    ((supervisorsResult.data ?? []) as Array<Pick<Empleado, 'id' | 'nombre_completo'>>).map((item) => [item.id, item.nombre_completo])
  )
  const coordinadorById = new Map(
    ((coordinatorsResult.data ?? []) as Array<Pick<Empleado, 'id' | 'nombre_completo'>>).map((item) => [item.id, item.nombre_completo])
  )

  const days = listDatesInclusive(fechaInicio, fechaFin)
  const empleadosMap = new Map<string, MaterializedCalendarEmployeeRow>()

  for (const row of rows) {
    const employee = employeeById.get(row.empleado_id)
    if (filters.zona && employee?.zona !== filters.zona) {
      continue
    }

    const bucket =
      empleadosMap.get(row.empleado_id) ??
      {
        empleadoId: row.empleado_id,
        nombreCompleto: employee?.nombre_completo ?? row.empleado_id,
        zona: employee?.zona ?? null,
        supervisorEmpleadoId: row.supervisor_empleado_id,
        supervisorNombre: row.supervisor_empleado_id ? supervisorById.get(row.supervisor_empleado_id) ?? null : null,
        coordinadorEmpleadoId: row.coordinador_empleado_id,
        coordinadorNombre: row.coordinador_empleado_id ? coordinadorById.get(row.coordinador_empleado_id) ?? null : null,
        dias: [],
      }

    bucket.dias.push({
      fecha: row.fecha,
      estadoOperativo: row.estado_operativo,
      origen: row.origen,
      pdvId: row.pdv_id,
      pdvNombre: row.pdv_id ? pdvById.get(row.pdv_id)?.nombre ?? null : null,
      pdvClaveBtl: row.pdv_id ? pdvById.get(row.pdv_id)?.clave_btl ?? null : null,
      pdvZona: row.pdv_id ? pdvById.get(row.pdv_id)?.zona ?? null : null,
      latitud: row.pdv_id ? pdvById.get(row.pdv_id)?.geocerca_pdv?.[0]?.latitud ?? null : null,
      longitud: row.pdv_id ? pdvById.get(row.pdv_id)?.geocerca_pdv?.[0]?.longitud ?? null : null,
      radioToleranciaMetros: row.pdv_id ? pdvById.get(row.pdv_id)?.geocerca_pdv?.[0]?.radio_tolerancia_metros ?? null : null,
      laborable: row.laborable,
      trabajaEnTienda: row.trabaja_en_tienda,
      sedeFormacion: row.sede_formacion,
      horarioInicio: row.horario_inicio,
      horarioFin: row.horario_fin,
      flags: row.flags ?? {},
      mensajeOperativo: row.mensaje_operativo,
    })
    empleadosMap.set(row.empleado_id, bucket)
  }

  const empleados = Array.from(empleadosMap.values())
    .map((item) => ({
      ...item,
      dias: days.map((fecha) =>
        item.dias.find((dia) => dia.fecha === fecha) ?? {
          fecha,
          estadoOperativo: 'SIN_ASIGNACION' as const,
          origen: 'NINGUNO' as const,
          pdvId: null,
          pdvNombre: null,
          pdvClaveBtl: null,
          pdvZona: null,
          latitud: null,
          longitud: null,
          radioToleranciaMetros: null,
          laborable: false,
          trabajaEnTienda: false,
          sedeFormacion: null,
          horarioInicio: null,
          horarioFin: null,
          flags: {},
          mensajeOperativo: null,
        }
      ),
    }))
    .sort((left, right) => left.nombreCompleto.localeCompare(right.nombreCompleto, 'es-MX'))

  return {
    month: filters.month,
    fechaInicio,
    fechaFin,
    dias: days,
    totalEmpleados: empleados.length,
    empleados,
  }
}
