import { NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import {
  registerLoveAffiliationWithService,
  registrarLoveAuditEvent,
} from '@/features/love-isdin/lib/loveRegistration'

function normalizePayload(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()

  if (!raw) {
    throw new Error('El payload de LOVE ISDIN es obligatorio.')
  }

  try {
    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Payload invalido.')
    }

    return parsed as Record<string, unknown>
  } catch {
    throw new Error('No fue posible leer el payload offline de LOVE ISDIN.')
  }
}

function asString(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

export async function POST(request: Request) {
  const actor = await obtenerActorActual()

  if (!actor || actor.estadoCuenta !== 'ACTIVA') {
    return NextResponse.json({ error: 'La sesion activa no es valida para sincronizar LOVE ISDIN.' }, { status: 401 })
  }

  const formData = await request.formData()
  const payload = normalizePayload(formData.get('payload'))
  const service = createServiceClient()

  try {
    const result = await registerLoveAffiliationWithService(service, {
      id: asString(payload.id),
      cuentaClienteId: asString(payload.cuenta_cliente_id) ?? actor.cuentaClienteId ?? '',
      empleadoId: asString(payload.empleado_id) ?? actor.empleadoId,
      pdvId: asString(payload.pdv_id) ?? '',
      asistenciaId: asString(payload.asistencia_id),
      afiliadoNombre: asString(payload.afiliado_nombre) ?? '',
      afiliadoContacto: asString(payload.afiliado_contacto),
      ticketFolio: asString(payload.ticket_folio),
      fechaUtc: asString(payload.fecha_utc) ?? new Date().toISOString(),
      origen: 'OFFLINE_SYNC',
      metadata: {
        ...(payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
          ? (payload.metadata as Record<string, unknown>)
          : {}),
        sincronizado_desde: 'api_love_isdin_sync',
      },
    })

    if (result.inserted) {
      await registrarLoveAuditEvent(service, {
        cuentaClienteId: result.context.cuentaClienteId,
        actorUsuarioId: actor.usuarioId,
        registroId: result.id,
        payload: {
          evento: 'love_isdin_sync_registrado',
          empleado_id: result.context.empleadoId,
          pdv_id: result.context.pdvId,
          asistencia_id: result.context.attendanceId,
          qr_personal: result.context.qr.codigo,
          qr_codigo_id: result.context.qr.codigoId,
          qr_asignacion_id: result.context.qr.asignacionId,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      id: result.id,
      inserted: result.inserted,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'No fue posible sincronizar LOVE ISDIN.',
      },
      { status: 400 }
    )
  }
}
