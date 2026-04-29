import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildFormacionTargetingMetadata, normalizeFormacionTargetingMetadata } from '@/features/formaciones/lib/formacionTargeting'
import type { FormacionEvento } from '@/types/database'

type TypedSupabaseClient = ReturnType<typeof createServiceClient>

type ReminderEventRow = Pick<FormacionEvento, 'id' | 'cuenta_cliente_id' | 'nombre' | 'fecha_inicio' | 'fecha_fin' | 'estado' | 'metadata'>

function buildReminderMessage(eventoNombre: string, fechaInicio: string, label: string, locationAddress: string | null) {
  return `${label}: ${eventoNombre}. Fecha operativa ${fechaInicio}.${locationAddress ? ` Sede: ${locationAddress}.` : ''}`
}

async function publishReminder(
  service: TypedSupabaseClient,
  input: {
    cuentaClienteId: string
    eventoId: string
    eventoNombre: string
    fechaInicio: string
    locationAddress: string | null
    recipientIds: string[]
    reminderLabel: string
  }
) {
  const { data: message, error: messageError } = await service
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: input.cuentaClienteId,
      creado_por_usuario_id: null,
      titulo: 'Recordatorio de formación',
      cuerpo: buildReminderMessage(input.eventoNombre, input.fechaInicio, input.reminderLabel, input.locationAddress),
      tipo: 'MENSAJE',
      grupo_destino: 'TODOS_DCS',
      opciones_respuesta: [],
      metadata: {
        origen: 'formacion_evento',
        evento_id: input.eventoId,
        trigger: 'RECORDATORIO',
        reminder_label: input.reminderLabel,
      },
    })
    .select('id')
    .maybeSingle()

  if (messageError || !message?.id) {
    throw new Error(messageError?.message ?? 'No fue posible crear el mensaje recordatorio de formación.')
  }

  const { error: recipientError } = await service.from('mensaje_receptor').insert(
    input.recipientIds.map((empleadoId) => ({
      mensaje_id: message.id,
      cuenta_cliente_id: input.cuentaClienteId,
      empleado_id: empleadoId,
      estado: 'PENDIENTE' as const,
      metadata: {
        origen: 'formacion_evento',
        evento_id: input.eventoId,
        trigger: 'RECORDATORIO',
      },
    }))
  )

  if (recipientError) {
    throw new Error(recipientError.message)
  }
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.FORMACIONES_CRON_SECRET
  if (!expectedSecret || request.headers.get('x-formaciones-cron-secret') !== expectedSecret) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  try {
    const service = createServiceClient()
    const nowIso = new Date().toISOString()
    const { data, error } = await service
      .from('formacion_evento')
      .select('id, cuenta_cliente_id, nombre, fecha_inicio, fecha_fin, estado, metadata')
      .in('estado', ['PROGRAMADA', 'EN_CURSO'])
      .order('fecha_inicio', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    const eventos = (data ?? []) as ReminderEventRow[]
    let dispatched = 0

    for (const evento of eventos) {
      const targeting = normalizeFormacionTargetingMetadata(evento.metadata)
      const dueReminder = targeting.notificationPlan.reminders.find(
        (item) => item.status === 'PENDIENTE' && item.scheduledFor && item.scheduledFor <= nowIso
      )

      if (!dueReminder || targeting.notificationPlan.recipientEmployeeIds.length === 0) {
        continue
      }

      await publishReminder(service, {
        cuentaClienteId: evento.cuenta_cliente_id,
        eventoId: evento.id,
        eventoNombre: evento.nombre,
        fechaInicio: evento.fecha_inicio,
        locationAddress: targeting.locationAddress,
        recipientIds: targeting.notificationPlan.recipientEmployeeIds,
        reminderLabel: dueReminder.label,
      })

      const updatedReminders = targeting.notificationPlan.reminders.map((item) =>
        item.key === dueReminder.key
          ? {
              ...item,
              sentAt: nowIso,
              status: 'ENVIADO' as const,
            }
          : item
      )

      const nextMetadata = buildFormacionTargetingMetadata({
        eventType: targeting.eventType,
        modality: targeting.modality,
        stateNames: targeting.stateNames,
        supervisorIds: targeting.supervisorIds,
        coordinatorIds: targeting.coordinatorIds,
        pdvIds: targeting.pdvIds,
        operationDate: targeting.operationDate,
        scheduleStart: targeting.scheduleStart,
        scheduleEnd: targeting.scheduleEnd,
        primarySupervisorId: targeting.primarySupervisorId,
        primaryCoordinatorId: targeting.primaryCoordinatorId,
        supervisorName: targeting.supervisorName,
        coordinatorName: targeting.coordinatorName,
        expectedDcCount: targeting.expectedDcCount,
        expectedSupervisorCount: targeting.expectedSupervisorCount,
        expectedCoordinatorCount: targeting.expectedCoordinatorCount,
        expectedStoreCount: targeting.expectedStoreCount,
        locationAddress: targeting.locationAddress,
        locationLatitude: targeting.locationLatitude,
        locationLongitude: targeting.locationLongitude,
        locationRadiusMeters: targeting.locationRadiusMeters,
        supervisorPdvConfirmation: targeting.supervisorPdvConfirmation,
        notificationPlan: {
          initialNotificationSentAt: targeting.notificationPlan.initialNotificationSentAt,
          lastNotificationSentAt: nowIso,
          recipientEmployeeIds: targeting.notificationPlan.recipientEmployeeIds,
          reminders: updatedReminders,
        },
      })

      const { error: updateError } = await service
        .from('formacion_evento')
        .update({ metadata: nextMetadata })
        .eq('id', evento.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      dispatched += 1
    }

    return NextResponse.json({
      ok: true,
      dispatched,
      scanned: eventos.length,
      message: dispatched > 0 ? 'Recordatorios de formación enviados.' : 'No hubo recordatorios vencidos.',
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'No fue posible ejecutar los recordatorios de formación.',
      },
      { status: 500 }
    )
  }
}
