import { NextResponse } from 'next/server'
import { obtenerActorActual } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import { registerVentaWithService } from '@/features/ventas/lib/ventaRegistration'

function normalizePayload(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()

  if (!raw) {
    throw new Error('El payload de ventas es obligatorio.')
  }

  try {
    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Payload invalido.')
    }

    return parsed as Record<string, unknown>
  } catch {
    throw new Error('No fue posible leer el payload offline de ventas.')
  }
}

function asString(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

function asNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function asBoolean(value: unknown) {
  return value === true || value === 'true'
}

export async function POST(request: Request) {
  const actor = await obtenerActorActual()

  if (!actor || actor.estadoCuenta !== 'ACTIVA') {
    return NextResponse.json({ error: 'La sesion activa no es valida para sincronizar ventas.' }, { status: 401 })
  }

  const service = createServiceClient()

  try {
    const contentType = request.headers.get('content-type') ?? ''
    const payload =
      contentType.includes('application/json')
        ? await request.json().then((value) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
              throw new Error('No fue posible leer el payload offline de ventas.')
            }
            return value as Record<string, unknown>
          })
        : normalizePayload((await request.formData()).get('payload'))

    const result = await registerVentaWithService(service, {
      id: asString(payload.id),
      cuentaClienteId: asString(payload.cuenta_cliente_id) ?? actor.cuentaClienteId ?? '',
      empleadoId: asString(payload.empleado_id) ?? actor.empleadoId,
      pdvId: asString(payload.pdv_id) ?? '',
      asistenciaId: asString(payload.asistencia_id),
      productoId: asString(payload.producto_id),
      productoSku: asString(payload.producto_sku),
      productoNombre: asString(payload.producto_nombre) ?? '',
      productoNombreCorto: asString(payload.producto_nombre_corto),
      fechaUtc: asString(payload.fecha_utc) ?? new Date().toISOString(),
      totalUnidades: asNumber(payload.total_unidades),
      totalMonto: asNumber(payload.total_monto),
      confirmada: asBoolean(payload.confirmada),
      validadaPorEmpleadoId: asString(payload.validada_por_empleado_id),
      validadaEn: asString(payload.validada_en),
      observaciones: asString(payload.observaciones),
      origen: 'OFFLINE_SYNC',
      metadata:
        payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
          ? (payload.metadata as Record<string, unknown>)
          : {},
    })

    return NextResponse.json({
      ok: true,
      id: result.id,
      inserted: result.inserted,
      replacedExisting: result.replacedExisting,
      fechaOperacion: result.context.fechaOperacion,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'No fue posible sincronizar la venta.',
      },
      { status: 400 }
    )
  }
}
