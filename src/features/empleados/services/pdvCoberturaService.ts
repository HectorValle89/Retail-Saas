import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { RECLUTAMIENTO_COVERAGE_TARGET_CONFIG_KEY } from '@/features/configuracion/configuracionCatalog'
import { isOperablePdvStatus, type PdvMasterStatus } from '@/features/pdvs/lib/pdvStatus'
import { getSingleTenantAccountId } from '@/lib/tenant/singleTenant'
import type { Database, Puesto } from '@/types/database'

type TypedSupabaseClient = SupabaseClient<any>
type MaybeMany<T> = T | T[] | null

export type PdvCoberturaOperativaEstado = 'CUBIERTO' | 'RESERVADO_PENDIENTE_ACCESO' | 'VACANTE'
export type PdvCoberturaMotivo =
  | 'SIN_DC'
  | 'EN_PROCESO_FIRMA'
  | 'PENDIENTE_ACCESO'
  | 'PDV_DE_PASO'
  | 'TIENDA_ESCUELA'
  | 'MOVIMIENTO_TEMPORAL'
export type RecruitmentCoverageActionNeed =
  | 'COBERTURA_OK'
  | 'PENDIENTE_ACCESO'
  | 'PENDIENTE_ACCESO_VENCIDO'
  | 'VACANTE_URGENTE'
  | 'VACANTE_EN_PROCESO_FIRMA'
  | 'PDV_INACTIVO'
export type PdvCoberturaSemaforo = 'VERDE' | 'AMARILLO' | 'NARANJA' | 'ROJO'

interface CoverageConfigRow {
  clave: string
  valor: unknown
}

interface CoveragePdvRow {
  id: string
  cuenta_cliente_id: string
  pdv_id: string
  activo: boolean
  fecha_inicio: string
  fecha_fin: string | null
  pdv: MaybeMany<{
    id: string
    nombre: string
    clave_btl: string | null
    zona: string | null
    estatus: PdvMasterStatus | null
    cadena: MaybeMany<{ nombre: string | null }>
    ciudad: MaybeMany<{ nombre: string | null }>
  }>
}

interface CoverageOverlayRow {
  id: string
  cuenta_cliente_id: string
  pdv_id: string
  estado_operativo: PdvCoberturaOperativaEstado
  motivo_operativo: PdvCoberturaMotivo | null
  empleado_reservado_id: string | null
  pdv_paso_id: string | null
  acceso_pendiente_desde: string | null
  proximo_recordatorio_at: string | null
  apartado_por_usuario_id: string | null
  observaciones: string | null
  metadata: Record<string, unknown> | null
}

interface CoverageAssignmentRow {
  id: string
  cuenta_cliente_id: string | null
  empleado_id: string
  supervisor_empleado_id: string | null
  pdv_id: string
  fecha_inicio: string
  fecha_fin: string | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
}

interface CoverageEmployeeRow {
  id: string
  nombre_completo: string
  puesto: Puesto
  estatus_laboral: 'ACTIVO' | 'SUSPENDIDO' | 'BAJA'
  supervisor_empleado_id: string | null
  metadata: Record<string, unknown> | null
}

interface CoverageUserRow {
  empleado_id: string
  cuenta_cliente_id: string | null
}

export interface RecruitmentCoverageSummary {
  target: number
  plantillaActiva: number
  plantillaEsperaTransito: number
  totalContratadas: number
  brechaContratacion: number
  progressPct: number
  pdvsCubiertos: number
  pdvsReservados: number
  pdvsVacantes: number
  pdvsBloqueados: number
  vacantesUrgentes: number
  pendientesAcceso: number
  pendientesAccesoVencidos: number
  vacantesEnProcesoFirma: number
  listosAdministracion: number
  proximasIsdinizaciones: number
}

export interface PdvCoberturaBoardItem {
  coberturaOperativaId: string | null
  cuentaClienteId: string
  pdvId: string
  nombre: string
  claveBtl: string | null
  cadena: string | null
  ciudad: string | null
  zona: string | null
  estadoMaestro: PdvMasterStatus
  estadoMaestroLabel: string
  semaforo: PdvCoberturaSemaforo
  semaforoLabel: string
  estadoOperativo: PdvCoberturaOperativaEstado | null
  estadoOperativoLabel: string
  motivoOperativo: PdvCoberturaMotivo | null
  motivoOperativoLabel: string | null
  actionNeed: RecruitmentCoverageActionNeed
  actionNeedLabel: string
  employeeId: string | null
  employeeName: string | null
  employeeSupervisorId: string | null
  employeeSupervisorName: string | null
  candidateId: string | null
  candidateName: string | null
  candidateWorkflowStage: string | null
  pdvPasoId: string | null
  pdvPasoNombre: string | null
  accesoPendienteDesde: string | null
  proximoRecordatorioAt: string | null
  diasEsperandoAcceso: number | null
  overdue: boolean
  responsableSugerido: string
  observaciones: string | null
  reserved: boolean
}

