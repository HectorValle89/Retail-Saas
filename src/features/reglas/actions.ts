'use server'

import { revalidatePath } from 'next/cache'
import { obtenerClienteAdmin } from '@/lib/auth/admin'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import type { ReglaNegocio } from '@/types/database'
import {
  APPROVAL_FLOW_RULE_CODES,
  SCHEDULE_LEVEL_OPTIONS,
  SCHEDULE_PRIORITY_RULE_CODE,
  SOLICITUD_TIPO_OPTIONS,
  SUPERVISOR_INHERITANCE_RULE_CODE,
  SUPERVISOR_SOURCE_OPTIONS,
  type ApprovalActor,
  type ApprovalStep,
  type SolicitudTipo,
} from './lib/businessRules'
import { ESTADO_REGLA_ADMIN_INICIAL, type ReglaAdminActionState } from './state'

function buildState(partial: Partial<ReglaAdminActionState>): ReglaAdminActionState {
  return {
    ...ESTADO_REGLA_ADMIN_INICIAL,
    ...partial,
  }
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    throw new Error(`${label} es obligatorio.`)
  }
  return normalized
}

function normalizeBoolean(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'true' || normalized === 'on') {
    return true
  }
  if (normalized === 'false' || normalized === 'off' || normalized === '') {
    return false
  }
  throw new Error('El valor booleano no es valido.')
}

function normalizePriority(value: FormDataEntryValue | null) {
  const parsed = Number(normalizeRequiredText(value, 'Prioridad'))
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('La prioridad debe ser un entero positivo.')
  }
  return parsed
}

function normalizeJson(value: FormDataEntryValue | null, label: string) {
  const raw = normalizeRequiredText(value, label)
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch (error) {
    throw new Error(
      `${label} no contiene JSON valido: ${error instanceof Error ? error.message : 'error desconocido'}.`
    )
  }
}

function normalizeOptionalInteger(value: FormDataEntryValue | null) {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('El valor debe ser un entero mayor o igual a cero.')
  }

  return parsed
}

function normalizeTime(value: FormDataEntryValue | null, label: string) {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    return null
  }

  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error(`${label} debe tener formato HH:MM.`)
  }

  return `${normalized}:00`
}

async function getAdminService() {
  const { service, error } = obtenerClienteAdmin()
  if (!service) {
    throw new Error(error ?? 'No fue posible inicializar el backend administrativo.')
  }
  return service
}

async function registrarEventoAudit(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  actorUsuarioId: string,
  registroId: string,
  payload: Record<string, unknown>
) {
  await service.from('audit_log').insert({
    tabla: 'regla_negocio',
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: actorUsuarioId,
    cuenta_cliente_id: null,
  })
}

async function upsertRegla(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  payload: Omit<ReglaNegocio, 'id' | 'created_at' | 'updated_at'>
) {
  const { data, error } = await service
    .from('regla_negocio')
    .upsert(
      {
        codigo: payload.codigo,
        modulo: payload.modulo,
        descripcion: payload.descripcion,
        severidad: payload.severidad,
        prioridad: payload.prioridad,
        condicion: payload.condicion,
        accion: payload.accion,
        activa: payload.activa,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'codigo' }
    )
    .select('id, codigo')
    .maybeSingle()

  if (error || !data) {
    throw new Error(error?.message ?? `No fue posible guardar la regla ${payload.codigo}.`)
  }

  return data as { id: string; codigo: string }
}

function revalidateRuleConsumers(code: string) {
  revalidatePath('/reglas')

  if (code === SUPERVISOR_INHERITANCE_RULE_CODE) {
    revalidatePath('/asignaciones')
    revalidatePath('/asistencias')
  }

  if (code === SCHEDULE_PRIORITY_RULE_CODE) {
    revalidatePath('/pdvs')
    revalidatePath('/asignaciones')
    revalidatePath('/asistencias')
  }

  if (Object.values(APPROVAL_FLOW_RULE_CODES).includes(code as (typeof APPROVAL_FLOW_RULE_CODES)[SolicitudTipo])) {
    revalidatePath('/dashboard')
  }
}

