'use server'

import { revalidatePath } from 'next/cache'
import { requerirActorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import {
  getWeekEndIso,
  isAssignmentActiveForWeek,
  normalizeWeekStart,
} from './lib/weeklyRoute'

interface RutaActionState {
  ok: boolean
  message: string | null
}

export const ESTADO_RUTA_INICIAL: RutaActionState = {
  ok: false,
  message: null,
}

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

function normalizeInt(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(String(value ?? '').trim())

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} invalido.`)
  }

  return parsed
}

function buildChecklist(formData: FormData) {
  return {
    fachada_ok: String(formData.get('checklist_fachada_ok') ?? '').trim() === 'true',
    material_ok: String(formData.get('checklist_material_ok') ?? '').trim() === 'true',
    equipo_ok: String(formData.get('checklist_equipo_ok') ?? '').trim() === 'true',
  }
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

export async function completarVisitaRutaSemanal(
  _prevState: RutaActionState,
  formData: FormData
): Promise<RutaActionState> {
  try {
    const actor = await requerirSupervisorRutaEditable()
    const supabase = await createClient()
    const visitaId = String(formData.get('visita_id') ?? '').trim()
    const selfieUrl = normalizeText(formData.get('selfie_url'))
    const evidenciaUrl = normalizeText(formData.get('evidencia_url'))
    const comentarios = normalizeText(formData.get('comentarios'))
    const checklist = buildChecklist(formData)

    if (!visitaId) {
      return buildState({ message: 'La visita es obligatoria.' })
    }

    if (!selfieUrl) {
      return buildState({ message: 'La selfie de supervision es obligatoria para cerrar la visita.' })
    }

    const { data: visita, error: visitaError } = await supabase
      .from('ruta_semanal_visita')
      .select('id, ruta_semanal_id, cuenta_cliente_id, supervisor_empleado_id, estatus')
      .eq('id', visitaId)
      .maybeSingle()

    if (visitaError || !visita) {
      return buildState({ message: visitaError?.message ?? 'No fue posible encontrar la visita.' })
    }

    if (visita.supervisor_empleado_id !== actor.empleadoId) {
      return buildState({ message: 'La visita no pertenece al supervisor autenticado.' })
    }

    const completadaEn = new Date().toISOString()
    const { error: updateVisitError } = await supabase
      .from('ruta_semanal_visita')
      .update({
        estatus: 'COMPLETADA',
        selfie_url: selfieUrl,
        evidencia_url: evidenciaUrl,
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
        selfie_url: Boolean(selfieUrl),
        evidencia_url: Boolean(evidenciaUrl),
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