export interface RecruitmentCoverageBoardData {
  summary: RecruitmentCoverageSummary
  items: PdvCoberturaBoardItem[]
  target: number
}

function getTodayIso(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function getAccountId(actor?: ActorActual | null, accountId?: string | null) {
  return actor?.cuentaClienteId ?? accountId ?? getSingleTenantAccountId()
}

function first<T>(value: MaybeMany<T>) {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function mapRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function mapString(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function isDateWithinRange(start: string, end: string | null, target: string) {
  return start <= target && (!end || end >= target)
}

function parseOnboarding(metadata: Record<string, unknown>) {
  const onboarding = mapRecord(metadata.onboarding_operativo)
  return {
    pdvObjetivoId: mapString(onboarding.pdv_objetivo_id),
    fechaIsdinizacion: mapString(onboarding.fecha_isdinizacion),
    adminAccessPending: metadata.admin_access_pending === true,
  }
}

function differenceInDays(startIso: string | null, now = new Date()) {
  if (!startIso) {
    return null
  }

  const start = new Date(`${startIso.slice(0, 10)}T12:00:00`)
  const current = new Date(`${getTodayIso(now)}T12:00:00`)
  const diff = current.getTime() - start.getTime()
  return diff < 0 ? 0 : Math.floor(diff / (24 * 60 * 60 * 1000))
}

function addHoursIso(value: string, hours: number) {
  const date = new Date(value)
  date.setHours(date.getHours() + hours)
  return date.toISOString()
}

function labelForMasterStatus(status: PdvMasterStatus) {
  switch (status) {
    case 'ACTIVO':
      return 'Activo'
    case 'TEMPORAL':
      return 'Temporal'
    default:
      return 'Inactivo / bloqueado'
  }
}

function labelForOperationalState(state: PdvCoberturaOperativaEstado | null, master: PdvMasterStatus) {
  if (!state) {
    return master === 'INACTIVO' ? 'Inactivo / bloqueado' : 'Sin clasificacion'
  }

  switch (state) {
    case 'CUBIERTO':
      return 'Activo y cubierto'
    case 'RESERVADO_PENDIENTE_ACCESO':
      return 'Asignado / pendiente de acceso'
    default:
      return 'Vacante'
  }
}

function labelForMotivo(motivo: PdvCoberturaMotivo | null) {
  switch (motivo) {
    case 'EN_PROCESO_FIRMA':
      return 'En proceso de firma'
    case 'PENDIENTE_ACCESO':
      return 'Pendiente de acceso'
    case 'PDV_DE_PASO':
      return 'En PDV de paso'
    case 'TIENDA_ESCUELA':
      return 'Tienda escuela'
    case 'MOVIMIENTO_TEMPORAL':
      return 'Movimiento temporal'
    case 'SIN_DC':
      return 'Sin DC'
    default:
      return null
  }
}

function labelForActionNeed(actionNeed: RecruitmentCoverageActionNeed) {
  switch (actionNeed) {
    case 'PENDIENTE_ACCESO_VENCIDO':
      return 'Pendiente de acceso >48h'
    case 'PENDIENTE_ACCESO':
      return 'Pendiente de acceso'
    case 'VACANTE_EN_PROCESO_FIRMA':
      return 'Vacante en proceso de firma'
    case 'VACANTE_URGENTE':
      return 'Vacante urgente'
    case 'PDV_INACTIVO':
      return 'Sin accion operativa'
    default:
      return 'Cobertura estable'
  }
}

function labelForSemaforo(semaforo: PdvCoberturaSemaforo) {
  switch (semaforo) {
    case 'VERDE':
      return 'Cubierto'
    case 'AMARILLO':
      return 'Pendiente acceso'
    case 'NARANJA':
      return 'Vacante'
    default:
      return 'Inactivo'
  }
}

async function sendPendingAccessReminder(
  supabase: TypedSupabaseClient,
  item: PdvCoberturaBoardItem,
  actor: ActorActual | null
) {
  if (!item.coberturaOperativaId || !item.employeeSupervisorId) {
    return
  }

  const title = `Pendiente de acceso PDV ${item.claveBtl ?? item.nombre}`
  const body = `${item.employeeName ?? 'La DC reservada'} sigue sin acceso a ${item.nombre}. Revisa desbloqueo con la cadena y actualiza la cobertura.`
  const metadata = {
    source: 'pdv_cobertura_operativa',
    pdv_id: item.pdvId,
    empleado_reservado_id: item.employeeId,
    action_need: item.actionNeed,
    send_reason: 'PENDIENTE_ACCESO_OVERDUE',
  }

  const { data: mensaje, error: mensajeError } = await supabase
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: item.cuentaClienteId,
      creado_por_usuario_id: actor?.usuarioId ?? null,
      titulo: title,
      cuerpo: body,
      tipo: 'MENSAJE',
      grupo_destino: 'SUPERVISOR',
      zona: item.zona,
      supervisor_empleado_id: item.employeeSupervisorId,
      opciones_respuesta: [],
      metadata,
    })
    .select('id')
    .maybeSingle()

  if (!mensajeError && mensaje?.id) {
    await supabase.from('mensaje_receptor').insert({
      mensaje_id: mensaje.id,
      cuenta_cliente_id: item.cuentaClienteId,
      empleado_id: item.employeeSupervisorId,
      estado: 'PENDIENTE',
      metadata: {
        pdv_id: item.pdvId,
        empleado_reservado_id: item.employeeId,
        type: 'PDV_COBERTURA_RECORDATORIO',
      },
    })
  }

  await supabase
    .from('pdv_cobertura_operativa')
    .update({
      proximo_recordatorio_at: addHoursIso(new Date().toISOString(), 48),
      metadata: {
        last_reminder_sent_at: new Date().toISOString(),
      },
    })
    .eq('id', item.coberturaOperativaId)
}

export async function buildRecruitmentCoverageBoard(
  supabase: TypedSupabaseClient,
  options: {
    actor?: ActorActual | null
    accountId?: string | null
    emitSideEffects?: boolean
    now?: Date
  } = {}
): Promise<RecruitmentCoverageBoardData> {
  const now = options.now ?? new Date()
  const today = getTodayIso(now)
  const accountId = getAccountId(options.actor, options.accountId)

  const [configResult, relacionesResult, overlaysResult, assignmentsResult, usersResult] =
    await Promise.all([
      supabase
        .from('configuracion')
        .select('clave, valor')
        .in('clave', [RECLUTAMIENTO_COVERAGE_TARGET_CONFIG_KEY]),
      supabase
        .from('cuenta_cliente_pdv')
        .select(`
          id,
          cuenta_cliente_id,
          pdv_id,
          activo,
          fecha_inicio,
          fecha_fin,
          pdv:pdv_id(
            id,
            nombre,
            clave_btl,
            zona,
            estatus,
            cadena:cadena_id(nombre),
            ciudad:ciudad_id(nombre)
          )
        `)
        .eq('cuenta_cliente_id', accountId)
        .eq('activo', true)
        .order('fecha_inicio', { ascending: false }),
      supabase
        .from('pdv_cobertura_operativa')
        .select(
          'id, cuenta_cliente_id, pdv_id, estado_operativo, motivo_operativo, empleado_reservado_id, pdv_paso_id, acceso_pendiente_desde, proximo_recordatorio_at, apartado_por_usuario_id, observaciones, metadata'
        )
        .eq('cuenta_cliente_id', accountId),
      supabase
        .from('asignacion')
        .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion')
        .eq('cuenta_cliente_id', accountId)
        .eq('estado_publicacion', 'PUBLICADA')
        .lte('fecha_inicio', today)
        .or(`fecha_fin.is.null,fecha_fin.gte.${today}`),
      supabase
        .from('usuario')
        .select('empleado_id, cuenta_cliente_id')
        .eq('cuenta_cliente_id', accountId),
    ])

  const errorMessage = [
    configResult.error?.message,
    relacionesResult.error?.message,
    overlaysResult.error?.message,
    assignmentsResult.error?.message,
    usersResult.error?.message,
  ]
    .filter(Boolean)
    .join(' ')

  if (errorMessage) {
    throw new Error(errorMessage)
  }

  const target = (() => {
    const row = ((configResult.data ?? []) as CoverageConfigRow[]).find(
      (item) => item.clave === RECLUTAMIENTO_COVERAGE_TARGET_CONFIG_KEY
    )
    const parsed = typeof row?.valor === 'number' ? row.valor : Number(row?.valor)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 250
  })()

  const accountEmployeeIds = new Set(
    ((usersResult.data ?? []) as CoverageUserRow[])
      .map((item) => item.empleado_id)
      .filter((value): value is string => Boolean(value))
  )
  const employeesQuery = supabase
    .from('empleado')
    .select('id, nombre_completo, puesto, estatus_laboral, supervisor_empleado_id, metadata')
    .order('nombre_completo', { ascending: true })
  const employeesResult = accountEmployeeIds.size > 0
    ? await employeesQuery.in('id', Array.from(accountEmployeeIds))
    : await employeesQuery

  if (employeesResult.error) {
    throw new Error(employeesResult.error.message)
  }

  const employees = (employeesResult.data ?? []) as CoverageEmployeeRow[]
  const employeeMap = new Map(employees.map((item) => [item.id, item] as const))
  const overlayMap = new Map(
    ((overlaysResult.data ?? []) as CoverageOverlayRow[]).map((item) => [item.pdv_id, item] as const)
  )
  const activeAssignments = ((assignmentsResult.data ?? []) as CoverageAssignmentRow[]).filter((item) =>
    isDateWithinRange(item.fecha_inicio, item.fecha_fin, today)
  )
  const assignmentByPdv = new Map<string, CoverageAssignmentRow>()
  for (const assignment of activeAssignments) {
    if (!assignmentByPdv.has(assignment.pdv_id)) {
      assignmentByPdv.set(assignment.pdv_id, assignment)
    }
  }

  const pipelineStages = new Set([
    'SELECCION_APROBADA',
    'PENDIENTE_IMSS_NOMINA',
    'EN_FLUJO_IMSS',
    'PENDIENTE_VALIDACION_FINAL',
    'PENDIENTE_ACCESO_ADMIN',
    'RECLUTAMIENTO_CORRECCION_ALTA',
  ])
  const candidateByPdv = new Map<string, CoverageEmployeeRow>()
  const upcomingLimit = new Date(now)
  upcomingLimit.setDate(upcomingLimit.getDate() + 7)

  let listosAdministracion = 0
  let proximasIsdinizaciones = 0

  for (const employee of employees) {
    const metadata = mapRecord(employee.metadata)
    const onboarding = parseOnboarding(metadata)
    const stage = mapString(metadata.workflow_stage)

    if (onboarding.adminAccessPending || stage === 'PENDIENTE_ACCESO_ADMIN') {
      listosAdministracion += 1
    }

    if (onboarding.fechaIsdinizacion) {
      const fecha = new Date(`${onboarding.fechaIsdinizacion.slice(0, 10)}T12:00:00`)
      if (fecha >= new Date(`${today}T00:00:00`) && fecha <= upcomingLimit) {
        proximasIsdinizaciones += 1
      }
    }

    if (!onboarding.pdvObjetivoId || !stage || !pipelineStages.has(stage)) {
      continue
    }

    if (!candidateByPdv.has(onboarding.pdvObjetivoId)) {
      candidateByPdv.set(onboarding.pdvObjetivoId, employee)
    }
  }

  const relations = ((relacionesResult.data ?? []) as CoveragePdvRow[])
    .filter((item) => item.activo && (!item.fecha_fin || item.fecha_fin >= today))

  const pdvNameMap = new Map<string, string>()
  for (const relation of relations) {
    const pdv = first(relation.pdv)
    if (pdv?.id) {
      pdvNameMap.set(pdv.id, pdv.nombre)
    }
  }

  const items = relations
    .map((relation) => {
      const pdv = first(relation.pdv)
      if (!pdv?.id || !pdv.estatus) {
        return null
      }

      const cadena = first(pdv.cadena)
      const ciudad = first(pdv.ciudad)
      const overlay = overlayMap.get(pdv.id) ?? null
      const assignment = assignmentByPdv.get(pdv.id) ?? null
      const candidate = candidateByPdv.get(pdv.id) ?? null
      const isReserved = overlay?.estado_operativo === 'RESERVADO_PENDIENTE_ACCESO'
      const derivedState: PdvCoberturaOperativaEstado | null = isOperablePdvStatus(pdv.estatus)
        ? assignment
          ? 'CUBIERTO'
          : 'VACANTE'
        : null
      const estadoOperativo = pdv.estatus === 'INACTIVO'
        ? null
        : isReserved
          ? 'RESERVADO_PENDIENTE_ACCESO'
          : derivedState
      const reservedEmployee = overlay?.empleado_reservado_id
        ? employeeMap.get(overlay.empleado_reservado_id) ?? null
        : null
      const assignedEmployee = assignment?.empleado_id
        ? employeeMap.get(assignment.empleado_id) ?? null
        : null
      const employee = reservedEmployee ?? assignedEmployee ?? null
      const employeeSupervisor = employee?.supervisor_empleado_id
        ? employeeMap.get(employee.supervisor_empleado_id) ?? null
        : null
      const motivoOperativo = pdv.estatus === 'INACTIVO'
        ? null
        : isReserved
          ? overlay?.motivo_operativo ?? 'PENDIENTE_ACCESO'
          : candidate && !assignment
            ? 'EN_PROCESO_FIRMA'
            : overlay?.motivo_operativo ?? (assignment ? null : 'SIN_DC')
      const semaforo: PdvCoberturaSemaforo =
        pdv.estatus === 'INACTIVO'
          ? 'ROJO'
          : estadoOperativo === 'CUBIERTO'
            ? 'VERDE'
            : estadoOperativo === 'RESERVADO_PENDIENTE_ACCESO'
              ? 'AMARILLO'
              : 'NARANJA'
      const diasEsperandoAcceso = differenceInDays(overlay?.acceso_pendiente_desde ?? null, now)
      const overdue = Boolean(
        semaforo === 'AMARILLO' &&
          overlay?.proximo_recordatorio_at &&
          new Date(overlay.proximo_recordatorio_at) <= now
      )
      const actionNeed: RecruitmentCoverageActionNeed =
        semaforo === 'ROJO'
          ? 'PDV_INACTIVO'
          : semaforo === 'VERDE'
            ? 'COBERTURA_OK'
            : semaforo === 'AMARILLO'
              ? overdue
                ? 'PENDIENTE_ACCESO_VENCIDO'
                : 'PENDIENTE_ACCESO'
              : candidate
                ? 'VACANTE_EN_PROCESO_FIRMA'
                : 'VACANTE_URGENTE'
      const responsableSugerido =
        semaforo === 'VERDE'
          ? 'Operacion estable'
          : semaforo === 'ROJO'
            ? 'Administracion comercial'
            : semaforo === 'AMARILLO'
              ? employeeSupervisor?.nombre_completo ?? 'Coordinacion de cuenta'
              : candidate
                ? 'Reclutamiento'
                : 'Reclutamiento'

      return {
        coberturaOperativaId: overlay?.id ?? null,
        cuentaClienteId: relation.cuenta_cliente_id,
        pdvId: pdv.id,
        nombre: pdv.nombre,
        claveBtl: pdv.clave_btl,
        cadena: cadena?.nombre ?? null,
        ciudad: ciudad?.nombre ?? null,
        zona: pdv.zona ?? null,
        estadoMaestro: pdv.estatus,
        estadoMaestroLabel: labelForMasterStatus(pdv.estatus),
        semaforo,
        semaforoLabel: labelForSemaforo(semaforo),
        estadoOperativo,
        estadoOperativoLabel: labelForOperationalState(estadoOperativo, pdv.estatus),
        motivoOperativo,
        motivoOperativoLabel: labelForMotivo(motivoOperativo),
        actionNeed,
        actionNeedLabel: labelForActionNeed(actionNeed),
        employeeId: employee?.id ?? null,
        employeeName: employee?.nombre_completo ?? null,
        employeeSupervisorId: employeeSupervisor?.id ?? null,
        employeeSupervisorName: employeeSupervisor?.nombre_completo ?? null,
        candidateId: candidate?.id ?? null,
        candidateName: candidate?.nombre_completo ?? null,
        candidateWorkflowStage: candidate ? mapString(mapRecord(candidate.metadata).workflow_stage) : null,
        pdvPasoId: overlay?.pdv_paso_id ?? null,
        pdvPasoNombre: overlay?.pdv_paso_id ? pdvNameMap.get(overlay.pdv_paso_id) ?? null : null,
        accesoPendienteDesde: overlay?.acceso_pendiente_desde ?? null,
        proximoRecordatorioAt: overlay?.proximo_recordatorio_at ?? null,
        diasEsperandoAcceso,
        overdue,
        responsableSugerido,
        observaciones: overlay?.observaciones ?? null,
        reserved: isReserved,
      } satisfies PdvCoberturaBoardItem
    })
    .filter((item): item is PdvCoberturaBoardItem => Boolean(item))
    .sort((left, right) => {
      const weight = { AMARILLO: 0, NARANJA: 1, VERDE: 2, ROJO: 3 }
      return weight[left.semaforo] - weight[right.semaforo] || left.nombre.localeCompare(right.nombre, 'es-MX')
    })

  if (options.emitSideEffects) {
    const normalizedRows = items
      .filter((item) => item.estadoMaestro !== 'INACTIVO' && item.estadoOperativo && item.estadoOperativo !== 'RESERVADO_PENDIENTE_ACCESO')
      .map((item) => {
        const existing = overlayMap.get(item.pdvId)
        return {
          id: existing?.id,
          cuenta_cliente_id: item.cuentaClienteId,
          pdv_id: item.pdvId,
          estado_operativo: item.estadoOperativo,
          motivo_operativo: item.motivoOperativo === 'EN_PROCESO_FIRMA' ? 'SIN_DC' : item.motivoOperativo,
          empleado_reservado_id: existing?.empleado_reservado_id ?? item.employeeId,
          pdv_paso_id: existing?.pdv_paso_id ?? null,
          acceso_pendiente_desde: existing?.acceso_pendiente_desde ?? null,
          proximo_recordatorio_at: existing?.proximo_recordatorio_at ?? null,
          apartado_por_usuario_id: existing?.apartado_por_usuario_id ?? null,
          observaciones: existing?.observaciones ?? null,
          metadata: existing?.metadata ?? {},
        }
      })

    if (normalizedRows.length > 0) {
      await supabase.from('pdv_cobertura_operativa').upsert(normalizedRows, {
        onConflict: 'cuenta_cliente_id,pdv_id',
      })
    }

    const overdueItems = items.filter(
      (item) => item.actionNeed === 'PENDIENTE_ACCESO_VENCIDO' && item.employeeSupervisorId
    )

    for (const item of overdueItems) {
      await sendPendingAccessReminder(supabase, item, options.actor ?? null)
    }
  }

  const activeEmployeeIds = new Set(
    items
      .filter((item) => item.semaforo === 'VERDE')
      .map((item) => item.employeeId)
      .filter((value): value is string => Boolean(value))
  )
  const waitingEmployeeIds = new Set(
    items
      .filter((item) => item.semaforo === 'AMARILLO')
      .map((item) => item.employeeId)
      .filter((value): value is string => Boolean(value))
  )
  const totalContratadas = employees.filter(
    (item) => item.puesto === 'DERMOCONSEJERO' && item.estatus_laboral === 'ACTIVO'
  ).length

  const summary: RecruitmentCoverageSummary = {
    target,
    plantillaActiva: activeEmployeeIds.size,
    plantillaEsperaTransito: waitingEmployeeIds.size,
    totalContratadas,
    brechaContratacion: Math.max(target - totalContratadas, 0),
    progressPct: target > 0 ? Math.min(100, Math.round((totalContratadas / target) * 100)) : 0,
    pdvsCubiertos: items.filter((item) => item.semaforo === 'VERDE').length,
    pdvsReservados: items.filter((item) => item.semaforo === 'AMARILLO').length,
    pdvsVacantes: items.filter((item) => item.semaforo === 'NARANJA').length,
    pdvsBloqueados: items.filter((item) => item.semaforo === 'ROJO').length,
    vacantesUrgentes: items.filter((item) => item.actionNeed === 'VACANTE_URGENTE').length,
    pendientesAcceso: items.filter((item) => item.semaforo === 'AMARILLO').length,
    pendientesAccesoVencidos: items.filter((item) => item.actionNeed === 'PENDIENTE_ACCESO_VENCIDO').length,
    vacantesEnProcesoFirma: items.filter((item) => item.actionNeed === 'VACANTE_EN_PROCESO_FIRMA').length,
    listosAdministracion,
    proximasIsdinizaciones,
  }

  return {
    summary,
    items,
    target,
  }
}

