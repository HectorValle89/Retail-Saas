import type {
  AsignacionDiariaResuelta,
  ConfiguracionSistema,
  CuotaEmpleadoPeriodo,
  Empleado,
  PeriodoNomina,
  Pdv,
} from '@/types/database'

export const LOVE_DAILY_QUOTA_CONFIG_KEY = 'love_isdin.cuota_diaria_default'
export const LOVE_DAILY_QUOTA_DEFAULT = 3

type LoveQuotaSupabaseClient = {
  from(table: string): any
}

type ConfiguracionQuotaRow = Pick<ConfiguracionSistema, 'clave' | 'valor'>

type PeriodoQuotaRow = Pick<PeriodoNomina, 'id' | 'fecha_inicio' | 'fecha_fin'>

type CuotaLoveRow = Pick<CuotaEmpleadoPeriodo, 'id' | 'periodo_id' | 'cuenta_cliente_id' | 'empleado_id' | 'metadata'> & {
  periodo: PeriodoQuotaRow | PeriodoQuotaRow[] | null
}

type EmpleadoQuotaRow = Pick<
  Empleado,
  'id' | 'id_nomina' | 'nombre_completo' | 'puesto' | 'supervisor_empleado_id' | 'zona' | 'estatus_laboral'
>

type PdvQuotaRow = Pick<Pdv, 'id' | 'clave_btl' | 'nombre' | 'zona' | 'cadena_id'>

type CadenaQuotaRow = {
  id: string
  nombre: string
}

type AsignacionQuotaRow = Pick<
  AsignacionDiariaResuelta,
  | 'fecha'
  | 'empleado_id'
  | 'pdv_id'
  | 'supervisor_empleado_id'
  | 'cuenta_cliente_id'
  | 'trabaja_en_tienda'
>

export interface LoveQuotaTargetRow {
  fechaOperacion: string
  weekBucket: string
  cuentaClienteId: string
  empleadoId: string
  empleadoLabel: string
  empleadoNombre: string
  idNomina: string | null
  pdvId: string
  pdvLabel: string
  pdvClaveBtl: string | null
  supervisorId: string | null
  supervisorLabel: string
  zona: string
  cadena: string
  objetivo: number
}

function getFirst<T>(value: T | T[] | null | undefined) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }

  return metadata as Record<string, unknown>
}

function normalizePositiveInteger(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return Math.max(0, Math.round(parsed))
}

function normalizeConfigQuota(rows: ConfiguracionQuotaRow[]) {
  const row = rows.find((item) => item.clave === LOVE_DAILY_QUOTA_CONFIG_KEY)
  return normalizePositiveInteger(row?.valor) ?? LOVE_DAILY_QUOTA_DEFAULT
}

function resolveLoveQuotaFromMetadata(
  metadata: unknown,
  defaultQuota: number
) {
  const normalized = normalizeMetadata(metadata)

  return (
    normalizePositiveInteger(normalized.love_objetivo_diario) ??
    normalizePositiveInteger(normalized.afiliaciones_love_objetivo_diario) ??
    normalizePositiveInteger(normalized.love_objetivo) ??
    normalizePositiveInteger(normalized.afiliaciones_love_objetivo) ??
    defaultQuota
  )
}

function addDaysIso(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function getWeekStartIso(dayIso: string) {
  const [year, month, day] = dayIso.split('-').map((value) => Number.parseInt(value, 10))
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - weekday + 1)
  return date.toISOString().slice(0, 10)
}

function getQuotaMap(rows: CuotaLoveRow[]) {
  const map = new Map<string, CuotaLoveRow[]>()

  for (const row of rows) {
    const key = `${row.empleado_id}::${row.cuenta_cliente_id}`
    const bucket = map.get(key) ?? []
    bucket.push(row)
    map.set(key, bucket)
  }

  return map
}

function findQuotaForDate(
  dateIso: string,
  rows: CuotaLoveRow[] | undefined
) {
  if (!rows || rows.length === 0) {
    return null
  }

  const candidates = rows
    .map((row) => ({ row, periodo: getFirst(row.periodo) }))
    .filter((item) => item.periodo)
    .filter((item) => item.periodo!.fecha_inicio <= dateIso && item.periodo!.fecha_fin >= dateIso)
    .sort((left, right) => right.periodo!.fecha_inicio.localeCompare(left.periodo!.fecha_inicio, 'es-MX'))

  return candidates[0]?.row ?? null
}