function parseOrderedTokens(input: string, allowed: readonly string[], label: string) {
  const allowedSet = new Set(allowed)
  const tokens = input
    .split(/[\s,]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)

  if (tokens.length === 0) {
    throw new Error(`${label} requiere al menos un valor.`)
  }

  const invalid = tokens.find((item) => !allowedSet.has(item))
  if (invalid) {
    throw new Error(`${invalid} no es un valor permitido para ${label}.`)
  }

  return Array.from(new Set(tokens))
}

export async function guardarReglaSupervisor(
  _prevState: ReglaAdminActionState,
  formData: FormData
): Promise<ReglaAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const description = normalizeRequiredText(formData.get('description'), 'Descripcion')
    const priority = normalizePriority(formData.get('priority'))
    const active = normalizeBoolean(formData.get('active'))
    const sources = parseOrderedTokens(
      normalizeRequiredText(formData.get('sources'), 'Fuentes'),
      SUPERVISOR_SOURCE_OPTIONS.map((item) => item.value),
      'Fuentes'
    )

    const saved = await upsertRegla(service, {
      codigo: SUPERVISOR_INHERITANCE_RULE_CODE,
      modulo: 'reglas',
      descripcion: description,
      severidad: 'ERROR',
      prioridad: priority,
      condicion: { sources },
      accion: { persist_to_assignment: true },
      activa: active,
    })

    await registrarEventoAudit(service, actor.usuarioId, saved.id, {
      evento: 'regla_supervisor_actualizada',
      codigo: saved.codigo,
      sources,
      activa: active,
    })

    revalidateRuleConsumers(saved.codigo)
    return buildState({ ok: true, message: 'Regla de herencia de supervisor actualizada.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'No fue posible guardar la regla.' })
  }
}

export async function guardarReglaHorario(
  _prevState: ReglaAdminActionState,
  formData: FormData
): Promise<ReglaAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const description = normalizeRequiredText(formData.get('description'), 'Descripcion')
    const priority = normalizePriority(formData.get('priority'))
    const active = normalizeBoolean(formData.get('active'))
    const levels = parseOrderedTokens(
      normalizeRequiredText(formData.get('levels'), 'Niveles'),
      SCHEDULE_LEVEL_OPTIONS.map((item) => item.value),
      'Niveles'
    )
    const fallbackLabel = normalizeOptionalText(formData.get('global_label'))
    const fallbackEntrada = normalizeTime(formData.get('global_hora_entrada'), 'Hora entrada global')
    const fallbackSalida = normalizeTime(formData.get('global_hora_salida'), 'Hora salida global')

    if ((fallbackEntrada && !fallbackSalida) || (!fallbackEntrada && fallbackSalida)) {
      return buildState({
        message: 'Hora entrada y hora salida global deben capturarse juntas.',
      })
    }

    const saved = await upsertRegla(service, {
      codigo: SCHEDULE_PRIORITY_RULE_CODE,
      modulo: 'reglas',
      descripcion: description,
      severidad: 'ALERTA',
      prioridad: priority,
      condicion: { levels },
      accion: {
        global_fallback: {
          label: fallbackLabel,
          hora_entrada: fallbackEntrada,
          hora_salida: fallbackSalida,
        },
      },
      activa: active,
    })

    await registrarEventoAudit(service, actor.usuarioId, saved.id, {
      evento: 'regla_horario_actualizada',
      codigo: saved.codigo,
      levels,
      activa: active,
    })

    revalidateRuleConsumers(saved.codigo)
    return buildState({ ok: true, message: 'Regla de prioridad de horarios actualizada.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'No fue posible guardar la regla.' })
  }
}

function parseApprovalStep(formData: FormData, position: 1 | 2 | 3): ApprovalStep | null {
  const actor = normalizeOptionalText(formData.get(`actor_${position}`))?.toUpperCase() ?? null
  const targetStatus = normalizeOptionalText(formData.get(`status_${position}`))
  const slaHours = normalizeOptionalInteger(formData.get(`sla_${position}`))

  if (!actor && !targetStatus) {
    return null
  }

  if (!actor || !targetStatus) {
    throw new Error(`El paso ${position} requiere actor y estado destino.`)
  }

  if (!['SUPERVISOR', 'COORDINADOR', 'NOMINA', 'ADMINISTRADOR'].includes(actor)) {
    throw new Error(`El actor ${actor} no es valido para el paso ${position}.`)
  }

  return {
    actor: actor as ApprovalActor,
    targetStatus,
    slaHours,
  }
}

