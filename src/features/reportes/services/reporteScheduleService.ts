import type { ActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import type { ExportFormat, ExportSectionKey } from './reporteExport'

export type ReporteProgramadoFrecuencia = 'SEMANAL' | 'MENSUAL'

interface ReporteProgramadoRow {
  id: string
  cuenta_cliente_id: string | null
  creado_por_usuario_id: string
  destinatario_email: string
  seccion: ExportSectionKey
  formato: ExportFormat
  periodicidad: ReporteProgramadoFrecuencia
  dia_semana: number | null
  dia_mes: number | null
  hora_utc: string
  activa: boolean
  ultima_ejecucion_en: string | null
  proxima_ejecucion_en: string
  ultimo_error: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface ReporteProgramadoItem {
  id: string
  cuentaClienteId: string | null
  creadoPorUsuarioId: string
  destinatarioEmail: string
  seccion: ExportSectionKey
  formato: ExportFormat
  periodicidad: ReporteProgramadoFrecuencia
  diaSemana: number | null
  diaMes: number | null
  horaUtc: string
  activa: boolean
  ultimaEjecucionEn: string | null
  proximaEjecucionEn: string
  ultimoError: string | null
  metadata: Record<string, unknown>
}

export interface ProgramacionReportesData {
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  items: ReporteProgramadoItem[]
}

function parseTimeToUtcParts(horaUtc: string) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(horaUtc)
  if (!match) {
    throw new Error('La hora UTC debe tener formato HH:MM.')
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) {
    throw new Error('La hora UTC no es valida.')
  }

  return { hours, minutes }
}

export function computeNextScheduledRun(input: {
  periodicidad: ReporteProgramadoFrecuencia
  horaUtc: string
  diaSemana?: number | null
  diaMes?: number | null
  now?: Date
}) {
  const now = input.now ?? new Date()
  const { hours, minutes } = parseTimeToUtcParts(input.horaUtc)

  if (input.periodicidad === 'SEMANAL') {
    const diaSemana = input.diaSemana
    if (diaSemana == null || diaSemana < 0 || diaSemana > 6) {
      throw new Error('El dia de semana debe estar entre 0 y 6.')
    }

    const candidate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hours,
      minutes,
      0,
      0
    ))
    const diffDays = (diaSemana - candidate.getUTCDay() + 7) % 7
    candidate.setUTCDate(candidate.getUTCDate() + diffDays)

    if (candidate <= now) {
      candidate.setUTCDate(candidate.getUTCDate() + 7)
    }

    return candidate.toISOString()
  }

  const diaMes = input.diaMes
  if (diaMes == null || diaMes < 1 || diaMes > 28) {
    throw new Error('El dia de mes debe estar entre 1 y 28.')
  }

  let candidate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    diaMes,
    hours,
    minutes,
    0,
    0
  ))

  if (candidate <= now) {
    candidate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      diaMes,
      hours,
      minutes,
      0,
      0
    ))
  }

  return candidate.toISOString()
}

export function getScheduledReportPeriod(reference = new Date()) {
  const year = reference.getUTCFullYear()
  const month = String(reference.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function mapScheduleRow(row: ReporteProgramadoRow): ReporteProgramadoItem {
  return {
    id: row.id,
    cuentaClienteId: row.cuenta_cliente_id,
    creadoPorUsuarioId: row.creado_por_usuario_id,
    destinatarioEmail: row.destinatario_email,
    seccion: row.seccion,
    formato: row.formato,
    periodicidad: row.periodicidad,
    diaSemana: row.dia_semana,
    diaMes: row.dia_mes,
    horaUtc: row.hora_utc,
    activa: row.activa,
    ultimaEjecucionEn: row.ultima_ejecucion_en,
    proximaEjecucionEn: row.proxima_ejecucion_en,
    ultimoError: row.ultimo_error,
    metadata: row.metadata ?? {},
  }
}

export async function obtenerProgramacionReportes(actor: ActorActual): Promise<ProgramacionReportesData> {
  try {
    const service = createServiceClient()
    let query = service
      .from('reporte_programado')
      .select('id, cuenta_cliente_id, creado_por_usuario_id, destinatario_email, seccion, formato, periodicidad, dia_semana, dia_mes, hora_utc, activa, ultima_ejecucion_en, proxima_ejecucion_en, ultimo_error, metadata, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (actor.cuentaClienteId) {
      query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(error.message)
    }

    return {
      infraestructuraLista: true,
      items: ((data ?? []) as ReporteProgramadoRow[]).map(mapScheduleRow),
    }
  } catch (error) {
    return {
      infraestructuraLista: false,
      mensajeInfraestructura: error instanceof Error ? error.message : 'No fue posible cargar la programacion de reportes.',
      items: [],
    }
  }
}
