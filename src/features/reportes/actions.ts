'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { isExportFormat, isExportSectionKey } from './services/reporteExport'
import { computeNextScheduledRun, type ReporteProgramadoFrecuencia } from './services/reporteScheduleService'
import { ESTADO_REPORTE_PROGRAMADO_INICIAL, type ReporteProgramadoActionState } from './state'

function buildState(partial: Partial<ReporteProgramadoActionState>): ReporteProgramadoActionState {
  return {
    ...ESTADO_REPORTE_PROGRAMADO_INICIAL,
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

function normalizeEmail(value: FormDataEntryValue | null) {
  const email = normalizeRequiredText(value, 'El destinatario').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('El correo del destinatario no es valido.')
  }
  return email
}

function normalizeFrequency(value: FormDataEntryValue | null): ReporteProgramadoFrecuencia {
  const normalized = normalizeRequiredText(value, 'La periodicidad')
  if (normalized !== 'SEMANAL' && normalized !== 'MENSUAL') {
    throw new Error('La periodicidad no es valida.')
  }
  return normalized
}

function normalizeOptionalInt(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  if (!Number.isInteger(parsed)) {
    throw new Error('El valor numerico no es valido.')
  }

  return parsed
}

function normalizeHoraUtc(value: FormDataEntryValue | null) {
  const normalized = normalizeRequiredText(value, 'La hora UTC')
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error('La hora UTC debe tener formato HH:MM.')
  }
  return `${normalized}:00`
}

async function registrarEventoAudit(service: ReturnType<typeof createServiceClient>, actorUsuarioId: string, registroId: string, payload: Record<string, unknown>) {
  await service.from('audit_log').insert({
    tabla: 'reporte_programado',
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: actorUsuarioId,
    cuenta_cliente_id: payload.cuenta_cliente_id ?? null,
  })
}

export async function programarReporteAutomatico(
  _previousState: ReporteProgramadoActionState,
  formData: FormData
): Promise<ReporteProgramadoActionState> {
  try {
    const actor = await requerirAdministradorActivo()
    const service = createServiceClient()
    const destinatarioEmail = normalizeEmail(formData.get('destinatario_email'))
    const seccion = normalizeRequiredText(formData.get('seccion'), 'La seccion')
    const formato = normalizeRequiredText(formData.get('formato'), 'El formato')
    const periodicidad = normalizeFrequency(formData.get('periodicidad'))
    const diaSemana = normalizeOptionalInt(formData.get('dia_semana'))
    const diaMes = normalizeOptionalInt(formData.get('dia_mes'))
    const horaUtc = normalizeHoraUtc(formData.get('hora_utc'))

    if (!isExportSectionKey(seccion)) {
      throw new Error('La seccion seleccionada no es valida.')
    }

    if (!isExportFormat(formato)) {
      throw new Error('El formato seleccionado no es valido.')
    }

    const proximaEjecucionEn = computeNextScheduledRun({
      periodicidad,
      diaSemana,
      diaMes,
      horaUtc,
    })

    const payload = {
      cuenta_cliente_id: actor.cuentaClienteId,
      creado_por_usuario_id: actor.usuarioId,
      destinatario_email: destinatarioEmail,
      seccion,
      formato,
      periodicidad,
      dia_semana: periodicidad === 'SEMANAL' ? diaSemana : null,
      dia_mes: periodicidad === 'MENSUAL' ? diaMes : null,
      hora_utc: horaUtc,
      activa: true,
      proxima_ejecucion_en: proximaEjecucionEn,
      ultimo_error: null,
      metadata: {
        creado_desde: 'reportes_ui',
      },
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await service
      .from('reporte_programado')
      .insert(payload)
      .select('id')
      .single()

    if (error || !data?.id) {
      throw new Error(error?.message ?? 'No fue posible programar el reporte.')
    }

    await registrarEventoAudit(service, actor.usuarioId, data.id, {
      accion: 'reporte_programado_creado',
      cuenta_cliente_id: actor.cuentaClienteId,
      destinatario_email: destinatarioEmail,
      seccion,
      formato,
      periodicidad,
      dia_semana: payload.dia_semana,
      dia_mes: payload.dia_mes,
      hora_utc: horaUtc,
      proxima_ejecucion_en: proximaEjecucionEn,
    })

    revalidatePath('/reportes')
    return buildState({ ok: true, message: 'Reporte automatico programado.' })
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'No fue posible programar el reporte.' })
  }
}

export async function desactivarReporteProgramado(formData: FormData) {
  const actor = await requerirAdministradorActivo()
  const service = createServiceClient()
  const scheduleId = normalizeRequiredText(formData.get('schedule_id'), 'La programacion')

  await service
    .from('reporte_programado')
    .update({ activa: false, updated_at: new Date().toISOString() })
    .eq('id', scheduleId)

  await registrarEventoAudit(service, actor.usuarioId, scheduleId, {
    accion: 'reporte_programado_desactivado',
    cuenta_cliente_id: actor.cuentaClienteId,
  })

  revalidatePath('/reportes')
}