export async function guardarFlujoAprobacion(
  _prevState: ReglaAdminActionState,
  formData: FormData
): Promise<ReglaAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const solicitudTipo = normalizeRequiredText(formData.get('solicitud_tipo'), 'Tipo solicitud')
      .toUpperCase() as SolicitudTipo
    if (!SOLICITUD_TIPO_OPTIONS.some((item) => item.value === solicitudTipo)) {
      return buildState({ message: 'El tipo de solicitud no es valido.' })
    }

    const description = normalizeRequiredText(formData.get('description'), 'Descripcion')
    const priority = normalizePriority(formData.get('priority'))
    const active = normalizeBoolean(formData.get('active'))
    const minNoticeDays = normalizeOptionalInteger(formData.get('min_notice_days'))
    const steps = [1, 2, 3]
      .map((position) => parseApprovalStep(formData, position as 1 | 2 | 3))
      .filter((item): item is ApprovalStep => Boolean(item))

    if (steps.length < 2) {
      return buildState({ message: 'El flujo requiere al menos dos pasos de aprobacion.' })
    }

    const code = APPROVAL_FLOW_RULE_CODES[solicitudTipo]
    const saved = await upsertRegla(service, {
      codigo: code,
      modulo: 'solicitudes',
      descripcion: description,
      severidad: 'ERROR',
      prioridad: priority,
      condicion: {
        tipo_solicitud: solicitudTipo,
        min_notice_days: minNoticeDays,
      },
      accion: {
        steps: steps.map((step) => ({
          actor: step.actor,
          target_status: step.targetStatus,
          sla_hours: step.slaHours,
        })),
      },
      activa: active,
    })

    await registrarEventoAudit(service, actor.usuarioId, saved.id, {
      evento: 'flujo_aprobacion_actualizado',
      codigo: saved.codigo,
      solicitud_tipo: solicitudTipo,
      steps,
      activa: active,
    })

    revalidateRuleConsumers(saved.codigo)
    return buildState({ ok: true, message: `Flujo ${solicitudTipo} actualizado.` })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'No fue posible guardar el flujo.' })
  }
}

export async function guardarReglaInventario(
  _prevState: ReglaAdminActionState,
  formData: FormData
): Promise<ReglaAdminActionState> {
  const actor = await requerirAdministradorActivo()

  try {
    const service = await getAdminService()
    const code = normalizeRequiredText(formData.get('code'), 'Codigo').toUpperCase()
    const modulo = normalizeRequiredText(formData.get('module'), 'Modulo')
    const description = normalizeRequiredText(formData.get('description'), 'Descripcion')
    const severity = normalizeRequiredText(formData.get('severity'), 'Severidad').toUpperCase()
    const priority = normalizePriority(formData.get('priority'))
    const active = normalizeBoolean(formData.get('active'))
    const condition = normalizeJson(formData.get('condition_json'), 'Condicion')
    const action = normalizeJson(formData.get('action_json'), 'Accion')

    if (!['ERROR', 'ALERTA', 'AVISO'].includes(severity)) {
      return buildState({ message: 'La severidad no es valida.' })
    }

    const saved = await upsertRegla(service, {
      codigo: code,
      modulo,
      descripcion: description,
      severidad: severity as ReglaNegocio['severidad'],
      prioridad: priority,
      condicion: condition,
      accion: action,
      activa: active,
    })

    await registrarEventoAudit(service, actor.usuarioId, saved.id, {
      evento: 'regla_inventario_actualizada',
      codigo: saved.codigo,
      modulo,
      activa: active,
    })

    revalidateRuleConsumers(saved.codigo)
    return buildState({ ok: true, message: `Regla ${saved.codigo} actualizada.` })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'No fue posible guardar la regla.' })
  }
}
