'use server'

import { revalidatePath } from 'next/cache'
import { requerirActorActivo } from '@/lib/auth/session'
import type { ActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import {
  enqueueAndProcessMaterializedAssignments,
  resolveMaterializationImpactRange,
} from '@/features/asignaciones/services/asignacionMaterializationService'
import { normalizeRequestedAccountId, readRequestAccountScope } from '@/lib/tenant/accountScope'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asignacion, Empleado, CuentaCliente, FormacionEvento, FormacionAsistencia } from '@/types/database'
import {
  buildFormacionTargetingMetadata,
  normalizeFormacionAttendanceMetadata,
  normalizeFormacionTargetingMetadata,
} from '@/features/formaciones/lib/formacionTargeting'
import { resolveFormacionPdvState } from '@/features/formaciones/lib/formacionTargeting'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import {
  ESTADO_FORMACION_ADMIN_INICIAL,
  type FormacionAdminActionState,
} from '@/features/formaciones/state'

const MANAGER_ROLES = [
  'ADMINISTRADOR',
  'SUPERVISOR',
  'COORDINADOR',
  'RECLUTAMIENTO',
  'LOVE_IS',
  'VENTAS',
]

const READ_ROLES = [...MANAGER_ROLES, 'DERMOCONSEJERO']
const FORMACION_EVIDENCE_BUCKET = 'operacion-evidencias'
const FORMACION_ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type FormacionEmpleadoRow = Pick<Empleado, 'id' | 'nombre_completo' | 'puesto' | 'zona' | 'supervisor_empleado_id'>
type FormacionAsignacionRow = Pick<
  Asignacion,
  'empleado_id' | 'pdv_id' | 'fecha_inicio' | 'fecha_fin' | 'estado_publicacion'
> & {
  empleado:
    | FormacionEmpleadoRow
    | FormacionEmpleadoRow[]
    | null
}
type FormacionParticipantePayload = {
  empleado_id: string
  nombre: string
  puesto: string | null
  zona: string | null
  rol: string | null
  notificado: boolean
  confirmado: boolean
  estado: 'PENDIENTE' | 'CONFIRMADO' | 'FALTANTE' | 'JUSTIFICADO'
  metadata?: Record<string, unknown>
}