function inferSupervisorLabel(
  supervisorId: string | null,
  employeeById: Map<string, EmpleadoQuotaRow>
) {
  if (!supervisorId) {
    return 'Sin supervisor'
  }

  return employeeById.get(supervisorId)?.nombre_completo ?? `Supervisor ${supervisorId.slice(0, 8)}`
}

export async function fetchLoveQuotaTargetRows(
  supabase: LoveQuotaSupabaseClient,
  options: {
    accountId?: string | null
    dateFrom: string
    dateTo: string
    employeeIds?: string[]
    supervisorId?: string | null
  }
): Promise<{ data: LoveQuotaTargetRow[]; error: string | null }> {
  let assignmentQuery = supabase
    .from('asignacion_diaria_resuelta')
    .select('fecha, empleado_id, pdv_id, supervisor_empleado_id, cuenta_cliente_id, trabaja_en_tienda')

  if (!assignmentQuery || typeof assignmentQuery.limit !== 'function') {
    return { data: [], error: null }
  }

  if (typeof assignmentQuery.gte !== 'function') {
    return { data: [], error: null }
  }
  assignmentQuery = assignmentQuery.gte('fecha', options.dateFrom)

  if (typeof assignmentQuery.lte === 'function') {
    assignmentQuery = assignmentQuery.lte('fecha', options.dateTo)
  } else if (typeof assignmentQuery.lt === 'function') {
    assignmentQuery = assignmentQuery.lt('fecha', addDaysIso(options.dateTo, 1))
  } else {
    return { data: [], error: null }
  }

  if (typeof assignmentQuery.order === 'function') {
    assignmentQuery = assignmentQuery.order('fecha', { ascending: true })
  }

  if (options.accountId && typeof assignmentQuery.eq === 'function') {
    assignmentQuery = assignmentQuery.eq('cuenta_cliente_id', options.accountId)
  }

  if (options.supervisorId && typeof assignmentQuery.eq === 'function') {
    assignmentQuery = assignmentQuery.eq('supervisor_empleado_id', options.supervisorId)
  }

  if (options.employeeIds && options.employeeIds.length === 1 && typeof assignmentQuery.eq === 'function') {
    assignmentQuery = assignmentQuery.eq('empleado_id', options.employeeIds[0])
  } else if (options.employeeIds && options.employeeIds.length > 1 && typeof assignmentQuery.in === 'function') {
    assignmentQuery = assignmentQuery.in('empleado_id', options.employeeIds)
  }

  const configQuery = supabase.from('configuracion').select('clave, valor')
  const assignmentResult = await assignmentQuery.limit(10000)
  const configResult = configQuery && typeof configQuery.eq === 'function' && typeof configQuery.limit === 'function'
    ? await configQuery.eq('clave', LOVE_DAILY_QUOTA_CONFIG_KEY).limit(4)
    : { data: [], error: null }

  if (assignmentResult.error) {
    return { data: [], error: assignmentResult.error.message }
  }

  if (configResult.error) {
    return { data: [], error: configResult.error.message }
  }

  const assignmentRows = ((assignmentResult.data ?? []) as unknown as AsignacionQuotaRow[]).filter(
    (row): row is AsignacionQuotaRow & { cuenta_cliente_id: string; pdv_id: string } =>
      Boolean(row.cuenta_cliente_id && row.pdv_id && row.trabaja_en_tienda)
  )

  if (assignmentRows.length === 0) {
    return { data: [], error: null }
  }

  const employeeIds = Array.from(new Set(assignmentRows.map((row) => row.empleado_id)))
  const supervisorIds = Array.from(
    new Set(assignmentRows.map((row) => row.supervisor_empleado_id).filter((value): value is string => Boolean(value)))
  )
  const pdvIds = Array.from(new Set(assignmentRows.map((row) => row.pdv_id)))

  const [employeesResult, pdvsResult, quotasResult] = await Promise.all([
    supabase
      .from('empleado')
      .select('id, id_nomina, nombre_completo, puesto, supervisor_empleado_id, zona, estatus_laboral')
      .in('id', Array.from(new Set([...employeeIds, ...supervisorIds])))
      .limit(Math.max(employeeIds.length + supervisorIds.length, 1)),
    supabase
      .from('pdv')
      .select('id, clave_btl, nombre, zona, cadena_id')
      .in('id', pdvIds)
      .limit(Math.max(pdvIds.length, 1)),
    (() => {
      let query = supabase
        .from('cuota_empleado_periodo')
        .select('id, periodo_id, cuenta_cliente_id, empleado_id, metadata, periodo:periodo_id(id, fecha_inicio, fecha_fin)')
        .in('empleado_id', employeeIds)
        .limit(10000)

      if (options.accountId) {
        query = query.eq('cuenta_cliente_id', options.accountId)
      }

      return query
    })(),
  ])

  if (employeesResult.error) {
    return { data: [], error: employeesResult.error.message }
  }

  if (pdvsResult.error) {
    return { data: [], error: pdvsResult.error.message }
  }

  if (quotasResult.error) {
    return { data: [], error: quotasResult.error.message }
  }

  const employeeById = new Map(
    ((employeesResult.data ?? []) as unknown as EmpleadoQuotaRow[]).map((row) => [row.id, row] as const)
  )
  const pdvById = new Map(((pdvsResult.data ?? []) as unknown as PdvQuotaRow[]).map((row) => [row.id, row] as const))
  const quotaRows = (quotasResult.data ?? []) as unknown as CuotaLoveRow[]
  const quotaMap = getQuotaMap(quotaRows)

  const cadenaIds = Array.from(
    new Set(Array.from(pdvById.values()).map((row) => row.cadena_id).filter((value): value is string => Boolean(value)))
  )
  const cadenaResult =
    cadenaIds.length > 0
      ? await supabase
          .from('cadena')
          .select('id, nombre')
          .in('id', cadenaIds)
          .limit(Math.max(cadenaIds.length, 1))
      : { data: [] as CadenaQuotaRow[], error: null }

  if (cadenaResult.error) {
    return { data: [], error: cadenaResult.error.message }
  }

  const cadenaById = new Map(((cadenaResult.data ?? []) as unknown as CadenaQuotaRow[]).map((row) => [row.id, row.nombre] as const))
  const defaultQuota = normalizeConfigQuota((configResult.data ?? []) as ConfiguracionQuotaRow[])

  const rows = assignmentRows.flatMap((assignment) => {
    const employee = employeeById.get(assignment.empleado_id)
    const pdv = pdvById.get(assignment.pdv_id)

    if (!employee || employee.puesto !== 'DERMOCONSEJERO') {
      return []
    }

    const quota = findQuotaForDate(
      assignment.fecha,
      quotaMap.get(`${assignment.empleado_id}::${assignment.cuenta_cliente_id}`)
    )

    const objetivo = resolveLoveQuotaFromMetadata(quota?.metadata, defaultQuota)
    const zona = pdv?.zona ?? employee.zona ?? 'Sin zona'
    const cadena = pdv?.cadena_id ? cadenaById.get(pdv.cadena_id) ?? 'Sin cadena' : 'Sin cadena'

    return [
      {
        fechaOperacion: assignment.fecha,
        weekBucket: getWeekStartIso(assignment.fecha),
        cuentaClienteId: assignment.cuenta_cliente_id,
        empleadoId: assignment.empleado_id,
        empleadoLabel: employee.nombre_completo,
        empleadoNombre: employee.nombre_completo,
        idNomina: employee.id_nomina ?? null,
        pdvId: assignment.pdv_id,
        pdvLabel: `${pdv?.clave_btl ?? 'SIN BTL'} - ${pdv?.nombre ?? 'PDV sin nombre'}`,
        pdvClaveBtl: pdv?.clave_btl ?? null,
        supervisorId: assignment.supervisor_empleado_id ?? employee.supervisor_empleado_id ?? null,
        supervisorLabel: inferSupervisorLabel(
          assignment.supervisor_empleado_id ?? employee.supervisor_empleado_id ?? null,
          employeeById
        ),
        zona,
        cadena,
        objetivo,
      } satisfies LoveQuotaTargetRow,
    ]
  })

  return { data: rows, error: null }
}

export function computeLoveQuotaProgress(actual: number, objetivo: number) {
  const safeActual = Math.max(0, Math.round(actual))
  const safeObjetivo = Math.max(0, Math.round(objetivo))
  const cumplimientoPct =
    safeObjetivo > 0 ? Math.round((safeActual / safeObjetivo) * 10000) / 100 : 0

  return {
    actual: safeActual,
    objetivo: safeObjetivo,
    restante: Math.max(safeObjetivo - safeActual, 0),
    cumplimientoPct,
  }
}
