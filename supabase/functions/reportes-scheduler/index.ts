/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2.49.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const appUrl = (Deno.env.get('SITE_URL') ?? Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
const cronSecret = Deno.env.get('REPORTES_CRON_SECRET') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const reportesFromEmail = Deno.env.get('REPORTES_FROM_EMAIL') ?? 'reportes@beteele.local'

function parseTimeParts(horaUtc) {
  const match = String(horaUtc ?? '').match(/^(\d{2}):(\d{2})(?::\d{2})?$/)
  if (!match) {
    throw new Error('hora_utc invalida')
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  }
}

function computeNextRun(schedule, reference = new Date()) {
  const { hours, minutes } = parseTimeParts(schedule.hora_utc)

  if (schedule.periodicidad === 'SEMANAL') {
    const candidate = new Date(Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
      hours,
      minutes,
      0,
      0,
    ))
    const diffDays = (Number(schedule.dia_semana) - candidate.getUTCDay() + 7) % 7
    candidate.setUTCDate(candidate.getUTCDate() + diffDays)
    if (candidate <= reference) {
      candidate.setUTCDate(candidate.getUTCDate() + 7)
    }
    return candidate.toISOString()
  }

  let candidate = new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    Number(schedule.dia_mes),
    hours,
    minutes,
    0,
    0,
  ))
  if (candidate <= reference) {
    candidate = new Date(Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth() + 1,
      Number(schedule.dia_mes),
      hours,
      minutes,
      0,
      0,
    ))
  }
  return candidate.toISOString()
}

async function sendReportEmail({ to, subject, filename, contentType, bytes }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: reportesFromEmail,
      to: [to],
      subject,
      html: `<p>Adjuntamos el reporte programado generado automaticamente por Field Force Platform.</p>`,
      attachments: [
        {
          filename,
          content: btoa(String.fromCharCode(...bytes)),
          content_type: contentType,
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }
}

Deno.serve(async () => {
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: 'Supabase is not configured.' }, { status: 500 })
  }

  if (!appUrl || !cronSecret || !resendApiKey) {
    return Response.json({ error: 'Scheduler environment is incomplete.' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const now = new Date()
  const { data, error } = await supabase
    .from('reporte_programado')
    .select('id, cuenta_cliente_id, creado_por_usuario_id, destinatario_email, seccion, formato, periodicidad, dia_semana, dia_mes, hora_utc, proxima_ejecucion_en, activa')
    .eq('activa', true)
    .lte('proxima_ejecucion_en', now.toISOString())
    .order('proxima_ejecucion_en', { ascending: true })
    .limit(20)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const results = []
  for (const schedule of data ?? []) {
    try {
      const exportResponse = await fetch(`${appUrl}/api/reportes/scheduled-export?scheduleId=${schedule.id}`, {
        headers: {
          'x-reportes-cron-secret': cronSecret,
        },
      })

      if (!exportResponse.ok) {
        throw new Error(await exportResponse.text())
      }

      const bytes = new Uint8Array(await exportResponse.arrayBuffer())
      const filename = exportResponse.headers.get('x-report-filename') ?? `reporte-${schedule.id}.${schedule.formato}`
      const contentType = exportResponse.headers.get('content-type') ?? 'application/octet-stream'
      const periodo = new Date().toISOString().slice(0, 7)
      await sendReportEmail({
        to: schedule.destinatario_email,
        subject: `Reporte programado ${schedule.seccion} ${periodo}`,
        filename,
        contentType,
        bytes,
      })

      const nextRun = computeNextRun(schedule, now)
      await supabase
        .from('reporte_programado')
        .update({
          ultima_ejecucion_en: now.toISOString(),
          proxima_ejecucion_en: nextRun,
          ultimo_error: null,
          updated_at: now.toISOString(),
        })
        .eq('id', schedule.id)

      await supabase.from('audit_log').insert({
        tabla: 'reporte_programado',
        registro_id: schedule.id,
        accion: 'EVENTO',
        payload: {
          accion: 'reporte_programado_enviado',
          destinatario_email: schedule.destinatario_email,
          seccion: schedule.seccion,
          formato: schedule.formato,
          filename,
        },
        usuario_id: schedule.creado_por_usuario_id,
        cuenta_cliente_id: schedule.cuenta_cliente_id,
      })

      results.push({ id: schedule.id, status: 'sent', nextRun })
    } catch (error) {
      await supabase
        .from('reporte_programado')
        .update({
          ultimo_error: error instanceof Error ? error.message : 'Unknown scheduler error.',
          updated_at: now.toISOString(),
        })
        .eq('id', schedule.id)

      results.push({ id: schedule.id, status: 'error', error: error instanceof Error ? error.message : 'Unknown scheduler error.' })
    }
  }

  return Response.json({ processed: results.length, results })
})
