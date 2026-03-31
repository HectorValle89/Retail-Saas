'use server'

import { revalidatePath } from 'next/cache'
import { requerirActorActivo } from '@/lib/auth/session'
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  getWeekDayLabel,
  getWeekEndIso,
  getNextWeekStartIso,
  isAssignmentActiveForWeek,
  normalizeWeekStart,
} from './lib/weeklyRoute'
import {
  parseRutaSemanalWorkflowMetadata,
  parseRutaVisitaWorkflowMetadata,
  serializeRutaSemanalWorkflowMetadata,
  serializeRutaVisitaWorkflowMetadata,
  type RutaApprovalState,
  type RutaChangeRequestType,
} from './lib/routeWorkflow'
import {
  agendaEventNeedsCoordination,
  normalizeAgendaEventType,
  normalizeAgendaImpactMode,
  parseRutaAgendaEventMetadata,
  serializeRutaAgendaEventMetadata,
} from './lib/routeAgenda'
import { SUPERVISOR_CHECKLIST_ITEMS } from './lib/supervisorVisitChecklist'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ESTADO_RUTA_INICIAL, type RutaActionState } from './state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

const RUTA_EVIDENCIAS_BUCKET = 'operacion-evidencias'
const RUTA_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function buildState(partial: Partial<RutaActionState>): RutaActionState {
  return {
    ...ESTADO_RUTA_INICIAL,
    ...partial,
  }
}

async function requerirSupervisorRutaEditable() {
  const actor = await requerirActorActivo()

  if (actor.puesto !== 'SUPERVISOR') {
    throw new Error('Solo SUPERVISOR puede editar la ruta semanal.')
  }

  return actor
}

function normalizeText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function asUploadedFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || !(value instanceof File) || value.size === 0) {
    return null
  }

  return value
}

