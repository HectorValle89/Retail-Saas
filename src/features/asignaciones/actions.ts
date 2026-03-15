'use server'

import { revalidatePath } from 'next/cache'
import { requerirAdministradorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import {
  evaluarValidacionesAsignacion,
  type SupervisorAsignacionRow,
} from './lib/assignmentValidation'

interface ActualizarEstadoAsignacionState {
  ok: boolean
  message: string | null
}

export const ESTADO_ASIGNACION_INICIAL: ActualizarEstadoAsignacionState = {
  ok: false,
  message: null,
}

interface AsignacionEstadoRow {
  id: string
  cuenta_cliente_id: string | null
  pdv_id: string
  fecha_inicio: string
  fecha_fin: string | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
}

interface GeocercaAsignacionRow {
  pdv_id: string
}

function agruparSupervisores(supervisores: SupervisorAsignacionRow[]) {
  return supervisores.reduce<Record<string, SupervisorAsignacionRow[]>>((acc, item) => {
    const current = acc[item.pdv_id] ?? []
    current.push(item)
    acc[item.pdv_id] = current
    return acc
  }, {})
}

export async function actualizarEstadoPublicacionAsignacion(
  _prevState: ActualizarEstadoAsignacionState,
  formData: FormData
): Promise<ActualizarEstadoAsignacionState> {
  await requerirAdministradorActivo()

  const asignacionId = String(formData.get('asignacion_id') ?? '').trim()
  const estadoDestino = String(formData.get('estado_destino') ?? '').trim()

  if (!asignacionId) {
    return { ok: false, message: 'La asignacion es obligatoria.' }
  }

  if (estadoDestino !== 'BORRADOR' && estadoDestino !== 'PUBLICADA') {
    return { ok: false, message: 'El estado destino no es valido.' }
  }

  const supabase = await createClient()
  const { data: asignacion, error: asignacionError } = await supabase
    .from('asignacion')
    .select('id, cuenta_cliente_id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion')
    .eq('id', asignacionId)
    .maybeSingle()

  if (asignacionError || !asignacion) {
    return {
      ok: false,
      message: asignacionError?.message ?? 'No fue posible encontrar la asignacion solicitada.',
    }
  }

  const asignacionActual = asignacion as AsignacionEstadoRow

  if (asignacionActual.estado_publicacion === estadoDestino) {
    return { ok: true, message: 'La asignacion ya tiene ese estado.' }
  }

  if (estadoDestino === 'PUBLICADA') {
    const [geocercasResult, supervisoresResult] = await Promise.all([
      supabase.from('geocerca_pdv').select('pdv_id').eq('pdv_id', asignacionActual.pdv_id),
      supabase
        .from('supervisor_pdv')
        .select('pdv_id, activo, fecha_fin')
        .eq('pdv_id', asignacionActual.pdv_id),
    ])

    if (geocercasResult.error || supervisoresResult.error) {
      return {
        ok: false,
        message:
          geocercasResult.error?.message ??
          supervisoresResult.error?.message ??
          'No fue posible validar la asignacion antes de publicarla.',
      }
    }

    const validaciones = evaluarValidacionesAsignacion(asignacionActual, {
      pdvsConGeocerca: new Set(
        ((geocercasResult.data ?? []) as GeocercaAsignacionRow[]).map((item) => item.pdv_id)
      ),
      supervisoresPorPdv: agruparSupervisores(
        (supervisoresResult.data ?? []) as SupervisorAsignacionRow[]
      ),
    })

    if (validaciones.length > 0) {
      return {
        ok: false,
        message: `No se puede publicar: ${validaciones.join(', ')}.` ,
      }
    }
  }

  const { error: updateError } = await supabase
    .from('asignacion')
    .update({
      estado_publicacion: estadoDestino,
      updated_at: new Date().toISOString(),
    })
    .eq('id', asignacionId)

  if (updateError) {
    return { ok: false, message: updateError.message }
  }

  revalidatePath('/asignaciones')
  revalidatePath('/dashboard')

  return {
    ok: true,
    message:
      estadoDestino === 'PUBLICADA'
        ? 'Asignacion publicada correctamente.'
        : 'Asignacion regresada a borrador.',
  }
}