function buildState(partial: Partial<FormacionAdminActionState>): FormacionAdminActionState {
  return {
    ...ESTADO_FORMACION_ADMIN_INICIAL,
    ...partial,
  }
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()

  if (!normalized) {
    throw new Error(`${label} es obligatorio.`)
  }

  return normalized
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeDate(value: FormDataEntryValue | null, label: string) {
  const normalized = normalizeRequiredText(value, label)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} debe tener formato YYYY-MM-DD.`)
  }

  return normalized
}

function normalizeTime(value: FormDataEntryValue | null, label: string) {
  const normalized = normalizeRequiredText(value, label)

  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error(`${label} debe tener formato HH:MM.`)
  }

  return normalized
}

function normalizeNumber(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()
  const parsed = Number(normalized)

  if (normalized && (Number.isNaN(parsed) || parsed < 0)) {
    throw new Error(`${label} debe ser un numérico positivo.`)
  }

  return Number.isNaN(parsed) ? 0 : parsed
}

function normalizeLineList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeSelectedIds(formData: FormData, key: string) {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  )
}

async function requerirGestorFormaciones() {
  const actor = await requerirActorActivo()

  if (!MANAGER_ROLES.includes(actor.puesto)) {
    throw new Error('No tienes permisos para gestionar formaciones.')
  }

  return actor
}

async function requerirVistaFormaciones() {
  const actor = await requerirActorActivo()

  if (!READ_ROLES.includes(actor.puesto)) {
    throw new Error('No tienes permisos para acceder a formaciones.')
  }

  return actor
}

function revalidateFormacionPaths() {
  revalidatePath('/formaciones')
  revalidatePath('/dashboard')
}

async function registrarEventoAudit(
  service: TypedSupabaseClient,
  {
    tabla,
    registroId,
    cuentaClienteId,
    payload,
    actorUsuarioId,
  }: {
    tabla: string
    registroId: string
    cuentaClienteId: string
    payload: Record<string, unknown>
    actorUsuarioId: string
  }
) {
  await service.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: actorUsuarioId,
    cuenta_cliente_id: cuentaClienteId,
  })
}

async function uploadFormacionManual({
  service,
  actorUsuarioId,
  eventoId,
  file,
}: {
  service: TypedSupabaseClient
  actorUsuarioId: string
  eventoId: string
  file: File
}) {
  if (!FORMACION_ALLOWED_MIME_TYPES.includes(file.type || 'application/pdf')) {
    throw new Error('El archivo de requisitos debe ser PDF o imagen compatible.')
  }

  const stored = await storeOptimizedEvidence({
    service,
    bucket: FORMACION_EVIDENCE_BUCKET,
    actorUsuarioId,
    storagePrefix: `formaciones/${eventoId}/manual`,
    file,
  })

  return {
    url: stored.archivo.url,
    hash: stored.archivo.hash,
    fileName: file.name,
    mimeType: file.type || 'application/pdf',
    uploadedAt: new Date().toISOString(),
    uploadedBy: actorUsuarioId,
  }
}

async function notifyFormacionParticipants(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    actorUsuarioId,
    eventoId,
    eventoNombre,
    eventType,
    modality,
    participants,
    supervisorId,
    coordinatorId,
    operationDate,
  }: {
    cuentaClienteId: string
    actorUsuarioId: string
    eventoId: string
    eventoNombre: string
    eventType: 'FORMACION' | 'ISDINIZACION'
    modality: 'PRESENCIAL' | 'EN_LINEA'
    participants: FormacionParticipantePayload[]
    supervisorId: string | null
    coordinatorId: string | null
    operationDate: string
  }
) {
  const recipientIds = Array.from(
    new Set(
      [
        ...participants.map((item) => item.empleado_id),
        supervisorId,
        coordinatorId,
      ].filter((item): item is string => Boolean(item))
    )
  )

  if (recipientIds.length === 0) {
    return
  }

  const title =
    eventType === 'ISDINIZACION'
      ? 'ISDINIZACION programada'
      : 'Formacion programada'
  const body = `${eventoNombre} reemplaza la operacion habitual del ${operationDate}. Modalidad: ${
    modality === 'EN_LINEA' ? 'En linea' : 'Presencial'
  }.`

  const { data: message, error: messageError } = await service
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: cuentaClienteId,
      creado_por_usuario_id: actorUsuarioId,
      titulo: title,
      cuerpo: body,
      tipo: 'MENSAJE',
      grupo_destino: 'TODOS_DCS',
      opciones_respuesta: [],
      metadata: {
        origen: 'formacion_evento',
        evento_id: eventoId,
        event_type: eventType,
        modality,
        operation_date: operationDate,
      },
    })
    .select('id')
    .maybeSingle()

  if (messageError || !message?.id) {
    throw new Error(messageError?.message ?? 'No fue posible generar la notificacion de la formacion.')
  }

  const recipientRows = recipientIds.map((empleadoId) => ({
    mensaje_id: message.id,
    cuenta_cliente_id: cuentaClienteId,
    empleado_id: empleadoId,
    estado: 'PENDIENTE' as const,
    metadata: {
      origen: 'formacion_evento',
      evento_id: eventoId,
    },
  }))

  const { error: recipientError } = await service.from('mensaje_receptor').insert(recipientRows)
  if (recipientError) {
    throw new Error(recipientError.message)
  }
}

function buildParticipantPayload(
  empleado: FormacionEmpleadoRow
): FormacionParticipantePayload {
  return {
    empleado_id: empleado.id,
    nombre: empleado.nombre_completo,
    puesto: empleado.puesto,
    zona: empleado.zona,
    rol: empleado.puesto,
    notificado: false,
    confirmado: false,
    estado: 'PENDIENTE',
  }
}

function mergeParticipants(rows: FormacionEmpleadoRow[]) {
  const seen = new Set<string>()
  return rows
    .filter((empleado) => {
      if (!empleado.id || seen.has(empleado.id)) {
        return false
      }

      seen.add(empleado.id)
      return true
    })
    .map((empleado) => buildParticipantPayload(empleado))
}

function collectParticipantIds(participantes: unknown) {
  if (!Array.isArray(participantes)) {
    return [] as string[]
  }

  return Array.from(
    new Set(
      participantes
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return null
          }

          const empleadoId = (item as Record<string, unknown>).empleado_id
          return typeof empleadoId === 'string' && empleadoId.trim().length > 0 ? empleadoId.trim() : null
        })
        .filter((item): item is string => Boolean(item))
    )
  )
}

function formationStateAffectsMaterialization(state: string | null | undefined) {
  return state === 'PROGRAMADA' || state === 'EN_CURSO'
}

async function refreshFormacionMaterialization(
  service: TypedSupabaseClient,
  input: {
    previousFechaInicio: string | null
    previousFechaFin: string | null
    previousEstado: string | null
    previousParticipantes: string[]
    nextFechaInicio: string
    nextFechaFin: string
    nextEstado: string
    nextParticipantes: string[]
    eventoId: string
  }
) {
  const previousAffects = formationStateAffectsMaterialization(input.previousEstado)
  const nextAffects = formationStateAffectsMaterialization(input.nextEstado)

  if (!previousAffects && !nextAffects) {
    return
  }

  const impactedEmployeeIds = Array.from(
    new Set([...input.previousParticipantes, ...input.nextParticipantes].filter(Boolean))
  )

  if (impactedEmployeeIds.length === 0) {
    return
  }

  const rawStart = [input.previousFechaInicio, input.nextFechaInicio]
    .filter((item): item is string => Boolean(item))
    .sort()[0]
  const rawEnd = [input.previousFechaFin, input.nextFechaFin]
    .filter((item): item is string => Boolean(item))
    .sort()
    .slice(-1)[0]

  if (!rawStart || !rawEnd) {
    return
  }

  const impact = resolveMaterializationImpactRange(rawStart, rawEnd)
  if (!impact) {
    return
  }

  await enqueueAndProcessMaterializedAssignments(
    impactedEmployeeIds.map((empleadoId) => ({
      empleadoId,
      fechaInicio: impact.fechaInicio,
      fechaFin: impact.fechaFin,
      motivo: 'FORMACION_ACTUALIZADA',
      payload: {
        formacion_evento_id: input.eventoId,
        estado_anterior: input.previousEstado,
        estado_nuevo: input.nextEstado,
      },
    })),
    service
  )
}
async function resolveDerivedParticipants(
  service: TypedSupabaseClient,
  {
    supervisorIds,
    coordinatorIds,
    pdvIds,
    fechaInicio,
    fechaFin,
  }: {
    supervisorIds: string[]
    coordinatorIds: string[]
    pdvIds: string[]
    fechaInicio: string
    fechaFin: string
  }
) {
  const directEmployeeIds = Array.from(new Set([...supervisorIds, ...coordinatorIds]))

  const [directEmployeesResult, asignacionesResult] = await Promise.all([
    directEmployeeIds.length > 0
      ? service
          .from('empleado')
          .select('id, nombre_completo, puesto, zona, supervisor_empleado_id')
          .in('id', directEmployeeIds)
      : Promise.resolve({ data: [] as FormacionEmpleadoRow[], error: null }),
    pdvIds.length > 0
      ? service
          .from('asignacion')
          .select('empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion, empleado:empleado_id(id, nombre_completo, puesto, zona)')
          .in('pdv_id', pdvIds)
          .eq('estado_publicacion', 'PUBLICADA')
          .lte('fecha_inicio', fechaFin)
          .or(`fecha_fin.gte.${fechaInicio},fecha_fin.is.null`)
      : Promise.resolve({ data: [] as FormacionAsignacionRow[], error: null }),
  ])

  if (directEmployeesResult.error) {
    throw new Error(directEmployeesResult.error.message)
  }

  if (asignacionesResult.error) {
    throw new Error(asignacionesResult.error.message)
  }

  const directRows = (directEmployeesResult.data ?? []) as FormacionEmpleadoRow[]
  const assignedRows = ((asignacionesResult.data ?? []) as FormacionAsignacionRow[])
    .map((row) => (Array.isArray(row.empleado) ? row.empleado[0] : row.empleado) ?? null)
    .filter((row): row is FormacionEmpleadoRow => Boolean(row))
    .filter((row) => row.puesto === 'DERMOCONSEJERO')

  return mergeParticipants([...directRows, ...assignedRows])
}

async function resolveSupervisorFormationScope(
  service: TypedSupabaseClient,
  input: {
    supervisorId: string
    operationDate: string
  }
) {
  const supervisorResult = await service
    .from('empleado')
    .select('id, nombre_completo, puesto, zona, supervisor_empleado_id')
    .eq('id', input.supervisorId)
    .maybeSingle()

  const supervisor = supervisorResult.data as FormacionEmpleadoRow | null

  if (supervisorResult.error || !supervisor || supervisor.puesto !== 'SUPERVISOR') {
    throw new Error('Selecciona un supervisor valido para la formacion.')
  }

  const coordinatorId = supervisor.supervisor_empleado_id
  const [coordinatorResult, pdvResult] = await Promise.all([
    coordinatorId
      ? service
          .from('empleado')
          .select('id, nombre_completo, puesto, zona, supervisor_empleado_id')
          .eq('id', coordinatorId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    service
      .from('pdv')
      .select(
        `
          id,
          nombre,
          zona,
          ciudad:ciudad_id(nombre, estado),
          supervisor_pdv!inner(empleado_id, activo, fecha_inicio, fecha_fin)
        `
      )
      .eq('estatus', 'ACTIVO'),
  ])

  const coordinator = coordinatorResult.data as FormacionEmpleadoRow | null
  const scopedPdvs = ((pdvResult.data ?? []) as Array<{
    id: string
    nombre: string
    zona: string | null
    ciudad:
      | { nombre: string | null; estado: string | null }
      | Array<{ nombre: string | null; estado: string | null }>
      | null
    supervisor_pdv:
      | { empleado_id: string; activo: boolean; fecha_inicio: string; fecha_fin: string | null }
      | Array<{ empleado_id: string; activo: boolean; fecha_inicio: string; fecha_fin: string | null }>
      | null
  }>)
    .filter((pdv) => {
      const relations = Array.isArray(pdv.supervisor_pdv)
        ? pdv.supervisor_pdv
        : pdv.supervisor_pdv
          ? [pdv.supervisor_pdv]
          : []
      return relations.some((relation) => {
        if (!relation.activo || relation.empleado_id !== input.supervisorId) {
          return false
        }

        if (relation.fecha_inicio > input.operationDate) {
          return false
        }

        return !relation.fecha_fin || relation.fecha_fin >= input.operationDate
      })
    })

  const pdvIds = scopedPdvs.map((item) => item.id)
  const dcAssignmentsResult =
    pdvIds.length > 0
      ? await service
          .from('asignacion')
          .select(
            'empleado_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion, empleado:empleado_id(id, nombre_completo, puesto, zona, supervisor_empleado_id)'
          )
          .eq('estado_publicacion', 'PUBLICADA')
          .in('pdv_id', pdvIds)
          .lte('fecha_inicio', input.operationDate)
          .or(`fecha_fin.gte.${input.operationDate},fecha_fin.is.null`)
      : { data: [] as FormacionAsignacionRow[], error: null }

  if (dcAssignmentsResult.error) {
    throw new Error(dcAssignmentsResult.error.message)
  }

  const dcAssignments = (dcAssignmentsResult.data ?? []) as FormacionAsignacionRow[]
  const directParticipants = mergeParticipants(
    [
      supervisor,
      coordinator,
      ...dcAssignments
        .map((row) => (Array.isArray(row.empleado) ? row.empleado[0] : row.empleado) ?? null)
        .filter((item): item is FormacionEmpleadoRow => Boolean(item))
        .filter((item) => item.puesto === 'DERMOCONSEJERO'),
    ].filter((item): item is FormacionEmpleadoRow => Boolean(item))
  )

  const assignmentByEmpleadoId = new Map(
    dcAssignments.map((row) => [row.empleado_id, row] as const)
  )
  const pdvById = new Map(
    scopedPdvs.map((pdv) => {
      const ciudad = Array.isArray(pdv.ciudad) ? pdv.ciudad[0] : pdv.ciudad
      return [
        pdv.id,
        {
          id: pdv.id,
          nombre: pdv.nombre,
          zona: pdv.zona,
          estado:
            resolveFormacionPdvState({
              ciudadNombre: ciudad?.nombre ?? null,
              ciudadEstado: ciudad?.estado ?? null,
            }) ?? 'Sin estado',
        },
      ] as const
    })
  )

  const participantes = directParticipants.map((participant) => {
    const assignment = participant.puesto === 'DERMOCONSEJERO' ? assignmentByEmpleadoId.get(participant.empleado_id) : null
    const originPdv = assignment?.pdv_id ? pdvById.get(assignment.pdv_id) ?? null : null
    return {
      ...participant,
      metadata: {
        origin_pdv_id: originPdv?.id ?? null,
        origin_pdv_name: originPdv?.nombre ?? null,
      },
    }
  })

  return {
    supervisor,
    coordinator,
    pdvIds,
    stateNames: Array.from(new Set(scopedPdvs.map((pdv) => pdvById.get(pdv.id)?.estado ?? 'Sin estado'))).sort((a, b) =>
      a.localeCompare(b, 'es-MX')
    ),
    participantes,
  }
}

async function resolveScopedPdvIds(
  service: TypedSupabaseClient,
  {
    explicitPdvIds,
    stateNames,
    supervisorIds,
  }: {
    explicitPdvIds: string[]
    stateNames: string[]
    supervisorIds: string[]
  }
) {
  if (explicitPdvIds.length > 0) {
    return explicitPdvIds
  }

  if (stateNames.length === 0 && supervisorIds.length === 0) {
    return []
  }

  const { data, error } = await service
    .from('pdv')
    .select(
      `
        id,
        zona,
        ciudad:ciudad_id(nombre, zona, estado),
        supervisor_pdv(empleado_id, activo, fecha_fin)
      `
    )
    .eq('estatus', 'ACTIVO')

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as Array<{
    id: string
    zona: string | null
    ciudad:
      | { nombre: string | null; zona: string | null; estado: string | null }
      | Array<{ nombre: string | null; zona: string | null; estado: string | null }>
      | null
    supervisor_pdv:
      | { empleado_id: string; activo: boolean; fecha_fin: string | null }
      | Array<{ empleado_id: string; activo: boolean; fecha_fin: string | null }>
      | null
  }>

  return rows
    .filter((row) => {
      const ciudad = Array.isArray(row.ciudad) ? row.ciudad[0] : row.ciudad
      const stateName =
        resolveFormacionPdvState({
          ciudadNombre: ciudad?.nombre ?? null,
          ciudadEstado: ciudad?.estado ?? null,
        }) ?? 'Sin estado'
      const supervisorRelations = Array.isArray(row.supervisor_pdv)
        ? row.supervisor_pdv
        : row.supervisor_pdv
          ? [row.supervisor_pdv]
          : []
      const supervisorMatch =
        supervisorIds.length === 0 ||
        supervisorRelations.some((relation) => relation.activo && supervisorIds.includes(relation.empleado_id))
      const stateMatch = stateNames.length === 0 || stateNames.includes(stateName)
      return supervisorMatch && stateMatch
    })
    .map((row) => row.id)
}

function buildExpenseLines(value: string) {
  return normalizeLineList(value).map((line) => {
    const [tipoRaw, montoRaw, comentarioRaw] = line.split('|').map((part) => part.trim())
    const monto = Number(montoRaw)

    if (!tipoRaw) {
      throw new Error('Define el tipo de gasto para cada línea.')
    }

    if (Number.isNaN(monto)) {
      throw new Error('El monto del gasto debe ser numérico válido.')
    }

    return {
      tipo: tipoRaw,
      monto,
      comentario: comentarioRaw || null,
    }
  })
}

async function syncAsistenciasEvento(
  service: TypedSupabaseClient,
  {
    eventoId,
    cuentaClienteId,
    participantes,
  }: {
    eventoId: string
    cuentaClienteId: string
    participantes: FormacionParticipantePayload[]
  }
) {
  const { data: existingRaw, error: existingError } = await service
    .from('formacion_asistencia')
    .select('id, empleado_id, metadata')
    .eq('evento_id', eventoId)

  if (existingError) {
    throw new Error(existingError.message)
  }

  const existingRows = (existingRaw ?? []) as Pick<FormacionAsistencia, 'id' | 'empleado_id' | 'metadata'>[]
  const existingByEmpleadoId = new Map(existingRows.map((row) => [row.empleado_id, row]))
  const participantesByEmpleadoId = new Map(
    participantes.map((participante) => [participante.empleado_id, participante] as const)
  )

  const rowsToInsert = participantes
    .filter((participante) => !existingByEmpleadoId.has(participante.empleado_id))
    .map((participante) => ({
      evento_id: eventoId,
      cuenta_cliente_id: cuentaClienteId,
      empleado_id: participante.empleado_id,
      participante_nombre: participante.nombre,
      puesto: participante.puesto,
      metadata: participante.metadata ?? {},
    }))

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await service.from('formacion_asistencia').insert(rowsToInsert)

    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  const rowsToDelete = existingRows.filter(
    (row) => !participantesByEmpleadoId.has(row.empleado_id)
  )

  if (rowsToDelete.length > 0) {
    const { error: deleteError } = await service
      .from('formacion_asistencia')
      .delete()
      .in(
        'id',
        rowsToDelete.map((row) => row.id)
      )

    if (deleteError) {
      throw new Error(deleteError.message)
    }
  }

  await Promise.all(
    participantes.map(async (participante) => {
      const existing = existingByEmpleadoId.get(participante.empleado_id)

      if (!existing) {
        return
      }

      const { error: updateError } = await service
        .from('formacion_asistencia')
        .update({
          participante_nombre: participante.nombre,
          puesto: participante.puesto,
          metadata: {
            ...normalizeFormacionAttendanceMetadata(existing.metadata),
            ...(participante.metadata ?? {}),
          },
        })
        .eq('id', existing.id)

      if (updateError) {
        throw new Error(updateError.message)
      }
    })
  )
}

function buildNotificationLines(value: string) {
  return normalizeLineList(value).map((line) => {
    const [canalRaw, mensajeRaw] = line.split('|').map((part) => part.trim())

    if (!mensajeRaw) {
      throw new Error('Cada notificación requiere un mensaje.')
    }

    return {
      canal: canalRaw || 'GENERAL',
      mensaje: mensajeRaw,
      estado: 'PENDIENTE',
      enviado_en: new Date().toISOString(),
    }
  })
}

async function pickAccountId(
  actor: Awaited<ReturnType<typeof requerirGestorFormaciones>> | ActorActual,
  service: TypedSupabaseClient,
  formData: FormData
) {
  const requestedAccountId = normalizeRequestedAccountId(formData.get('cuenta_cliente_id'))
  const scope = await readRequestAccountScope()
  const candidateId =
    actor.puesto === 'ADMINISTRADOR'
      ? requestedAccountId ?? scope.accountId
      : actor.cuentaClienteId ?? requestedAccountId ?? scope.accountId

  if (!candidateId) {
    throw new Error('Selecciona una cuenta cliente activa para la formación.')
  }

  const { data: cuentaRaw, error } = await service
    .from('cuenta_cliente')
    .select('id, nombre, activa')
    .eq('id', candidateId)
    .maybeSingle()

  const cuenta = cuentaRaw as CuentaCliente | null

  if (error || !cuenta || !cuenta.activa) {
    throw new Error('La cuenta cliente seleccionada no existe o no está activa.')
  }

  return cuenta
}

export async function guardarFormacion(
  _prevState: FormacionAdminActionState,
  formData: FormData
): Promise<FormacionAdminActionState> {
  try {
    const actor = await requerirGestorFormaciones()
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaCliente = await pickAccountId(actor, service, formData)
    const eventoId = normalizeOptionalText(formData.get('evento_id'))
    const nombre = normalizeRequiredText(formData.get('nombre'), 'Nombre')
    const descripcion = normalizeOptionalText(formData.get('descripcion'))
    const tipoEvento =
      normalizeOptionalText(formData.get('tipo_evento')) === 'ISDINIZACION' ? 'ISDINIZACION' : 'FORMACION'
    const modalidad =
      normalizeOptionalText(formData.get('modalidad')) === 'EN_LINEA' ? 'EN_LINEA' : 'PRESENCIAL'
    const sede = normalizeRequiredText(formData.get('sede'), modalidad === 'EN_LINEA' ? 'Liga o sede virtual' : 'Sede')
    const ciudad = normalizeOptionalText(formData.get('ciudad'))
    const tipo = tipoEvento
    const fechaInicio = normalizeDate(formData.get('fecha_inicio'), 'Fecha')
    const fechaFin = normalizeDate(formData.get('fecha_fin'), 'Fecha fin')
    const horarioInicio = normalizeTime(formData.get('horario_inicio'), 'Horario inicio')
    const horarioFin = normalizeTime(formData.get('horario_fin'), 'Horario fin')
    const estadoRaw = normalizeOptionalText(formData.get('estado')) ?? 'BORRADOR'
    const estado = estadoRaw as FormacionEvento['estado']
    const responsableId = normalizeOptionalText(formData.get('responsable_id'))
    const selectedSupervisorId = normalizeRequiredText(formData.get('supervisor_id'), 'Supervisor')
    const selectedCoordinatorId = normalizeOptionalText(formData.get('coordinador_id'))
    const selectedPdvIds = normalizeSelectedIds(formData, 'pdv_id')
    const ubicacionDireccion = normalizeOptionalText(formData.get('ubicacion_direccion'))
    const ubicacionLatitudRaw = normalizeOptionalText(formData.get('ubicacion_latitud'))
    const ubicacionLongitudRaw = normalizeOptionalText(formData.get('ubicacion_longitud'))
    const ubicacionRadioRaw = normalizeOptionalText(formData.get('ubicacion_radio_metros'))
    const gastosText = String(formData.get('gastos_operativos') ?? '')
    const gastosOperativos = gastosText ? buildExpenseLines(gastosText) : []
    const notificacionesText = String(formData.get('notificaciones') ?? '')
    const notificaciones = notificacionesText ? buildNotificationLines(notificacionesText) : []
    const manualFile = formData.get('manual_pdf')
    const previousEventResult = eventoId
      ? await service
          .from('formacion_evento')
          .select('id, fecha_inicio, fecha_fin, estado, participantes, metadata')
          .eq('id', eventoId)
          .maybeSingle()
      : { data: null, error: null }
    const previousEvent = previousEventResult.data as Pick<
      FormacionEvento,
      'id' | 'fecha_inicio' | 'fecha_fin' | 'estado' | 'participantes' | 'metadata'
    > | null

    if (previousEventResult.error) {
      throw new Error(previousEventResult.error.message)
    }

    if (fechaFin < fechaInicio) {
      throw new Error('La fecha fin no puede ser anterior a la fecha inicio.')
    }

    if (selectedPdvIds.length === 0) {
      throw new Error('Selecciona al menos un PDV participante para el evento.')
    }

    const locationLatitude = ubicacionLatitudRaw === null ? null : Number(ubicacionLatitudRaw)
    const locationLongitude = ubicacionLongitudRaw === null ? null : Number(ubicacionLongitudRaw)
    const locationRadiusMeters = ubicacionRadioRaw === null ? null : Number(ubicacionRadioRaw)

    if (modalidad === 'PRESENCIAL') {
      if (!ubicacionDireccion) {
        throw new Error('La direccion del evento presencial es obligatoria.')
      }

      if (!Number.isFinite(locationLatitude) || !Number.isFinite(locationLongitude)) {
        throw new Error('La latitud y longitud del evento presencial son obligatorias.')
      }
    }

    const resolvedScope = await resolveSupervisorFormationScope(service, {
      supervisorId: selectedSupervisorId,
      operationDate: fechaInicio,
    })
    const scopedPdvIds = selectedPdvIds.filter((pdvId) => resolvedScope.pdvIds.includes(pdvId))

    if (scopedPdvIds.length === 0) {
      throw new Error('Los PDVs seleccionados no corresponden al supervisor elegido.')
    }

    const participants = await resolveDerivedParticipants(service, {
      supervisorIds: [resolvedScope.supervisor.id],
      coordinatorIds: [selectedCoordinatorId ?? resolvedScope.coordinator?.id].filter((item): item is string => Boolean(item)),
      pdvIds: scopedPdvIds,
      fechaInicio,
      fechaFin,
    })

    const pdvParticipantMeta = new Map(
      resolvedScope.participantes
        .filter((item) => typeof item.empleado_id === 'string')
        .map((item) => [item.empleado_id, item.metadata ?? {}] as const)
    )
    const participantes = participants.map((participant) => ({
      ...participant,
      metadata: pdvParticipantMeta.get(participant.empleado_id) ?? {},
    }))
    const previousTargeting = normalizeFormacionTargetingMetadata(previousEvent?.metadata ?? {})
    const selectedCoordinator = selectedCoordinatorId
      ? participants.find((item) => item.empleado_id === selectedCoordinatorId) ?? null
      : null
    const resolvedCoordinatorId = selectedCoordinatorId ?? resolvedScope.coordinator?.id ?? null
    const resolvedCoordinatorName =
      selectedCoordinator?.nombre ??
      (selectedCoordinatorId === resolvedScope.coordinator?.id
        ? resolvedScope.coordinator?.nombre_completo ?? null
        : selectedCoordinator?.nombre ?? null)

    const nextMetadata = buildFormacionTargetingMetadata({
      eventType: tipoEvento,
      modality: modalidad,
      stateNames: resolvedScope.stateNames,
      supervisorIds: [resolvedScope.supervisor.id],
      coordinatorIds: [resolvedCoordinatorId].filter((item): item is string => Boolean(item)),
      pdvIds: scopedPdvIds,
      operationDate: fechaInicio,
      scheduleStart: horarioInicio,
      scheduleEnd: horarioFin,
      primarySupervisorId: resolvedScope.supervisor.id,
      primaryCoordinatorId: resolvedCoordinatorId,
      supervisorName: resolvedScope.supervisor.nombre_completo,
      coordinatorName: resolvedCoordinatorName,
      expectedDcCount: participantes.filter((item) => item.puesto === 'DERMOCONSEJERO').length,
      expectedSupervisorCount: participantes.some((item) => item.puesto === 'SUPERVISOR') ? 1 : 0,
      expectedCoordinatorCount: resolvedCoordinatorId ? 1 : 0,
      expectedStoreCount: scopedPdvIds.length,
      locationAddress: modalidad === 'PRESENCIAL' ? ubicacionDireccion : sede,
      locationLatitude: modalidad === 'PRESENCIAL' && Number.isFinite(locationLatitude) ? locationLatitude : null,
      locationLongitude: modalidad === 'PRESENCIAL' && Number.isFinite(locationLongitude) ? locationLongitude : null,
      locationRadiusMeters:
        modalidad === 'PRESENCIAL' && Number.isFinite(locationRadiusMeters) ? locationRadiusMeters : 100,
      manualDocument: previousTargeting.manualDocument,
    })

    const payload: Partial<FormacionEvento> = {
      cuenta_cliente_id: cuentaCliente.id,
      nombre,
      descripcion,
      sede,
      ciudad,
      tipo,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      estado,
      participantes,
      gastos_operativos: gastosOperativos,
      notificaciones,
      metadata: nextMetadata,
      updated_by_usuario_id: actor.usuarioId,
    }

    payload.responsable_empleado_id = responsableId ?? resolvedScope.supervisor.id

    let resolvedEventoId = eventoId

    if (eventoId) {
      const { error: updateError } = await service.from('formacion_evento').update(payload).eq('id', eventoId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      await syncAsistenciasEvento(service, {
        eventoId,
        cuentaClienteId: cuentaCliente.id,
        participantes,
      })

      await registrarEventoAudit(service, {
        cuentaClienteId: cuentaCliente.id,
        actorUsuarioId: actor.usuarioId,
        tabla: 'formacion_evento',
        registroId: eventoId,
        payload: { accion: 'actualizar_formacion', nombre },
      })
    } else {
      payload.created_by_usuario_id = actor.usuarioId
      const { data: created } = await service
        .from('formacion_evento')
        .insert(payload)
        .select('id')
        .maybeSingle()

      if (!created?.id) {
        throw new Error('No se pudo crear la formación.')
      }

      resolvedEventoId = created.id

      await syncAsistenciasEvento(service, {
        eventoId: created.id,
        cuentaClienteId: cuentaCliente.id,
        participantes,
      })

      await registrarEventoAudit(service, {
        cuentaClienteId: cuentaCliente.id,
        actorUsuarioId: actor.usuarioId,
        tabla: 'formacion_evento',
        registroId: created.id,
        payload: { accion: 'crear_formacion', nombre },
      })
    }

    if (!resolvedEventoId) {
      throw new Error('No se pudo resolver el identificador del evento.')
    }

    if (manualFile instanceof File && manualFile.size > 0) {
      const manualDocument = await uploadFormacionManual({
        service,
        actorUsuarioId: actor.usuarioId,
        eventoId: resolvedEventoId,
        file: manualFile,
      })

      const { error: manualUpdateError } = await service
        .from('formacion_evento')
        .update({
          metadata: {
            ...nextMetadata,
            manual_document: manualDocument,
          },
        })
        .eq('id', resolvedEventoId)

      if (manualUpdateError) {
        throw new Error(manualUpdateError.message)
      }
    }

    if (resolvedEventoId) {
      await refreshFormacionMaterialization(service, {
        previousFechaInicio: previousEvent?.fecha_inicio ?? null,
        previousFechaFin: previousEvent?.fecha_fin ?? null,
        previousEstado: previousEvent?.estado ?? null,
        previousParticipantes: collectParticipantIds(previousEvent?.participantes),
        nextFechaInicio: fechaInicio,
        nextFechaFin: fechaFin,
        nextEstado: estado,
        nextParticipantes: collectParticipantIds(participantes),
        eventoId: resolvedEventoId,
      })
    }

    await notifyFormacionParticipants(service, {
      cuentaClienteId: cuentaCliente.id,
      actorUsuarioId: actor.usuarioId,
      eventoId: resolvedEventoId,
      eventoNombre: nombre,
      eventType: tipoEvento,
      modality: modalidad,
      participants: participantes,
      supervisorId: resolvedScope.supervisor.id,
      coordinatorId: resolvedCoordinatorId,
      operationDate: fechaInicio,
    })

    revalidateFormacionPaths()

    return buildState({ ok: true, message: 'Formación guardada correctamente.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}

export async function registrarAsistenciaFormacion(
  _prevState: FormacionAdminActionState,
  formData: FormData
): Promise<FormacionAdminActionState> {
  try {
    const actor = await requerirVistaFormaciones()
    const service = createServiceClient() as TypedSupabaseClient
    const asistenciaId = normalizeRequiredText(formData.get('asistencia_id'), 'Asistencia')
    const presente = Boolean(formData.get('presente'))
    const confirmado = Boolean(formData.get('confirmado'))
    const comentarios = normalizeOptionalText(formData.get('comentarios'))
    const evidenciaText = String(formData.get('evidencias') ?? '')
    const evidencias = evidenciaText ? normalizeLineList(evidenciaText).map((item) => ({ descripcion: item })) : []
    const estado = presente ? (confirmado ? 'CONFIRMADO' : 'PENDIENTE') : 'FALTANTE'

    const { data: asistenciaRaw } = await service
      .from('formacion_asistencia')
      .select('id, evento_id, cuenta_cliente_id')
      .eq('id', asistenciaId)
      .maybeSingle()

    const asistencia = asistenciaRaw as FormacionAsistencia | null

    if (!asistencia) {
      throw new Error('La asistencia seleccionada no existe.')
    }

    await service
      .from('formacion_asistencia')
      .update({ presente, confirmado, estado, comentarios, evidencias, metadata: {} })
      .eq('id', asistenciaId)

    await registrarEventoAudit(service, {
      cuentaClienteId: asistencia.cuenta_cliente_id,
      actorUsuarioId: actor.usuarioId,
      tabla: 'formacion_asistencia',
      registroId: asistencia.id,
      payload: { accion: 'actualizar_asistencia', estado },
    })

    revalidateFormacionPaths()

    return buildState({ ok: true, message: 'Asistencia actualizada.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}

function resolveGeofenceStatus(metadata: Record<string, unknown>, latitude: number | null, longitude: number | null) {
  const centerLat = Number(metadata.sede_latitude)
  const centerLng = Number(metadata.sede_longitude)
  const radius = Number(metadata.sede_radius_meters)

  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || !Number.isFinite(radius) || latitude === null || longitude === null) {
    return {
      status: 'SIN_VALIDAR' as const,
      distanceMeters: null,
    }
  }

  const toRadians = (value: number) => (value * Math.PI) / 180
  const earthRadius = 6371000
  const deltaLat = toRadians(latitude - centerLat)
  const deltaLng = toRadians(longitude - centerLng)
  const lat1 = toRadians(centerLat)
  const lat2 = toRadians(latitude)
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2) * Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distanceMeters = Math.round(earthRadius * c)

  return {
    status: distanceMeters <= radius ? ('DENTRO' as const) : ('FUERA' as const),
    distanceMeters,
  }
}

async function registrarMovimientoAsistenciaFormacion(
  mode: 'CHECK_IN' | 'CHECK_OUT',
  formData: FormData
): Promise<FormacionAdminActionState> {
  try {
    const actor = await requerirVistaFormaciones()
    const service = createServiceClient() as TypedSupabaseClient
    const eventoId = normalizeRequiredText(formData.get('evento_id'), 'Formacion')
    const selfie = formData.get('selfie')

    if (!(selfie instanceof File) || selfie.size === 0) {
      throw new Error('La selfie desde camara es obligatoria.')
    }

    const { data: asistenciaRaw, error: asistenciaError } = await service
      .from('formacion_asistencia')
      .select('id, evento_id, cuenta_cliente_id, empleado_id, metadata')
      .eq('evento_id', eventoId)
      .eq('empleado_id', actor.empleadoId)
      .maybeSingle()

    const asistencia = asistenciaRaw as (Pick<FormacionAsistencia, 'id' | 'evento_id' | 'cuenta_cliente_id' | 'empleado_id' | 'metadata'>) | null

    if (asistenciaError || !asistencia) {
      throw new Error('No existe una asistencia esperada de formacion para este colaborador.')
    }

    const { data: eventoRaw, error: eventoError } = await service
      .from('formacion_evento')
      .select('id, metadata')
      .eq('id', eventoId)
      .maybeSingle()

    const evento = eventoRaw as Pick<FormacionEvento, 'id' | 'metadata'> | null

    if (eventoError || !evento) {
      throw new Error('No se encontro la formacion seleccionada.')
    }

    const stored = await storeOptimizedEvidence({
      service,
      bucket: 'evidencias-operacion',
      actorUsuarioId: actor.usuarioId,
      storagePrefix: `formaciones/${eventoId}/${actor.empleadoId}/${mode.toLowerCase()}`,
      file: selfie,
    })

    const latitude = normalizeOptionalText(formData.get('latitude'))
    const longitude = normalizeOptionalText(formData.get('longitude'))
    const parsedLat = latitude === null ? null : Number(latitude)
    const parsedLng = longitude === null ? null : Number(longitude)
    const targeting = normalizeFormacionTargetingMetadata(evento.metadata ?? {})
    const isOnline = targeting.modality === 'EN_LINEA'
    const geofence = isOnline
      ? {
          status: 'SIN_VALIDAR' as const,
          distanceMeters: null,
        }
      : resolveGeofenceStatus(
          (evento.metadata ?? {}) as Record<string, unknown>,
          Number.isFinite(parsedLat) ? parsedLat : null,
          Number.isFinite(parsedLng) ? parsedLng : null
        )
    const currentMetadata = normalizeFormacionAttendanceMetadata(asistencia.metadata)
    const nowIso = new Date().toISOString()

    const nextMetadata = {
      ...asistencia.metadata,
      attendance_mode: targeting.modality,
      ...(mode === 'CHECK_IN'
        ? {
            check_in_utc: nowIso,
            check_in_evidence_url: stored.archivo.url,
            check_in_evidence_hash: stored.archivo.hash,
            check_in_geofence_status: geofence.status,
            check_in_latitude: Number.isFinite(parsedLat) ? parsedLat : null,
            check_in_longitude: Number.isFinite(parsedLng) ? parsedLng : null,
            check_in_distance_meters: geofence.distanceMeters,
          }
        : {
            check_out_utc: nowIso,
            check_out_evidence_url: stored.archivo.url,
            check_out_evidence_hash: stored.archivo.hash,
            check_out_geofence_status: geofence.status,
            check_out_latitude: Number.isFinite(parsedLat) ? parsedLat : null,
            check_out_longitude: Number.isFinite(parsedLng) ? parsedLng : null,
            check_out_distance_meters: geofence.distanceMeters,
          }),
    }

    const nextEstado =
      mode === 'CHECK_IN'
        ? 'CONFIRMADO'
        : currentMetadata.checkInUtc
          ? 'JUSTIFICADO'
          : 'CONFIRMADO'

    const nextComentarios =
      mode === 'CHECK_OUT'
        ? normalizeOptionalText(formData.get('comentarios')) ?? null
        : null

    const { error: updateError } = await service
      .from('formacion_asistencia')
      .update({
        presente: true,
        confirmado: mode === 'CHECK_OUT' ? true : true,
        estado: nextEstado,
        comentarios: nextComentarios,
        metadata: nextMetadata,
      })
      .eq('id', asistencia.id)

    if (updateError) {
      throw new Error(updateError.message)
    }

    await registrarEventoAudit(service, {
      cuentaClienteId: asistencia.cuenta_cliente_id,
      actorUsuarioId: actor.usuarioId,
      tabla: 'formacion_asistencia',
      registroId: asistencia.id,
      payload: {
        accion: mode === 'CHECK_IN' ? 'registrar_llegada_formacion' : 'registrar_salida_formacion',
        geofence_status: geofence.status,
        distance_meters: geofence.distanceMeters,
      },
    })

    revalidateFormacionPaths()

    return buildState({
      ok: true,
      message: mode === 'CHECK_IN' ? 'Llegada a formacion registrada.' : 'Salida de formacion registrada.',
    })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}

export async function registrarLlegadaFormacionDashboard(
  _prevState: FormacionAdminActionState,
  formData: FormData
): Promise<FormacionAdminActionState> {
  return registrarMovimientoAsistenciaFormacion('CHECK_IN', formData)
}

export async function registrarSalidaFormacionDashboard(
  _prevState: FormacionAdminActionState,
  formData: FormData
): Promise<FormacionAdminActionState> {
  return registrarMovimientoAsistenciaFormacion('CHECK_OUT', formData)
}

export async function registrarGastoFormacion(
  _prevState: FormacionAdminActionState,
  formData: FormData
): Promise<FormacionAdminActionState> {
  try {
    const actor = await requerirGestorFormaciones()
    const service = createServiceClient() as TypedSupabaseClient
    const eventoId = normalizeRequiredText(formData.get('evento_id'), 'Formación')
    const tipo = normalizeRequiredText(formData.get('tipo'), 'Tipo de gasto')
    const monto = normalizeNumber(formData.get('monto'), 'Monto')
    const comentario = normalizeOptionalText(formData.get('comentario'))

    const { data: eventoRaw } = await service
      .from('formacion_evento')
      .select('cuenta_cliente_id, gastos_operativos')
      .eq('id', eventoId)
      .maybeSingle()

    const evento = eventoRaw as FormacionEvento | null

    if (!evento) {
      throw new Error('No se encontró la formación solicitada.')
    }

    const nextGastos = [
      ...(Array.isArray(evento.gastos_operativos) ? evento.gastos_operativos : []),
      {
        tipo,
        monto,
        comentario,
        generado_en: new Date().toISOString(),
        usuario_id: actor.usuarioId,
      },
    ]

    await service
      .from('formacion_evento')
      .update({ gastos_operativos: nextGastos })
      .eq('id', eventoId)

    await registrarEventoAudit(service, {
      cuentaClienteId: evento.cuenta_cliente_id,
      actorUsuarioId: actor.usuarioId,
      tabla: 'formacion_evento',
      registroId: eventoId,
      payload: { accion: 'registrar_gasto', tipo, monto },
    })

    revalidateFormacionPaths()

    return buildState({ ok: true, message: 'Gasto registrado.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}

export async function registrarNotificacionFormacion(
  _prevState: FormacionAdminActionState,
  formData: FormData
): Promise<FormacionAdminActionState> {
  try {
    const actor = await requerirGestorFormaciones()
    const service = createServiceClient() as TypedSupabaseClient
    const eventoId = normalizeRequiredText(formData.get('evento_id'), 'Formación')
    const canal = normalizeRequiredText(formData.get('canal'), 'Canal')
    const mensaje = normalizeRequiredText(formData.get('mensaje'), 'Mensaje')

    const { data: eventoRaw } = await service
      .from('formacion_evento')
      .select('cuenta_cliente_id, notificaciones')
      .eq('id', eventoId)
      .maybeSingle()

    const evento = eventoRaw as FormacionEvento | null

    if (!evento) {
      throw new Error('No se encontró la formación solicitada.')
    }

    const nextNotificaciones = [
      ...(Array.isArray(evento.notificaciones) ? evento.notificaciones : []),
      {
        canal,
        mensaje,
        estado: 'ENVIADO',
        enviado_en: new Date().toISOString(),
        participante_id: normalizeOptionalText(formData.get('participante_id')),
      },
    ]

    await service
      .from('formacion_evento')
      .update({ notificaciones: nextNotificaciones })
      .eq('id', eventoId)

    await registrarEventoAudit(service, {
      cuentaClienteId: evento.cuenta_cliente_id,
      actorUsuarioId: actor.usuarioId,
      tabla: 'formacion_evento',
      registroId: eventoId,
      payload: { accion: 'registrar_notificacion', canal },
    })

    revalidateFormacionPaths()

    return buildState({ ok: true, message: 'Notificación registrada.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Error desconocido.' })
  }
}