async function ensureBucket(service: TypedSupabaseClient) {
  const { error } = await service.storage.createBucket(RUTA_EVIDENCIAS_BUCKET, {
    public: false,
    fileSizeLimit: `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`,
    allowedMimeTypes: RUTA_ALLOWED_MIME_TYPES,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

async function uploadRutaEvidence(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    cuentaClienteId,
    supervisorEmpleadoId,
    file,
    evidenceKind,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    supervisorEmpleadoId: string
    file: File
    evidenceKind: 'selfie' | 'evidencia'
  }
) {
  if (exceedsOperationalDocumentUploadLimit(file)) {
    throw new Error(buildOperationalDocumentUploadLimitMessage('evidencia', file))
  }

  if (!RUTA_ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('La evidencia debe ser imagen JPEG/PNG/WEBP o PDF.')
  }

  await ensureBucket(service)
  return storeOptimizedEvidence({
    service,
    bucket: RUTA_EVIDENCIAS_BUCKET,
    actorUsuarioId,
    storagePrefix: `ruta-semanal/${cuentaClienteId}/${supervisorEmpleadoId}/${evidenceKind}`,
    file,
  })
}

function normalizeInt(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(String(value ?? '').trim())

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} invalido.`)
  }

  return parsed
}

function buildChecklist(formData: FormData) {
  return Object.fromEntries(
    SUPERVISOR_CHECKLIST_ITEMS.map((item) => [
      item.key,
      String(formData.get(`checklist_${item.key}`) ?? '').trim() === 'true',
    ])
  )
}

function normalizeOptionalNonNegativeInt(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return null
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('La cantidad de registros Love ISDIN debe ser un entero igual o mayor a cero.')
  }

  return parsed
}

function normalizeFloat(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeGpsState(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().toUpperCase()

  if (
    normalized === 'DENTRO_GEOCERCA' ||
    normalized === 'FUERA_GEOCERCA' ||
    normalized === 'SIN_GPS' ||
    normalized === 'PENDIENTE'
  ) {
    return normalized
  }

  return 'PENDIENTE'
}

function resolveRouteStatusFromApprovalState(approvalState: RutaApprovalState) {
  if (approvalState === 'APROBADA') {
    return 'PUBLICADA' as const
  }

  return 'BORRADOR' as const
}

function isRutaMetadataMissingError(message: string | null | undefined) {
  const normalized = String(message ?? '').toLowerCase()
  return (
    normalized.includes('ruta_semanal.metadata') ||
    (normalized.includes('column') && normalized.includes('metadata'))
  )
}

function isRutaAgendaInfrastructureMissingError(message: string | null | undefined) {
  const normalized = String(message ?? '').toLowerCase()
  return (
    normalized.includes("public.ruta_agenda_evento") ||
    normalized.includes("public.ruta_visita_pendiente_reposicion") ||
    normalized.includes('ruta_agenda_evento') ||
    normalized.includes('ruta_visita_pendiente_reposicion')
  )
}

function buildAgendaInfrastructureState() {
  return buildState({
    message:
      'La agenda operativa dinamica aun no esta disponible en esta base. Aplica la migracion 20260326213000_ruta_agenda_operativa.sql para habilitar eventos del dia y reposiciones.',
  })
}

function getAgendaInfrastructureMessage() {
  return (
    buildAgendaInfrastructureState().message ??
    'La agenda operativa dinamica aun no esta disponible en esta base.'
  )
}

function normalizeJsonStringArray(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return [] as string[]
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('invalid')
    }

    return parsed
      .map((item) => String(item ?? '').trim())
      .filter((item) => item.length > 0)
  } catch {
    throw new Error(`${label} invalido.`)
  }
}

async function syncAgendaEventRepositions({
  supabase,
  actorUsuarioId,
  routeId,
  supervisorEmpleadoId,
  cuentaClienteId,
  agendaEventoId,
  fechaOperacion,
  displacedVisitIds,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  actorUsuarioId: string
  routeId: string
  supervisorEmpleadoId: string
  cuentaClienteId: string
  agendaEventoId: string
  fechaOperacion: string
  displacedVisitIds: string[]
}) {
  if (displacedVisitIds.length === 0) {
    return
  }

  const { data: existing } = await supabase
    .from('ruta_visita_pendiente_reposicion')
    .select('ruta_semanal_visita_id')
    .eq('ruta_semanal_id', routeId)
    .eq('clasificacion', 'JUSTIFICADA')
    .in('ruta_semanal_visita_id', displacedVisitIds)

  const alreadyQueued = new Set((existing ?? []).map((item) => item.ruta_semanal_visita_id))

  const { data: visits } = await supabase
    .from('ruta_semanal_visita')
    .select('id, pdv_id')
    .eq('ruta_semanal_id', routeId)
    .in('id', displacedVisitIds)

  const rows = (visits ?? [])
    .filter((item) => !alreadyQueued.has(item.id))
    .map((item) => ({
      cuenta_cliente_id: cuentaClienteId,
      ruta_semanal_id: routeId,
      ruta_semanal_visita_id: item.id,
      agenda_evento_id: agendaEventoId,
      supervisor_empleado_id: supervisorEmpleadoId,
      pdv_id: item.pdv_id,
      fecha_origen: fechaOperacion,
      semana_sugerida_inicio: getNextWeekStartIso(fechaOperacion),
      clasificacion: 'JUSTIFICADA',
      motivo: 'La visita fue desplazada por una sobreposicion operativa aprobada.',
      estado: 'PENDIENTE',
      metadata: {
        source: 'AGENDA_EVENTO',
        created_by_usuario_id: actorUsuarioId,
      },
    }))

  if (rows.length === 0) {
    return
  }

  const { error } = await supabase.from('ruta_visita_pendiente_reposicion').insert(rows)
  if (error) {
    if (isRutaAgendaInfrastructureMissingError(error.message)) {
      throw new Error(getAgendaInfrastructureMessage())
    }
    throw error
  }
}

type RutaSemanalLookupRow = {
  id: string
  cuenta_cliente_id: string
  supervisor_empleado_id: string
  semana_inicio: string
  metadata: unknown
}

type RutaSemanalLookupFallbackRow = Omit<RutaSemanalLookupRow, 'metadata'>

type AsignacionQuotaBaseRow = {
  pdv_id: string
  cuenta_cliente_id: string | null
  fecha_inicio: string
  fecha_fin: string | null
  estado_publicacion: string
  supervisor_empleado_id: string
}

async function requerirCoordinadorRuta() {
  const actor = await requerirActorActivo()

  if (actor.puesto !== 'COORDINADOR' && actor.puesto !== 'ADMINISTRADOR') {
    throw new Error('Solo COORDINADOR o ADMINISTRADOR pueden revisar rutas.')
  }

  return actor
}

async function registrarEventoAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    tabla,
    registroId,
    cuentaClienteId,
    usuarioId,
    payload,
  }: {
    tabla: string
    registroId: string
    cuentaClienteId: string
    usuarioId: string
    payload: Record<string, unknown>
  }
) {
  await supabase.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: usuarioId,
    cuenta_cliente_id: cuentaClienteId,
  })
}

export async function agregarVisitaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable()
    const supabase = await createClient()
    const semanaInicio = normalizeWeekStart(String(formData.get('semana_inicio') ?? '').trim())
    const semanaFin = getWeekEndIso(semanaInicio)
    const diaSemana = normalizeInt(formData.get('dia_semana'), 'Dia')
    const orden = normalizeInt(formData.get('orden'), 'Orden')
    const pdvId = String(formData.get('pdv_id') ?? '').trim()
    const notas = normalizeText(formData.get('notas'))

    if (!pdvId) {
      return buildState({ message: 'El PDV es obligatorio para planificar la visita.' })
    }

    const { data: asignaciones, error: asignacionError } = await supabase
      .from('asignacion')
      .select('id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion')
      .eq('supervisor_empleado_id', actor.empleadoId)
      .eq('pdv_id', pdvId)
      .order('created_at', { ascending: false })
      .limit(40)

    if (asignacionError) {
      return buildState({ message: asignacionError.message })
    }

    const asignacionActiva = (asignaciones ?? []).find((item) =>
      isAssignmentActiveForWeek(item, semanaInicio, semanaFin)
    )

    if (!asignacionActiva || !asignacionActiva.cuenta_cliente_id) {
      return buildState({
        message: 'El PDV seleccionado no tiene una asignacion activa y publicada para esa semana.',
      })
    }

    const { data: rutaExistente } = await supabase
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, estatus')
      .eq('supervisor_empleado_id', actor.empleadoId)
      .eq('semana_inicio', semanaInicio)
      .maybeSingle()

    let rutaId = rutaExistente?.id ?? null

    if (!rutaId) {
      const { data: nuevaRuta, error: createRouteError } = await supabase
        .from('ruta_semanal')
        .insert({
          cuenta_cliente_id: asignacionActiva.cuenta_cliente_id,
          supervisor_empleado_id: actor.empleadoId,
          semana_inicio: semanaInicio,
          estatus: 'PUBLICADA',
          notas,
          created_by_usuario_id: actor.usuarioId,
          updated_by_usuario_id: actor.usuarioId,
        })
        .select('id')
        .maybeSingle()

      if (createRouteError || !nuevaRuta) {
        return buildState({ message: createRouteError?.message ?? 'No fue posible crear la ruta semanal.' })
      }

      rutaId = nuevaRuta.id
    } else if (notas) {
      await supabase
        .from('ruta_semanal')
        .update({
          notas,
          updated_by_usuario_id: actor.usuarioId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rutaId)
    }

    const { data: visita, error: createVisitError } = await supabase
      .from('ruta_semanal_visita')
      .insert({
        ruta_semanal_id: rutaId,
        cuenta_cliente_id: asignacionActiva.cuenta_cliente_id,
        supervisor_empleado_id: actor.empleadoId,
        pdv_id: pdvId,
        asignacion_id: asignacionActiva.id,
        dia_semana: diaSemana,
        orden,
      })
      .select('id')
      .maybeSingle()

    if (createVisitError || !visita) {
      return buildState({
        message: createVisitError?.message ?? 'No fue posible programar la visita en la ruta semanal.',
      })
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_semanal_visita',
      registroId: visita.id,
      cuentaClienteId: asignacionActiva.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_visita_programada',
        ruta_semanal_id: rutaId,
        asignacion_id: asignacionActiva.id,
        pdv_id: pdvId,
        semana_inicio: semanaInicio,
        dia_semana: diaSemana,
        orden,
      },
    })

    revalidatePath('/ruta-semanal')

    return buildState({
      ok: true,
      message: 'Visita agregada a la ruta semanal.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible agregar la visita.',
    })
  }
}

type RouteCanvasVisitPayload = {
  visitId?: string | null
  pdvId: string
  day: number
  notes?: string | null
}

type RouteChangeRequestProposalPayload = {
  pdvId: string
  order: number
}

function buildRouteVisitUniqueKey(day: number, pdvId: string) {
  return `${day}:${pdvId}`
}

function parseRouteCanvasPayload(raw: string) {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('La planeacion semanal no tiene un formato valido.')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('La planeacion semanal debe enviarse como una lista de visitas.')
  }

  const normalized = parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`La visita ${index + 1} no tiene un formato valido.`)
    }

    const source = item as Record<string, unknown>
    const pdvId = String(source.pdvId ?? '').trim()
    const day = Number(source.day)
    const notes = typeof source.notes === 'string' && source.notes.trim() ? source.notes.trim() : null
    const visitId =
      typeof source.visitId === 'string' && source.visitId.trim() ? source.visitId.trim() : null

    if (!pdvId) {
      throw new Error(`La visita ${index + 1} no tiene PDV asignado.`)
    }

    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new Error(`La visita ${index + 1} tiene un dia invalido.`)
    }

    return {
      visitId,
      pdvId,
      day,
      notes,
    } satisfies RouteCanvasVisitPayload
  })

  const seenKeys = new Set<string>()
  for (const visit of normalized) {
    const uniqueKey = buildRouteVisitUniqueKey(visit.day, visit.pdvId)
    if (seenKeys.has(uniqueKey)) {
      throw new Error('No puedes repetir la misma tienda en el mismo dia dentro de la ruta.')
    }
    seenKeys.add(uniqueKey)
  }

  return normalized
}

function normalizeChangeRequestType(raw: string): RutaChangeRequestType {
  if (raw === 'CAMBIO_DIA' || raw === 'CANCELACION_DIA' || raw === 'CAMBIO_TIENDA') {
    return raw
  }

  throw new Error('Selecciona un tipo valido de cambio de ruta.')
}

function parseRouteChangeProposalPayload(raw: string) {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('La propuesta de ruta del dia no tiene un formato valido.')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('La propuesta de ruta del dia debe enviarse como lista de tiendas.')
  }

  const normalized = parsed
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`La tienda propuesta ${index + 1} no tiene un formato valido.`)
      }

      const source = item as Record<string, unknown>
      const pdvId = String(source.pdvId ?? '').trim()
      const order = Number(source.order)

      if (!pdvId) {
        throw new Error(`La tienda propuesta ${index + 1} no tiene PDV valido.`)
      }

      if (!Number.isInteger(order) || order <= 0) {
        throw new Error(`La tienda propuesta ${index + 1} tiene un orden invalido.`)
      }

      return {
        pdvId,
        order,
      } satisfies RouteChangeRequestProposalPayload
    })
    .sort((left, right) => left.order - right.order)

  const seen = new Set<string>()
  for (const proposal of normalized) {
    if (seen.has(proposal.pdvId)) {
      throw new Error('No puedes repetir la misma tienda dentro del cambio de ruta.')
    }
    seen.add(proposal.pdvId)
  }

  return normalized
}

async function resolveSupervisorWeekAssignmentsAndPdvs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    supervisorEmpleadoId,
    semanaInicio,
    semanaFin,
    pdvIds,
  }: {
    supervisorEmpleadoId: string
    semanaInicio: string
    semanaFin: string
    pdvIds: string[]
  }
) {
  const safePdvIds = pdvIds.length > 0 ? pdvIds : ['00000000-0000-0000-0000-000000000000']

  const [{ data: asignaciones, error: asignacionError }, { data: supervisorPdvs, error: supervisorPdvsError }] =
    await Promise.all([
      supabase
        .from('asignacion')
        .select(
          'id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion'
        )
        .eq('supervisor_empleado_id', supervisorEmpleadoId)
        .in('pdv_id', safePdvIds)
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('supervisor_pdv')
        .select('pdv_id, activo, fecha_inicio, fecha_fin')
        .eq('empleado_id', supervisorEmpleadoId)
        .in('pdv_id', safePdvIds)
        .limit(400),
    ])

  if (asignacionError) {
    throw new Error(asignacionError.message)
  }

  if (supervisorPdvsError) {
    throw new Error(supervisorPdvsError.message)
  }

  const activeAssignments = new Map<
    string,
    {
      id: string
      cuenta_cliente_id: string
    }
  >()

  for (const assignment of asignaciones ?? []) {
    if (
      assignment.estado_publicacion === 'PUBLICADA' &&
      isAssignmentActiveForWeek(assignment, semanaInicio, semanaFin) &&
      assignment.cuenta_cliente_id &&
      !activeAssignments.has(assignment.pdv_id)
    ) {
      activeAssignments.set(assignment.pdv_id, {
        id: assignment.id,
        cuenta_cliente_id: assignment.cuenta_cliente_id,
      })
    }
  }

  const supervisorOwnedPdvs = new Set(
    (supervisorPdvs ?? [])
      .filter((relation) => relation.activo)
      .filter((relation) => {
        const relationStart = relation.fecha_inicio.slice(0, 10)
        const relationEnd = relation.fecha_fin ? relation.fecha_fin.slice(0, 10) : null
        const normalizedWeekStart = semanaInicio.slice(0, 10)
        const normalizedWeekEnd = semanaFin.slice(0, 10)

        if (relationStart > normalizedWeekEnd) {
          return false
        }

        if (relationEnd && relationEnd < normalizedWeekStart) {
          return false
        }

        return true
      })
      .map((relation) => relation.pdv_id)
  )

  return {
    activeAssignments,
    supervisorOwnedPdvs,
  }
}

async function applyRouteChangeToDay({
  supabase,
  rutaId,
  cuentaClienteId,
  supervisorEmpleadoId,
  semanaInicio,
  semanaFin,
  targetDayNumber,
  proposedVisits,
}: {
  supabase: TypedSupabaseClient
  rutaId: string
  cuentaClienteId: string
  supervisorEmpleadoId: string
  semanaInicio: string
  semanaFin: string
  targetDayNumber: number
  proposedVisits: RouteChangeRequestProposalPayload[]
}) {
  const { data: currentDayVisits, error: currentDayVisitsError } = await supabase
    .from('ruta_semanal_visita')
    .select('id, pdv_id, dia_semana, estatus, orden')
    .eq('ruta_semanal_id', rutaId)
    .eq('dia_semana', targetDayNumber)
    .order('orden', { ascending: true })
    .limit(120)

  if (currentDayVisitsError) {
    throw new Error(currentDayVisitsError.message)
  }

  if ((currentDayVisits ?? []).some((visit) => visit.estatus !== 'PLANIFICADA')) {
    throw new Error(
      'No se puede reescribir una ruta que ya tiene visitas ejecutadas o cerradas en ese dia.'
    )
  }

  const pdvIds = proposedVisits.map((item) => item.pdvId)
  const { activeAssignments, supervisorOwnedPdvs } = await resolveSupervisorWeekAssignmentsAndPdvs(supabase, {
    supervisorEmpleadoId,
    semanaInicio,
    semanaFin,
    pdvIds,
  })

  const missingPdv = pdvIds.find((pdvId) => !activeAssignments.has(pdvId) && !supervisorOwnedPdvs.has(pdvId))
  if (missingPdv) {
    throw new Error('Uno de los PDVs propuestos ya no pertenece al supervisor para esa semana.')
  }

  const currentVisitsByPdv = new Map((currentDayVisits ?? []).map((visit) => [visit.pdv_id, visit]))
  const proposedPdvIds = new Set(proposedVisits.map((item) => item.pdvId))
  const removableIds = (currentDayVisits ?? [])
    .filter((visit) => !proposedPdvIds.has(visit.pdv_id))
    .map((visit) => visit.id)

  if (removableIds.length > 0) {
    const { error: deleteError } = await supabase.from('ruta_semanal_visita').delete().in('id', removableIds)
    if (deleteError) {
      throw new Error(deleteError.message)
    }
  }

  for (const proposal of proposedVisits) {
    const existing = currentVisitsByPdv.get(proposal.pdvId)
    const assignment = activeAssignments.get(proposal.pdvId)

    if (existing) {
      const { error: updateError } = await supabase
        .from('ruta_semanal_visita')
        .update({
          orden: proposal.order,
          asignacion_id: assignment?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      continue
    }

    const { error: insertError } = await supabase.from('ruta_semanal_visita').insert({
      ruta_semanal_id: rutaId,
      cuenta_cliente_id: assignment?.cuenta_cliente_id ?? cuentaClienteId,
      supervisor_empleado_id: supervisorEmpleadoId,
      pdv_id: proposal.pdvId,
      asignacion_id: assignment?.id ?? null,
      dia_semana: targetDayNumber,
      orden: proposal.order,
      estatus: 'PLANIFICADA',
    })

    if (insertError) {
      throw new Error(insertError.message)
    }
  }
}

export async function guardarPlaneacionRutaSemanalCanvas(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable()
    const supabase = await createClient()
    const semanaInicio = normalizeWeekStart(String(formData.get('semana_inicio') ?? '').trim())
    const rawPlan = String(formData.get('route_plan_json') ?? '[]').trim()
    const visits = parseRouteCanvasPayload(rawPlan)
    const semanaFin = getWeekEndIso(semanaInicio)
    const editableWeekStart = getNextWeekStartIso()

    if (semanaInicio < editableWeekStart) {
      return buildState({
        message: `La planeacion editable inicia desde la semana del ${editableWeekStart}.`,
      })
    }

    const rutaLookupWithMetadata = await supabase
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, estatus, metadata')
      .eq('supervisor_empleado_id', actor.empleadoId)
      .eq('semana_inicio', semanaInicio)
      .maybeSingle()

    const metadataColumnAvailable = !isRutaMetadataMissingError(rutaLookupWithMetadata.error?.message)
    const rutaLookupFallback =
      metadataColumnAvailable
        ? null
        : await supabase
            .from('ruta_semanal')
            .select('id, cuenta_cliente_id, estatus')
            .eq('supervisor_empleado_id', actor.empleadoId)
            .eq('semana_inicio', semanaInicio)
            .maybeSingle()

    const rutaExistente = metadataColumnAvailable
      ? rutaLookupWithMetadata.data
      : rutaLookupFallback?.data
    const rutaError = metadataColumnAvailable
      ? rutaLookupWithMetadata.error
      : rutaLookupFallback?.error ?? null

    if (rutaError) {
      return buildState({ message: rutaError.message })
    }

    if (visits.length === 0 && !rutaExistente) {
      return buildState({ ok: true, message: 'No hay visitas que guardar en la ruta semanal.' })
    }

    const pdvIds = Array.from(new Set(visits.map((item) => item.pdvId)))
    const { data: asignaciones, error: asignacionError } = await supabase
      .from('asignacion')
      .select(
        'id, cuenta_cliente_id, supervisor_empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion'
      )
      .eq('supervisor_empleado_id', actor.empleadoId)
      .in('pdv_id', pdvIds.length > 0 ? pdvIds : ['00000000-0000-0000-0000-000000000000'])
      .order('created_at', { ascending: false })
      .limit(400)

    if (asignacionError) {
      return buildState({ message: asignacionError.message })
    }

    const { data: supervisorPdvs, error: supervisorPdvsError } = await supabase
      .from('supervisor_pdv')
      .select('pdv_id, activo, fecha_inicio, fecha_fin')
      .eq('empleado_id', actor.empleadoId)
      .in('pdv_id', pdvIds.length > 0 ? pdvIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(400)

    if (supervisorPdvsError) {
      return buildState({ message: supervisorPdvsError.message })
    }

    const activeAssignments = new Map<
      string,
      {
        id: string
        cuenta_cliente_id: string
      }
    >()

    for (const assignment of asignaciones ?? []) {
      if (
        assignment.estado_publicacion === 'PUBLICADA' &&
        isAssignmentActiveForWeek(assignment, semanaInicio, semanaFin) &&
        assignment.cuenta_cliente_id &&
        !activeAssignments.has(assignment.pdv_id)
      ) {
        activeAssignments.set(assignment.pdv_id, {
          id: assignment.id,
          cuenta_cliente_id: assignment.cuenta_cliente_id,
        })
      }
    }

    const supervisorOwnedPdvs = new Set(
      (supervisorPdvs ?? [])
        .filter((relation) => relation.activo)
        .filter((relation) => {
          const relationStart = relation.fecha_inicio.slice(0, 10)
          const relationEnd = relation.fecha_fin ? relation.fecha_fin.slice(0, 10) : null
          const normalizedWeekStart = semanaInicio.slice(0, 10)
          const normalizedWeekEnd = semanaFin.slice(0, 10)

          if (relationStart > normalizedWeekEnd) {
            return false
          }

          if (relationEnd && relationEnd < normalizedWeekStart) {
            return false
          }

          return true
        })
        .map((relation) => relation.pdv_id)
    )

    const missingPdv = pdvIds.find((pdvId) => !activeAssignments.has(pdvId) && !supervisorOwnedPdvs.has(pdvId))
    if (missingPdv) {
      return buildState({
        message: 'Uno de los PDVs del canvas ya no pertenece al supervisor para esa semana.',
      })
    }

    const cuentaClienteId =
      rutaExistente?.cuenta_cliente_id ??
      (visits[0] ? activeAssignments.get(visits[0].pdvId)?.cuenta_cliente_id ?? actor.cuentaClienteId : actor.cuentaClienteId)

    if (!cuentaClienteId) {
      return buildState({
        message: 'No fue posible resolver la cuenta cliente para guardar la ruta semanal.',
      })
    }

    let rutaId = rutaExistente?.id ?? null

    if (!rutaId) {
      const metadata = metadataColumnAvailable
        ? serializeRutaSemanalWorkflowMetadata({
            ...parseRutaSemanalWorkflowMetadata(null),
            approval: {
              state: 'PENDIENTE_COORDINACION',
              note: 'Ruta enviada por supervisor para aprobacion semanal.',
              reviewedAt: null,
              reviewedByUsuarioId: null,
            },
          })
        : undefined

      const { data: nuevaRuta, error: createRouteError } = await supabase
        .from('ruta_semanal')
        .insert({
          cuenta_cliente_id: cuentaClienteId,
          supervisor_empleado_id: actor.empleadoId,
          semana_inicio: semanaInicio,
          estatus: 'BORRADOR',
          notas: 'Ruta semanal enviada por supervisor para aprobacion de coordinacion.',
          created_by_usuario_id: actor.usuarioId,
          updated_by_usuario_id: actor.usuarioId,
          ...(metadataColumnAvailable ? { metadata } : {}),
        })
        .select('id')
        .maybeSingle()

      if (createRouteError || !nuevaRuta) {
        return buildState({
          message: createRouteError?.message ?? 'No fue posible crear la ruta semanal.',
        })
      }

      rutaId = nuevaRuta.id
    } else {
      const metadata = metadataColumnAvailable
        ? (() => {
            const currentMetadata = parseRutaSemanalWorkflowMetadata(
              metadataColumnAvailable &&
                rutaExistente &&
                'metadata' in rutaExistente
                ? (rutaExistente as unknown as RutaSemanalLookupRow).metadata
                : null
            )
            currentMetadata.approval = {
              state: 'PENDIENTE_COORDINACION',
              note: 'Ruta actualizada por supervisor y reenviada a coordinacion.',
              reviewedAt: null,
              reviewedByUsuarioId: null,
            }
            return serializeRutaSemanalWorkflowMetadata(currentMetadata)
          })()
        : null

      const { error: updateRouteError } = await supabase
        .from('ruta_semanal')
        .update({
          estatus: 'BORRADOR',
          notas: 'Ruta semanal reenviada por supervisor para aprobacion de coordinacion.',
          updated_by_usuario_id: actor.usuarioId,
          updated_at: new Date().toISOString(),
          ...(metadataColumnAvailable ? { metadata } : {}),
        })
        .eq('id', rutaId)

      if (updateRouteError) {
        return buildState({ message: updateRouteError.message })
      }
    }

    const { data: existingVisits, error: existingVisitsError } = await supabase
      .from('ruta_semanal_visita')
      .select('id, estatus, dia_semana, pdv_id')
      .eq('ruta_semanal_id', rutaId)
      .limit(400)

    if (existingVisitsError) {
      return buildState({ message: existingVisitsError.message })
    }

    const submittedIds = new Set(visits.map((item) => item.visitId).filter((item): item is string => Boolean(item)))
    const submittedCompositeKeys = new Set(
      visits.map((item) => buildRouteVisitUniqueKey(item.day, item.pdvId))
    )
    const existingVisitByCompositeKey = new Map(
      (existingVisits ?? []).map((item) => [buildRouteVisitUniqueKey(item.dia_semana, item.pdv_id), item])
    )
    const removableIds = (existingVisits ?? [])
      .filter(
        (item) =>
          item.estatus === 'PLANIFICADA' &&
          !submittedIds.has(item.id) &&
          !submittedCompositeKeys.has(buildRouteVisitUniqueKey(item.dia_semana, item.pdv_id))
      )
      .map((item) => item.id)

    if (removableIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('ruta_semanal_visita')
        .delete()
        .in('id', removableIds)

      if (deleteError) {
        return buildState({ message: deleteError.message })
      }
    }

    const groupedByDay = new Map<number, RouteCanvasVisitPayload[]>()
    for (const visit of visits) {
      const current = groupedByDay.get(visit.day) ?? []
      current.push(visit)
      groupedByDay.set(visit.day, current)
    }

    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      const dayItems = groupedByDay.get(day) ?? []

      for (let index = 0; index < dayItems.length; index += 1) {
        const visit = dayItems[index]
        const assignment = activeAssignments.get(visit.pdvId)
        const existingVisitForSlot = existingVisitByCompositeKey.get(buildRouteVisitUniqueKey(day, visit.pdvId))
        const effectiveVisitId = visit.visitId ?? existingVisitForSlot?.id ?? null

        if (!assignment && !supervisorOwnedPdvs.has(visit.pdvId)) {
          continue
        }

        if (effectiveVisitId) {
          const { error: updateError } = await supabase
            .from('ruta_semanal_visita')
            .update({
              pdv_id: visit.pdvId,
              asignacion_id: assignment?.id ?? null,
              cuenta_cliente_id: assignment?.cuenta_cliente_id ?? cuentaClienteId,
              dia_semana: day,
              orden: index + 1,
              comentarios: visit.notes,
              updated_at: new Date().toISOString(),
            })
            .eq('id', effectiveVisitId)

          if (updateError) {
            return buildState({ message: updateError.message })
          }
        } else {
          const { error: insertError } = await supabase.from('ruta_semanal_visita').insert({
            ruta_semanal_id: rutaId,
            cuenta_cliente_id: assignment?.cuenta_cliente_id ?? cuentaClienteId,
            supervisor_empleado_id: actor.empleadoId,
            pdv_id: visit.pdvId,
            asignacion_id: assignment?.id ?? null,
            dia_semana: day,
            orden: index + 1,
            comentarios: visit.notes,
          })

          if (insertError) {
            return buildState({ message: insertError.message })
          }
        }
      }
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_semanal',
      registroId: rutaId,
      cuentaClienteId,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_canvas_enviada_a_coordinacion',
        semana_inicio: semanaInicio,
        total_visitas: visits.length,
        total_pdvs: pdvIds.length,
        approval_state: 'PENDIENTE_COORDINACION',
      },
    })

    revalidatePath('/ruta-semanal')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: 'Ruta semanal enviada a coordinacion para aprobacion.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar el canvas semanal.',
    })
  }
}

export async function completarVisitaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable()
    const supabase = await createClient()
    const service = createServiceClient() as TypedSupabaseClient
    const visitaId = String(formData.get('visita_id') ?? '').trim()
    const selfieFile = asUploadedFile(formData.get('selfie_file'))
    const evidenciaFile = asUploadedFile(formData.get('evidencia_file'))
    const comentarios = normalizeText(formData.get('comentarios'))
    const checklist = buildChecklist(formData)

    if (!visitaId) {
      return buildState({ message: 'La visita es obligatoria.' })
    }

    if (!selfieFile) {
      return buildState({ message: 'La selfie de supervision es obligatoria para cerrar la visita.' })
    }

    const { data: visita, error: visitaError } = await supabase
      .from('ruta_semanal_visita')
      .select('id, ruta_semanal_id, cuenta_cliente_id, supervisor_empleado_id, estatus, selfie_url, evidencia_url')
      .eq('id', visitaId)
      .maybeSingle()

    if (visitaError || !visita) {
      return buildState({ message: visitaError?.message ?? 'No fue posible encontrar la visita.' })
    }

    if (visita.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La visita no pertenece al supervisor autenticado.' })
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId: visita.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
    })

    const evidenciaUpload = evidenciaFile
      ? await uploadRutaEvidence(service, {
          actorUsuarioId: actor.usuarioId,
          cuentaClienteId: visita.cuenta_cliente_id,
          supervisorEmpleadoId: actor.empleadoId,
          file: evidenciaFile,
          evidenceKind: 'evidencia',
        })
      : null

    const completadaEn = new Date().toISOString()
    const { error: updateVisitError } = await supabase
      .from('ruta_semanal_visita')
      .update({
        estatus: 'COMPLETADA',
        selfie_url: selfieUpload.archivo.url,
        evidencia_url: evidenciaUpload?.archivo.url ?? null,
        checklist_calidad: checklist,
        comentarios,
        completada_en: completadaEn,
        updated_at: completadaEn,
      })
      .eq('id', visitaId)

    if (updateVisitError) {
      return buildState({ message: updateVisitError.message })
    }

    const { data: visitasRuta } = await supabase
      .from('ruta_semanal_visita')
      .select('id, estatus')
      .eq('ruta_semanal_id', visita.ruta_semanal_id)
      .limit(200)

    const todasCompletadas = (visitasRuta ?? []).every((item) => item.estatus === 'COMPLETADA')

    await supabase
      .from('ruta_semanal')
      .update({
        estatus: todasCompletadas ? 'CERRADA' : 'EN_PROGRESO',
        updated_by_usuario_id: actor.usuarioId,
        updated_at: completadaEn,
      })
      .eq('id', visita.ruta_semanal_id)

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_semanal_visita',
      registroId: visitaId,
      cuentaClienteId: visita.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_visita_completada',
        ruta_semanal_id: visita.ruta_semanal_id,
        checklist,
        selfie_url: true,
        evidencia_url: Boolean(evidenciaUpload),
        selfie_hash: selfieUpload.archivo.hash,
        selfie_deduplicated: selfieUpload.deduplicated,
        evidencia_hash: evidenciaUpload?.archivo.hash ?? null,
        evidencia_deduplicated: evidenciaUpload?.deduplicated ?? false,
        selfie_thumbnail_url: selfieUpload.miniatura?.url ?? null,
        evidencia_thumbnail_url: evidenciaUpload?.miniatura?.url ?? null,
        selfie_optimization: {
          kind: selfieUpload.optimization.optimizationKind,
          originalBytes: selfieUpload.optimization.originalBytes,
          finalBytes: selfieUpload.optimization.optimizedBytes,
          targetMet: selfieUpload.optimization.targetMet,
          notes: selfieUpload.optimization.notes,
          officialAssetKind: selfieUpload.optimization.officialAssetKind,
        },
        evidencia_optimization: evidenciaUpload
          ? {
              kind: evidenciaUpload.optimization.optimizationKind,
              originalBytes: evidenciaUpload.optimization.originalBytes,
              finalBytes: evidenciaUpload.optimization.optimizedBytes,
              targetMet: evidenciaUpload.optimization.targetMet,
              notes: evidenciaUpload.optimization.notes,
              officialAssetKind: evidenciaUpload.optimization.officialAssetKind,
            }
          : null,
      },
    })

    revalidatePath('/ruta-semanal')

    return buildState({
      ok: true,
      message: 'Visita marcada como completada.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible completar la visita.',
    })
  }
}

export async function actualizarControlRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirCoordinadorRuta()
    const supabase = await createClient()
    const service = createServiceClient() as TypedSupabaseClient
    const rutaId = String(formData.get('ruta_id') ?? '').trim()
    const supervisorEmpleadoId = String(formData.get('supervisor_empleado_id') ?? '').trim()
    const semanaInicio = String(formData.get('semana_inicio') ?? '').trim()
    const minimumVisitsPerPdvRaw = String(formData.get('minimum_visits_per_pdv') ?? '').trim()
    const approvalState = String(formData.get('approval_state') ?? '').trim()
    const approvalNote = normalizeText(formData.get('approval_note'))

    if (!rutaId && (!supervisorEmpleadoId || !semanaInicio)) {
      return buildState({
        message: 'Se necesita una ruta o el supervisor con la semana para guardar quotas.',
      })
    }

    const minimumVisitsPerPdv =
      minimumVisitsPerPdvRaw === ''
        ? null
        : normalizeInt(minimumVisitsPerPdvRaw, 'Visitas minimas por PDV')

    const rutaQueryWithMetadata = service.from('ruta_semanal').select(
      'id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, metadata'
    )

    const rutaResult = rutaId
      ? await rutaQueryWithMetadata.eq('id', rutaId).maybeSingle()
      : await rutaQueryWithMetadata
          .eq('supervisor_empleado_id', supervisorEmpleadoId)
          .eq('semana_inicio', semanaInicio)
          .maybeSingle()

    const metadataColumnAvailable = !isRutaMetadataMissingError(rutaResult.error?.message)

    const fallbackResult =
      metadataColumnAvailable
        ? null
        : rutaId
          ? await service
              .from('ruta_semanal')
              .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio')
              .eq('id', rutaId)
              .maybeSingle()
          : await service
              .from('ruta_semanal')
              .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio')
              .eq('supervisor_empleado_id', supervisorEmpleadoId)
              .eq('semana_inicio', semanaInicio)
              .maybeSingle()

    const fallbackRutaData = (fallbackResult?.data as RutaSemanalLookupFallbackRow | null) ?? null

    let ruta: RutaSemanalLookupRow | null = metadataColumnAvailable
      ? ((rutaResult.data as RutaSemanalLookupRow | null) ?? null)
      : fallbackRutaData
        ? {
            ...fallbackRutaData,
            metadata: {},
          }
        : null
    let error = metadataColumnAvailable ? rutaResult.error : fallbackResult?.error ?? null

    if (!ruta && supervisorEmpleadoId && semanaInicio) {
      const alternateLookup = metadataColumnAvailable
        ? await service
            .from('ruta_semanal')
            .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, metadata')
            .eq('supervisor_empleado_id', supervisorEmpleadoId)
            .eq('semana_inicio', semanaInicio)
            .maybeSingle()
        : await service
            .from('ruta_semanal')
            .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio')
            .eq('supervisor_empleado_id', supervisorEmpleadoId)
            .eq('semana_inicio', semanaInicio)
            .maybeSingle()

      if (alternateLookup.data) {
        ruta = metadataColumnAvailable
          ? ((alternateLookup.data as RutaSemanalLookupRow | null) ?? null)
          : {
              ...(alternateLookup.data as RutaSemanalLookupFallbackRow),
              metadata: {},
            }
        error = null
      }
    }

    const targetSupervisorEmpleadoId = ruta?.supervisor_empleado_id ?? supervisorEmpleadoId
    const targetWeekStart = ruta?.semana_inicio ?? semanaInicio
    const targetWeekEnd = getWeekEndIso(targetWeekStart)

    const [assignmentsResult, supervisorPdvResult] = await Promise.all([
      supabase
        .from('asignacion')
        .select(
          'pdv_id, fecha_inicio, fecha_fin, estado_publicacion, supervisor_empleado_id'
        )
        .eq('supervisor_empleado_id', targetSupervisorEmpleadoId)
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('supervisor_pdv')
        .select('pdv_id, activo, fecha_inicio, fecha_fin')
        .eq('empleado_id', targetSupervisorEmpleadoId)
        .eq('activo', true)
        .order('fecha_inicio', { ascending: false })
        .limit(400),
    ])

    if (assignmentsResult.error || supervisorPdvResult.error) {
      return buildState({
        message:
          assignmentsResult.error?.message ??
          supervisorPdvResult.error?.message ??
          'No fue posible calcular la base de PDVs del supervisor.',
      })
    }

    const pdvIds = new Set<string>()

    const assignmentRows = (assignmentsResult.data ?? []) as AsignacionQuotaBaseRow[]

    for (const assignment of assignmentRows) {
      if (
        assignment.estado_publicacion === 'PUBLICADA' &&
        isAssignmentActiveForWeek(assignment, targetWeekStart, targetWeekEnd)
      ) {
        pdvIds.add(assignment.pdv_id)
      }
    }

    for (const relation of supervisorPdvResult.data ?? []) {
      const startsBeforeWeek = relation.fecha_inicio <= targetWeekEnd
      const endsAfterWeek = !relation.fecha_fin || relation.fecha_fin >= targetWeekStart

      if (relation.activo && startsBeforeWeek && endsAfterWeek) {
        pdvIds.add(relation.pdv_id)
      }
    }

    const pdvMonthlyQuotas = Object.fromEntries(
      Array.from(pdvIds).map((pdvId) => [pdvId, minimumVisitsPerPdv ?? 0])
    )
    const expectedMonthlyVisits =
      minimumVisitsPerPdv === null ? null : minimumVisitsPerPdv * pdvIds.size
    const cuentaClienteId =
      ruta?.cuenta_cliente_id ??
      assignmentRows.find((item) => item.cuenta_cliente_id)?.cuenta_cliente_id ??
      actor.cuentaClienteId

    if (error || !ruta) {
      if (!cuentaClienteId) {
        return buildState({ message: error?.message ?? 'No fue posible cargar la ruta.' })
      }

      if (!metadataColumnAvailable) {
        return buildState({
          message:
            'La base local aun no tiene el workflow de ruta semanal. Aplica la migracion 20260322103000_ruta_semanal_workflow_metadata.sql para guardar la cuota general.',
        })
      }

      const { data: rutaCreada, error: createError } = await service
        .from('ruta_semanal')
        .insert({
          cuenta_cliente_id: cuentaClienteId,
          supervisor_empleado_id: supervisorEmpleadoId,
          semana_inicio: semanaInicio,
          estatus: 'BORRADOR',
          notas: 'Ruta creada por Coordinacion para control de quotas.',
          created_by_usuario_id: actor.usuarioId,
          updated_by_usuario_id: actor.usuarioId,
          metadata: serializeRutaSemanalWorkflowMetadata(
            parseRutaSemanalWorkflowMetadata({
              expectedMonthlyVisits,
              minimumVisitsPerPdv,
              pdvMonthlyQuotas,
            })
          ),
        })
        .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, metadata')
        .maybeSingle()

      const routeCreateResult =
        createError?.message?.toLowerCase().includes('row-level security') ||
        createError?.message?.toLowerCase().includes('permission')
          ? await service
              .from('ruta_semanal')
              .insert({
                cuenta_cliente_id: cuentaClienteId,
                supervisor_empleado_id: supervisorEmpleadoId,
                semana_inicio: semanaInicio,
                estatus: 'BORRADOR',
                notas: 'Ruta creada por Coordinacion para control de quotas.',
                created_by_usuario_id: actor.usuarioId,
                updated_by_usuario_id: actor.usuarioId,
                metadata: serializeRutaSemanalWorkflowMetadata(
                  parseRutaSemanalWorkflowMetadata({
                    expectedMonthlyVisits,
                    minimumVisitsPerPdv,
                    pdvMonthlyQuotas,
                  })
                ),
              })
              .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, metadata')
              .maybeSingle()
          : null

      const finalCreateError = routeCreateResult?.error ?? createError
      const finalRutaCreada = routeCreateResult?.data ?? rutaCreada

      if (finalCreateError || !finalRutaCreada) {
        return buildState({
          message:
            finalCreateError?.message ??
            'No fue posible crear la ruta base para guardar quotas.',
        })
      }

      await registrarEventoAudit(service, {
        tabla: 'ruta_semanal',
        registroId: finalRutaCreada.id,
        cuentaClienteId: finalRutaCreada.cuenta_cliente_id,
        usuarioId: actor.usuarioId,
        payload: {
          evento: 'ruta_quota_creada_por_coordinacion',
          supervisor_empleado_id: supervisorEmpleadoId,
          semana_inicio: semanaInicio,
          minimum_visits_per_pdv: minimumVisitsPerPdv,
          expected_monthly_visits: expectedMonthlyVisits,
          pdv_monthly_quotas: pdvMonthlyQuotas,
        },
      })

      revalidatePath('/ruta-semanal')
      revalidatePath('/dashboard')

      return buildState({
        ok: true,
        message: 'Cuota general del supervisor guardada. Se creo una ruta base para el supervisor.',
      })
    }

    if (!metadataColumnAvailable) {
      return buildState({
        message:
          'La cuota general aun no puede guardarse porque falta la columna de workflow en ruta semanal. Aplica la migracion 20260322103000_ruta_semanal_workflow_metadata.sql.',
      })
    }

    const metadata = parseRutaSemanalWorkflowMetadata(ruta.metadata)
    metadata.minimumVisitsPerPdv = minimumVisitsPerPdv
    metadata.expectedMonthlyVisits = expectedMonthlyVisits
    metadata.pdvMonthlyQuotas = pdvMonthlyQuotas

    if (approvalState) {
      metadata.approval = {
        state:
          approvalState === 'APROBADA' || approvalState === 'CAMBIOS_SOLICITADOS'
            ? approvalState
            : 'PENDIENTE_COORDINACION',
        note: approvalNote,
        reviewedAt: new Date().toISOString(),
        reviewedByUsuarioId: actor.usuarioId,
      }
    } else if (approvalNote !== null) {
      metadata.approval = {
        ...metadata.approval,
        note: approvalNote,
        reviewedAt: new Date().toISOString(),
        reviewedByUsuarioId: actor.usuarioId,
      }
    }

    const { error: updateError } = await service
      .from('ruta_semanal')
      .update({
        estatus:
          metadata.approval.state === 'APROBADA'
            ? 'PUBLICADA'
            : metadata.approval.state === 'CAMBIOS_SOLICITADOS'
              ? 'BORRADOR'
              : 'BORRADOR',
        metadata: serializeRutaSemanalWorkflowMetadata(metadata),
        updated_by_usuario_id: actor.usuarioId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rutaId)

    const finalUpdateError =
      updateError?.message?.toLowerCase().includes('row-level security') ||
      updateError?.message?.toLowerCase().includes('permission')
        ? (
            await service
              .from('ruta_semanal')
              .update({
                estatus:
                  metadata.approval.state === 'APROBADA'
                    ? 'PUBLICADA'
                    : metadata.approval.state === 'CAMBIOS_SOLICITADOS'
                      ? 'BORRADOR'
                      : 'BORRADOR',
                metadata: serializeRutaSemanalWorkflowMetadata(metadata),
                updated_by_usuario_id: actor.usuarioId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', rutaId)
          ).error
        : updateError

    if (finalUpdateError) {
      return buildState({ message: finalUpdateError.message })
    }

    await registrarEventoAudit(service, {
      tabla: 'ruta_semanal',
      registroId: rutaId,
      cuentaClienteId: ruta.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_control_actualizado',
        minimum_visits_per_pdv: minimumVisitsPerPdv,
        expected_monthly_visits: expectedMonthlyVisits,
        pdv_monthly_quotas: metadata.pdvMonthlyQuotas,
        approval_state: metadata.approval.state,
        approval_note: metadata.approval.note,
      },
    })

    revalidatePath('/ruta-semanal')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: 'Control de ruta actualizado.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible actualizar el control de ruta.',
    })
  }
}

export async function solicitarCambioRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable()
    const supabase = await createClient()
    const rutaId = String(formData.get('ruta_id') ?? '').trim()
    const requestType = normalizeChangeRequestType(
      String(formData.get('change_request_type') ?? 'CAMBIO_DIA').trim().toUpperCase()
    )
    const targetVisitId = String(formData.get('target_visit_id') ?? '').trim()
    const targetDayNumberRaw = String(formData.get('target_day_number') ?? '').trim()
    const proposedRouteRaw = String(formData.get('change_request_route_json') ?? '[]').trim()
    const note = normalizeText(formData.get('change_request_note'))

    if (!rutaId) {
      return buildState({ message: 'La ruta es obligatoria.' })
    }

    const targetDayNumber = Number(targetDayNumberRaw)

    if (!Number.isInteger(targetDayNumber) || targetDayNumber < 1 || targetDayNumber > 7) {
      return buildState({ message: 'Selecciona el dia exacto que quieres modificar.' })
    }

    if (requestType === 'CAMBIO_TIENDA' && !targetVisitId) {
      return buildState({ message: 'Selecciona la tienda exacta dentro de la ruta que quieres cambiar.' })
    }

    if (!note) {
      return buildState({ message: 'Explica por que solicitas el cambio de ruta.' })
    }

    const proposedRoute = parseRouteChangeProposalPayload(proposedRouteRaw)

    const { data: ruta, error } = await supabase
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, estatus, metadata')
      .eq('id', rutaId)
      .maybeSingle()

    if (error || !ruta) {
      return buildState({ message: error?.message ?? 'No fue posible cargar la ruta.' })
    }

    if (ruta.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La ruta no pertenece al supervisor autenticado.' })
    }

    const { data: dayVisits, error: dayVisitsError } = await supabase
      .from('ruta_semanal_visita')
      .select('id, pdv_id, dia_semana, estatus')
      .eq('ruta_semanal_id', rutaId)
      .eq('dia_semana', targetDayNumber)
      .order('orden', { ascending: true })
      .limit(120)

    if (dayVisitsError) {
      return buildState({ message: dayVisitsError.message })
    }

    if (!dayVisits || dayVisits.length === 0) {
      return buildState({
        message: 'Ese dia aun no tiene tiendas cargadas dentro de la ruta.',
      })
    }

    let resolvedTargetVisitId: string | null = null
    let resolvedTargetPdvId: string | null = null
    const resolvedTargetDayNumber = targetDayNumber
    const resolvedTargetDayLabel = getWeekDayLabel(targetDayNumber)

    if (requestType === 'CAMBIO_TIENDA') {
      const targetVisit = dayVisits.find((visit) => visit.id === targetVisitId)

      if (!targetVisit) {
        return buildState({
          message: 'La tienda seleccionada no pertenece al dia que quieres cambiar.',
        })
      }

      resolvedTargetVisitId = targetVisit.id
      resolvedTargetPdvId = targetVisit.pdv_id
    }

    const effectiveRequestType =
      proposedRoute.length === 0 ? 'CANCELACION_DIA' : requestType
    const targetScope = effectiveRequestType === 'CAMBIO_TIENDA' ? 'VISITA' : 'DIA'

    if (effectiveRequestType === 'CANCELACION_DIA' && proposedRoute.length > 0) {
      return buildState({
        message: 'La cancelacion del dia debe enviarse sin tiendas en la nueva ruta.',
      })
    }

    if (effectiveRequestType !== 'CANCELACION_DIA') {
      const proposedPdvIds = proposedRoute.map((item) => item.pdvId)
      const semanaInicio = ('semana_inicio' in ruta && typeof ruta.semana_inicio === 'string'
        ? ruta.semana_inicio
        : null) ?? null

      if (semanaInicio) {
        const semanaFin = getWeekEndIso(semanaInicio)
        const { activeAssignments, supervisorOwnedPdvs } = await resolveSupervisorWeekAssignmentsAndPdvs(supabase, {
          supervisorEmpleadoId: actor.empleadoId,
          semanaInicio,
          semanaFin,
          pdvIds: proposedPdvIds,
        })

        const missingPdv = proposedPdvIds.find(
          (pdvId) => !activeAssignments.has(pdvId) && !supervisorOwnedPdvs.has(pdvId)
        )

        if (missingPdv) {
          return buildState({
            message: 'Una de las tiendas de la nueva ruta ya no pertenece al supervisor para esa semana.',
          })
        }
      }
    }

    const metadata = parseRutaSemanalWorkflowMetadata(ruta.metadata)
    metadata.changeRequest = {
      status: 'PENDIENTE',
      note,
      resolutionNote: null,
      requestType: effectiveRequestType,
      targetScope: targetScope === 'DIA' ? 'DIA' : 'VISITA',
      targetVisitId: resolvedTargetVisitId,
      targetPdvId: resolvedTargetPdvId,
      targetDayNumber: resolvedTargetDayNumber,
      targetDayLabel: resolvedTargetDayLabel,
      proposedVisits: proposedRoute,
      requestedAt: new Date().toISOString(),
      requestedByUsuarioId: actor.usuarioId,
      resolvedAt: null,
      resolvedByUsuarioId: null,
      previousApprovalState: metadata.approval.state,
      previousRouteStatus: 'estatus' in ruta && typeof ruta.estatus === 'string' ? ruta.estatus : null,
    }
    metadata.approval = {
      ...metadata.approval,
      state: 'CAMBIOS_SOLICITADOS',
      note,
      reviewedAt: metadata.approval.reviewedAt,
      reviewedByUsuarioId: metadata.approval.reviewedByUsuarioId,
    }

    const { error: updateError } = await supabase
      .from('ruta_semanal')
      .update({
        metadata: serializeRutaSemanalWorkflowMetadata(metadata),
        updated_by_usuario_id: actor.usuarioId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rutaId)

    if (updateError) {
      return buildState({ message: updateError.message })
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_semanal',
      registroId: rutaId,
      cuentaClienteId: ruta.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_cambio_solicitado',
        request_type: effectiveRequestType,
        nota: note,
        target_scope: metadata.changeRequest.targetScope,
        target_visit_id: resolvedTargetVisitId,
        target_pdv_id: resolvedTargetPdvId,
        target_day_number: resolvedTargetDayNumber,
        target_day_label: resolvedTargetDayLabel,
        proposed_visits: proposedRoute,
      },
    })

    revalidatePath('/ruta-semanal')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: 'Solicitud de cambio de ruta enviada a Coordinacion.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible solicitar el cambio de ruta.',
    })
  }
}

export async function resolverSolicitudCambioRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirCoordinadorRuta()
    const supabase = await createClient()
    const service = createServiceClient() as TypedSupabaseClient
    const rutaId = String(formData.get('ruta_id') ?? '').trim()
    const decision = String(formData.get('decision') ?? '').trim().toUpperCase()
    const resolutionNote = normalizeText(formData.get('resolution_note'))

    if (!rutaId) {
      return buildState({ message: 'La ruta es obligatoria.' })
    }

    if (decision !== 'APROBAR' && decision !== 'RECHAZAR') {
      return buildState({ message: 'Selecciona una decision valida para el cambio de ruta.' })
    }

    const { data: ruta, error } = await service
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio, estatus, metadata')
      .eq('id', rutaId)
      .maybeSingle()

    if (error || !ruta) {
      return buildState({ message: error?.message ?? 'No fue posible cargar la ruta.' })
    }

    const metadata = parseRutaSemanalWorkflowMetadata(ruta.metadata)

    if (metadata.changeRequest.status !== 'PENDIENTE') {
      return buildState({ message: 'La ruta no tiene una solicitud de cambio pendiente.' })
    }

    const now = new Date().toISOString()
    const restoredApprovalState = metadata.changeRequest.previousApprovalState ?? 'APROBADA'
    let nextApprovalState: RutaApprovalState = restoredApprovalState
    let nextRouteStatus =
      metadata.changeRequest.previousRouteStatus ?? resolveRouteStatusFromApprovalState(restoredApprovalState)

    if (decision === 'APROBAR') {
      const targetDayNumber = metadata.changeRequest.targetDayNumber

      if (!targetDayNumber) {
        return buildState({ message: 'La solicitud no tiene un dia objetivo valido.' })
      }

      await applyRouteChangeToDay({
        supabase: service,
        rutaId,
        cuentaClienteId: ruta.cuenta_cliente_id,
        supervisorEmpleadoId: ruta.supervisor_empleado_id,
        semanaInicio: ruta.semana_inicio,
        semanaFin: getWeekEndIso(ruta.semana_inicio),
        targetDayNumber,
        proposedVisits: metadata.changeRequest.proposedVisits,
      })

      nextApprovalState = 'APROBADA'
      nextRouteStatus = ruta.estatus === 'EN_PROGRESO' ? 'EN_PROGRESO' : 'PUBLICADA'
    }

    metadata.changeRequest = {
      ...metadata.changeRequest,
      status: decision === 'APROBAR' ? 'APROBADO' : 'RECHAZADO',
      resolutionNote,
      resolvedAt: now,
      resolvedByUsuarioId: actor.usuarioId,
    }
    metadata.approval = {
      state: nextApprovalState,
      note: resolutionNote ?? metadata.changeRequest.note,
      reviewedAt: now,
      reviewedByUsuarioId: actor.usuarioId,
    }

    const { error: updateError } = await service
      .from('ruta_semanal')
      .update({
        estatus: nextRouteStatus,
        metadata: serializeRutaSemanalWorkflowMetadata(metadata),
        updated_by_usuario_id: actor.usuarioId,
        updated_at: now,
      })
      .eq('id', rutaId)

    if (updateError) {
      return buildState({ message: updateError.message })
    }

    await registrarEventoAudit(service, {
      tabla: 'ruta_semanal',
      registroId: rutaId,
      cuentaClienteId: ruta.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_cambio_resuelto',
        decision,
        request_type: metadata.changeRequest.requestType,
        target_scope: metadata.changeRequest.targetScope,
        target_visit_id: metadata.changeRequest.targetVisitId,
        target_pdv_id: metadata.changeRequest.targetPdvId,
        target_day_number: metadata.changeRequest.targetDayNumber,
        target_day_label: metadata.changeRequest.targetDayLabel,
        proposed_visits: metadata.changeRequest.proposedVisits,
        resolution_note: resolutionNote,
      },
    })

    revalidatePath('/ruta-semanal')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message:
        decision === 'APROBAR'
          ? 'Cambio de ruta aprobado. La ruta real del supervisor ya fue actualizada.'
          : 'Cambio de ruta rechazado. La ruta previa se mantiene vigente.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible resolver el cambio de ruta.',
    })
  }
}

export async function registrarEventoAgendaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable()
    const supabase = await createClient()
    const rutaId = String(formData.get('ruta_id') ?? '').trim()
    const fechaOperacion = String(formData.get('fecha_operacion') ?? '').trim()
    const tipoEvento = normalizeAgendaEventType(String(formData.get('tipo_evento') ?? '').trim().toUpperCase())
    const modoImpacto = normalizeAgendaImpactMode(String(formData.get('modo_impacto') ?? '').trim().toUpperCase())
    const titulo = String(formData.get('titulo') ?? '').trim()
    const descripcion = normalizeText(formData.get('descripcion'))
    const sede = normalizeText(formData.get('sede'))
    const horaInicio = normalizeText(formData.get('hora_inicio'))
    const horaFin = normalizeText(formData.get('hora_fin'))
    const pdvId = normalizeText(formData.get('pdv_id'))
    const displacedVisitIds = normalizeJsonStringArray(
      formData.get('displaced_visit_ids_json'),
      'Las visitas desplazadas'
    )

    if (!rutaId) {
      return buildState({ message: 'La ruta es obligatoria.' })
    }

    if (!fechaOperacion) {
      return buildState({ message: 'La fecha operativa es obligatoria.' })
    }

    if (!titulo) {
      return buildState({ message: 'El titulo del evento es obligatorio.' })
    }

    if (tipoEvento === 'VISITA_ADICIONAL' && !pdvId) {
      return buildState({ message: 'La visita adicional debe indicar un PDV.' })
    }

    if (modoImpacto === 'SOBREPONE_PARCIAL' && displacedVisitIds.length === 0) {
      return buildState({
        message: 'Cuando el evento sobrepone parcialmente la ruta debes indicar las visitas desplazadas.',
      })
    }

    const { data: ruta, error: routeError } = await supabase
      .from('ruta_semanal')
      .select('id, cuenta_cliente_id, supervisor_empleado_id, semana_inicio')
      .eq('id', rutaId)
      .maybeSingle()

    if (routeError || !ruta) {
      return buildState({ message: routeError?.message ?? 'No fue posible encontrar la ruta semanal.' })
    }

    if (ruta.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La ruta no pertenece al supervisor autenticado.' })
    }

    const approvalState = agendaEventNeedsCoordination(modoImpacto)
      ? 'PENDIENTE_COORDINACION'
      : 'NO_REQUIERE'

    const metadata = serializeRutaAgendaEventMetadata({
      displacedVisitIds,
      approvalNote: null,
      checkIn: {
        at: null,
        latitud: null,
        longitud: null,
        distanciaMetros: null,
        gpsState: null,
        selfieUrl: null,
        selfieHash: null,
        evidenciaUrl: null,
        evidenciaHash: null,
        comments: null,
      },
      checkOut: {
        at: null,
        latitud: null,
        longitud: null,
        distanciaMetros: null,
        gpsState: null,
        selfieUrl: null,
        selfieHash: null,
        evidenciaUrl: null,
        evidenciaHash: null,
        comments: null,
      },
    })

    const { data: inserted, error: insertError } = await supabase
      .from('ruta_agenda_evento')
      .insert({
        cuenta_cliente_id: ruta.cuenta_cliente_id,
        ruta_semanal_id: ruta.id,
        supervisor_empleado_id: actor.empleadoId,
        pdv_id: pdvId,
        fecha_operacion: fechaOperacion,
        tipo_evento: tipoEvento,
        modo_impacto: modoImpacto,
        estatus_aprobacion: approvalState,
        estatus_ejecucion: 'PENDIENTE',
        titulo,
        descripcion,
        sede,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        metadata,
        created_by_usuario_id: actor.usuarioId,
      })
      .select('id')
      .maybeSingle()

    if (insertError || !inserted) {
      if (isRutaAgendaInfrastructureMissingError(insertError?.message)) {
        return buildAgendaInfrastructureState()
      }

      return buildState({ message: insertError?.message ?? 'No fue posible registrar el evento operativo.' })
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_agenda_evento',
      registroId: inserted.id,
      cuentaClienteId: ruta.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_agenda_evento_creado',
        tipo_evento: tipoEvento,
        modo_impacto: modoImpacto,
        estatus_aprobacion: approvalState,
        fecha_operacion: fechaOperacion,
        displaced_visit_ids: displacedVisitIds,
      },
    })

    revalidatePath('/ruta-semanal')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message:
        approvalState === 'PENDIENTE_COORDINACION'
          ? 'Evento registrado y enviado a coordinacion para aprobacion.'
          : 'Evento registrado en la agenda operativa.',
    })
  } catch (error) {
    if (error instanceof Error && isRutaAgendaInfrastructureMissingError(error.message)) {
      return buildAgendaInfrastructureState()
    }

    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar el evento operativo.',
    })
  }
}

export async function resolverEventoAgendaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirCoordinadorRuta()
    const supabase = await createClient()
    const service = createServiceClient() as TypedSupabaseClient
    const agendaEventoId = String(formData.get('agenda_evento_id') ?? '').trim()
    const decision = String(formData.get('decision') ?? '').trim().toUpperCase()
    const resolutionNote = normalizeText(formData.get('resolution_note'))

    if (!agendaEventoId) {
      return buildState({ message: 'El evento de agenda es obligatorio.' })
    }

    const { data: agendaEvento, error: eventError } = await service
      .from('ruta_agenda_evento')
      .select(
        'id, cuenta_cliente_id, ruta_semanal_id, supervisor_empleado_id, fecha_operacion, modo_impacto, estatus_aprobacion, metadata'
      )
      .eq('id', agendaEventoId)
      .maybeSingle()

    if (eventError || !agendaEvento) {
      if (isRutaAgendaInfrastructureMissingError(eventError?.message)) {
        return buildAgendaInfrastructureState()
      }

      return buildState({ message: eventError?.message ?? 'No fue posible encontrar el evento operativo.' })
    }

    if (agendaEvento.estatus_aprobacion !== 'PENDIENTE_COORDINACION') {
      return buildState({ message: 'Este evento ya fue resuelto anteriormente.' })
    }

    const approved = decision === 'APROBAR'
    const metadata = parseRutaAgendaEventMetadata(agendaEvento.metadata)
    metadata.approvalNote = resolutionNote

    const { error: updateError } = await service
      .from('ruta_agenda_evento')
      .update({
        estatus_aprobacion: approved ? 'APROBADO' : 'RECHAZADO',
        resolved_by_usuario_id: actor.usuarioId,
        resolved_at: new Date().toISOString(),
        metadata: serializeRutaAgendaEventMetadata(metadata),
      })
      .eq('id', agendaEventoId)

    if (updateError) {
      if (isRutaAgendaInfrastructureMissingError(updateError.message)) {
        return buildAgendaInfrastructureState()
      }

      return buildState({ message: updateError.message })
    }

    if (approved) {
      await syncAgendaEventRepositions({
        supabase,
        actorUsuarioId: actor.usuarioId,
        routeId: agendaEvento.ruta_semanal_id,
        supervisorEmpleadoId: agendaEvento.supervisor_empleado_id,
        cuentaClienteId: agendaEvento.cuenta_cliente_id,
        agendaEventoId,
        fechaOperacion: agendaEvento.fecha_operacion,
        displacedVisitIds: metadata.displacedVisitIds,
      })
    }

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_agenda_evento',
      registroId: agendaEventoId,
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_agenda_evento_resuelto',
        decision: approved ? 'APROBADO' : 'RECHAZADO',
        modo_impacto: agendaEvento.modo_impacto,
        displaced_visit_ids: metadata.displacedVisitIds,
        resolution_note: resolutionNote,
      },
    })

    revalidatePath('/ruta-semanal')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: approved ? 'Evento aprobado y pendientes de reposicion generados.' : 'Evento rechazado.',
    })
  } catch (error) {
    if (error instanceof Error && isRutaAgendaInfrastructureMissingError(error.message)) {
      return buildAgendaInfrastructureState()
    }

    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible resolver el evento operativo.',
    })
  }
}

export async function registrarInicioVisitaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable()
    const supabase = await createClient()
    const service = createServiceClient() as TypedSupabaseClient
    const visitaId = String(formData.get('visita_id') ?? '').trim()
    const selfieFile = asUploadedFile(formData.get('selfie_file'))
    const comments = normalizeText(formData.get('comments'))
    const latitud = normalizeFloat(formData.get('latitud'))
    const longitud = normalizeFloat(formData.get('longitud'))
    const distanciaMetros = normalizeFloat(formData.get('distancia_metros'))
    const gpsState = normalizeGpsState(formData.get('estado_gps'))

    if (!visitaId) {
      return buildState({ message: 'La visita es obligatoria.' })
    }

    if (!selfieFile) {
      return buildState({ message: 'La selfie de llegada es obligatoria.' })
    }

    const { data: visita, error: visitaError } = await supabase
      .from('ruta_semanal_visita')
      .select('id, ruta_semanal_id, cuenta_cliente_id, supervisor_empleado_id, metadata')
      .eq('id', visitaId)
      .maybeSingle()

    if (visitaError || !visita) {
      return buildState({ message: visitaError?.message ?? 'No fue posible encontrar la visita.' })
    }

    if (visita.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La visita no pertenece al supervisor autenticado.' })
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId: visita.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
    })

    const metadata = parseRutaVisitaWorkflowMetadata(visita.metadata)
    metadata.checkIn = {
      at: new Date().toISOString(),
      latitud,
      longitud,
      distanciaMetros,
      gpsState,
      selfieUrl: selfieUpload.archivo.url,
      selfieHash: selfieUpload.archivo.hash,
      evidenciaUrl: null,
      evidenciaHash: null,
      comments,
    }

    const { error: updateError } = await supabase
      .from('ruta_semanal_visita')
      .update({
        metadata: serializeRutaVisitaWorkflowMetadata(metadata),
        updated_at: new Date().toISOString(),
      })
      .eq('id', visitaId)

    if (updateError) {
      return buildState({ message: updateError.message })
    }

    await supabase
      .from('ruta_semanal')
      .update({
        estatus: 'EN_PROGRESO',
        updated_by_usuario_id: actor.usuarioId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', visita.ruta_semanal_id)

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_semanal_visita',
      registroId: visitaId,
      cuentaClienteId: visita.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_visita_checkin',
        gps_state: gpsState,
        latitud,
        longitud,
        distancia_metros: distanciaMetros,
        selfie_hash: selfieUpload.archivo.hash,
      },
    })

    revalidatePath('/ruta-semanal')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: 'Llegada registrada en la ruta.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar la llegada.',
    })
  }
}

export async function registrarSalidaVisitaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable()
    const supabase = await createClient()
    const service = createServiceClient() as TypedSupabaseClient
    const visitaId = String(formData.get('visita_id') ?? '').trim()
    const selfieFile = asUploadedFile(formData.get('selfie_file'))
    const evidenciaFile = asUploadedFile(formData.get('evidencia_file'))
    const comments = normalizeText(formData.get('comments'))
    const checklist = buildChecklist(formData)
    const loveIsdinRecordsCount = normalizeOptionalNonNegativeInt(formData.get('love_isdin_records_count'))
    const latitud = normalizeFloat(formData.get('latitud'))
    const longitud = normalizeFloat(formData.get('longitud'))
    const distanciaMetros = normalizeFloat(formData.get('distancia_metros'))
    const gpsState = normalizeGpsState(formData.get('estado_gps'))

    if (!visitaId) {
      return buildState({ message: 'La visita es obligatoria.' })
    }

    if (!selfieFile) {
      return buildState({ message: 'La selfie de salida es obligatoria.' })
    }

    if (!Object.values(checklist).every(Boolean)) {
      return buildState({ message: 'Debes completar el checklist al 100% antes de cerrar la visita.' })
    }

    if (!comments) {
      return buildState({
        message: 'Debes registrar comentarios finales sobre la visita antes de cerrarla.',
      })
    }

    const { data: visita, error: visitaError } = await supabase
      .from('ruta_semanal_visita')
      .select('id, ruta_semanal_id, cuenta_cliente_id, supervisor_empleado_id, metadata')
      .eq('id', visitaId)
      .maybeSingle()

    if (visitaError || !visita) {
      return buildState({ message: visitaError?.message ?? 'No fue posible encontrar la visita.' })
    }

    if (visita.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La visita no pertenece al supervisor autenticado.' })
    }

    const existingMetadata = parseRutaVisitaWorkflowMetadata(visita.metadata)
    if (!existingMetadata.checkIn.at) {
      return buildState({ message: 'Primero debes registrar tu llegada a la tienda.' })
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId: visita.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
    })

    const evidenciaUpload = evidenciaFile
      ? await uploadRutaEvidence(service, {
          actorUsuarioId: actor.usuarioId,
          cuentaClienteId: visita.cuenta_cliente_id,
          supervisorEmpleadoId: actor.empleadoId,
          file: evidenciaFile,
          evidenceKind: 'evidencia',
        })
      : null

    const metadata = parseRutaVisitaWorkflowMetadata(visita.metadata)
    metadata.checklistComments = {}
    metadata.loveIsdinRecordsCount = loveIsdinRecordsCount
    metadata.checkOut = {
      at: new Date().toISOString(),
      latitud,
      longitud,
      distanciaMetros,
      gpsState,
      selfieUrl: selfieUpload.archivo.url,
      selfieHash: selfieUpload.archivo.hash,
      evidenciaUrl: evidenciaUpload?.archivo.url ?? null,
      evidenciaHash: evidenciaUpload?.archivo.hash ?? null,
      comments,
    }

    const completadaEn = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('ruta_semanal_visita')
      .update({
        estatus: 'COMPLETADA',
        selfie_url: selfieUpload.archivo.url,
        evidencia_url: evidenciaUpload?.archivo.url ?? null,
        checklist_calidad: checklist,
        comentarios: comments,
        completada_en: completadaEn,
        metadata: serializeRutaVisitaWorkflowMetadata(metadata),
        updated_at: completadaEn,
      })
      .eq('id', visitaId)

    if (updateError) {
      return buildState({ message: updateError.message })
    }

    const { data: visitasRuta } = await supabase
      .from('ruta_semanal_visita')
      .select('id, estatus')
      .eq('ruta_semanal_id', visita.ruta_semanal_id)
      .limit(200)

    const todasCompletadas = (visitasRuta ?? []).every((item) => item.estatus === 'COMPLETADA')

    await supabase
      .from('ruta_semanal')
      .update({
        estatus: todasCompletadas ? 'CERRADA' : 'EN_PROGRESO',
        updated_by_usuario_id: actor.usuarioId,
        updated_at: completadaEn,
      })
      .eq('id', visita.ruta_semanal_id)

    await registrarEventoAudit(supabase, {
      tabla: 'ruta_semanal_visita',
      registroId: visitaId,
      cuentaClienteId: visita.cuenta_cliente_id,
      usuarioId: actor.usuarioId,
      payload: {
        evento: 'ruta_visita_checkout',
        gps_state: gpsState,
        latitud,
        longitud,
        distancia_metros: distanciaMetros,
        checklist,
        love_isdin_records_count: loveIsdinRecordsCount,
        selfie_hash: selfieUpload.archivo.hash,
        evidencia_hash: evidenciaUpload?.archivo.hash ?? null,
      },
    })

    revalidatePath('/ruta-semanal')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: 'Visita cerrada y checklist completado.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible cerrar la visita.',
    })
  }
}

export async function registrarInicioEventoAgendaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable()
    const supabase = await createClient()
    const service = createServiceClient() as TypedSupabaseClient
    const agendaEventoId = String(formData.get('agenda_evento_id') ?? '').trim()
    const selfieFile = asUploadedFile(formData.get('selfie_file'))
    const comments = normalizeText(formData.get('comments'))
    const latitud = normalizeFloat(formData.get('latitud'))
    const longitud = normalizeFloat(formData.get('longitud'))
    const distanciaMetros = normalizeFloat(formData.get('distancia_metros'))
    const gpsState = normalizeGpsState(formData.get('estado_gps'))

    if (!agendaEventoId) {
      return buildState({ message: 'El evento de agenda es obligatorio.' })
    }

    if (!selfieFile) {
      return buildState({ message: 'La selfie de llegada es obligatoria.' })
    }

    const { data: agendaEvento, error: eventError } = await supabase
      .from('ruta_agenda_evento')
      .select('id, cuenta_cliente_id, supervisor_empleado_id, metadata')
      .eq('id', agendaEventoId)
      .maybeSingle()

    if (eventError || !agendaEvento) {
      if (isRutaAgendaInfrastructureMissingError(eventError?.message)) {
        return buildAgendaInfrastructureState()
      }

      return buildState({ message: eventError?.message ?? 'No fue posible encontrar el evento operativo.' })
    }

    if (agendaEvento.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'El evento no pertenece al supervisor autenticado.' })
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
    })

    const metadata = parseRutaAgendaEventMetadata(agendaEvento.metadata)
    metadata.checkIn = {
      at: new Date().toISOString(),
      latitud,
      longitud,
      distanciaMetros,
      gpsState,
      selfieUrl: selfieUpload.archivo.url,
      selfieHash: selfieUpload.archivo.hash,
      evidenciaUrl: null,
      evidenciaHash: null,
      comments,
    }

    const { error: updateError } = await supabase
      .from('ruta_agenda_evento')
      .update({
        estatus_ejecucion: 'EN_CURSO',
        check_in_en: metadata.checkIn.at,
        selfie_url: selfieUpload.archivo.url,
        selfie_hash: selfieUpload.archivo.hash,
        metadata: serializeRutaAgendaEventMetadata(metadata),
      })
      .eq('id', agendaEventoId)

    if (updateError) {
      if (isRutaAgendaInfrastructureMissingError(updateError.message)) {
        return buildAgendaInfrastructureState()
      }

      return buildState({ message: updateError.message })
    }

    revalidatePath('/ruta-semanal')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: 'Evento operativo iniciado.',
    })
  } catch (error) {
    if (error instanceof Error && isRutaAgendaInfrastructureMissingError(error.message)) {
      return buildAgendaInfrastructureState()
    }

    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible iniciar el evento operativo.',
    })
  }
}

export async function registrarSalidaEventoAgendaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable()
    const supabase = await createClient()
    const service = createServiceClient() as TypedSupabaseClient
    const agendaEventoId = String(formData.get('agenda_evento_id') ?? '').trim()
    const selfieFile = asUploadedFile(formData.get('selfie_file'))
    const evidenciaFile = asUploadedFile(formData.get('evidencia_file'))
    const comments = normalizeText(formData.get('comments'))
    const latitud = normalizeFloat(formData.get('latitud'))
    const longitud = normalizeFloat(formData.get('longitud'))
    const distanciaMetros = normalizeFloat(formData.get('distancia_metros'))
    const gpsState = normalizeGpsState(formData.get('estado_gps'))

    if (!agendaEventoId) {
      return buildState({ message: 'El evento de agenda es obligatorio.' })
    }

    if (!selfieFile) {
      return buildState({ message: 'La selfie de salida es obligatoria.' })
    }

    const { data: agendaEvento, error: eventError } = await supabase
      .from('ruta_agenda_evento')
      .select('id, cuenta_cliente_id, supervisor_empleado_id, metadata')
      .eq('id', agendaEventoId)
      .maybeSingle()

    if (eventError || !agendaEvento) {
      if (isRutaAgendaInfrastructureMissingError(eventError?.message)) {
        return buildAgendaInfrastructureState()
      }

      return buildState({ message: eventError?.message ?? 'No fue posible encontrar el evento operativo.' })
    }

    if (agendaEvento.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'El evento no pertenece al supervisor autenticado.' })
    }

    const metadata = parseRutaAgendaEventMetadata(agendaEvento.metadata)
    if (!metadata.checkIn.at) {
      return buildState({ message: 'Primero debes registrar la llegada del evento.' })
    }

    const selfieUpload = await uploadRutaEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId: agendaEvento.cuenta_cliente_id,
      supervisorEmpleadoId: actor.empleadoId,
      file: selfieFile,
      evidenceKind: 'selfie',
    })

    const evidenciaUpload = evidenciaFile
      ? await uploadRutaEvidence(service, {
          actorUsuarioId: actor.usuarioId,
          cuentaClienteId: agendaEvento.cuenta_cliente_id,
          supervisorEmpleadoId: actor.empleadoId,
          file: evidenciaFile,
          evidenceKind: 'evidencia',
        })
      : null

    metadata.checkOut = {
      at: new Date().toISOString(),
      latitud,
      longitud,
      distanciaMetros,
      gpsState,
      selfieUrl: selfieUpload.archivo.url,
      selfieHash: selfieUpload.archivo.hash,
      evidenciaUrl: evidenciaUpload?.archivo.url ?? null,
      evidenciaHash: evidenciaUpload?.archivo.hash ?? null,
      comments,
    }

    const { error: updateError } = await supabase
      .from('ruta_agenda_evento')
      .update({
        estatus_ejecucion: 'COMPLETADO',
        check_out_en: metadata.checkOut.at,
        selfie_url: selfieUpload.archivo.url,
        selfie_hash: selfieUpload.archivo.hash,
        evidencia_url: evidenciaUpload?.archivo.url ?? null,
        evidencia_hash: evidenciaUpload?.archivo.hash ?? null,
        metadata: serializeRutaAgendaEventMetadata(metadata),
      })
      .eq('id', agendaEventoId)

    if (updateError) {
      if (isRutaAgendaInfrastructureMissingError(updateError.message)) {
        return buildAgendaInfrastructureState()
      }

      return buildState({ message: updateError.message })
    }

    revalidatePath('/ruta-semanal')
    revalidatePath('/dashboard')

    return buildState({
      ok: true,
      message: 'Evento operativo cerrado.',
    })
  } catch (error) {
    if (error instanceof Error && isRutaAgendaInfrastructureMissingError(error.message)) {
      return buildAgendaInfrastructureState()
    }

    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible cerrar el evento operativo.',
    })
  }
}
